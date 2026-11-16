import { randomUUID } from 'crypto';
import { connectToDatabase } from '../../src/config/db';
import { AlexaDeps, createHandler, respond } from '../../src/handlers/alexa/handle';
import { SpokenItem, parseSpokenItems } from '../../src/domain/spokenParser';
import { ProductModel } from '../../src/models/product.model';
import { ShoppingItemModel } from '../../src/models/shoppingItem.model';
import { ShoppingListModel } from '../../src/models/shoppingList.model';
import { clearAllCollections, startInMemoryDatabase, stopInMemoryDatabase } from '../helpers/setupTestDb';

const SKILL = 'amzn1.ask.skill.test';
const NOW = Date.parse('2026-11-16T18:00:00Z');

let extractor: (phrase: string) => Promise<SpokenItem[]>;
const deps: AlexaDeps = {
  verifyRequest: async () => undefined,
  skillIds: () => [SKILL],
  userFromToken: async (token) => {
    if (token === 'bad') throw new Error('jeton invalide');
    return token;
  },
  extract: (phrase) => extractor(phrase),
  now: () => NOW,
};

const addBody = (phrase: string, token = 'user-1') => ({
  version: '1.0',
  context: { System: { application: { applicationId: SKILL }, user: token ? { accessToken: token } : {} } },
  request: { type: 'IntentRequest', timestamp: '2026-11-16T18:00:00Z', intent: { name: 'AddIntent', slots: { produits: { name: 'produits', value: phrase } } } },
});

const speech = (r: any): string => r.response.outputSpeech?.text ?? '';

beforeAll(async () => {
  await startInMemoryDatabase();
  await connectToDatabase();
});
afterAll(stopInMemoryDatabase);
beforeEach(async () => {
  await clearAllCollections();
  extractor = async (phrase) => parseSpokenItems(phrase);
});

async function newList(name: string, userId = 'user-1') {
  const id = randomUUID();
  await ShoppingListModel.create({ userId, id, name });
  return id;
}

describe('requêtes Alexa', () => {
  it('ajoute plusieurs produits à la liste la plus récente, avec les identifiants du dictionnaire', async () => {
    const old = await newList('Ancienne');
    const recent = await newList('Leclerc');
    // Hors Mongoose, qui réécrit updatedAt à chaque mise à jour.
    await ShoppingListModel.collection.updateOne({ id: old }, { $set: { updatedAt: new Date(Date.now() - 86_400_000) } });

    const reply = await respond(addBody('trois steaks et 300 grammes de tomates'), deps);

    expect(reply.response.shouldEndSession).toBe(true);
    expect(speech(reply)).toContain("C'est fait : 3 steak, 300 grammes de tomate, ajouté à Leclerc.");
    const items = await ShoppingItemModel.find({ userId: 'user-1', listId: recent }).sort({ createdAt: 1 }).lean();
    expect(items.map((i: any) => [i.productId, i.name, i.quantity, i.unit])).toEqual([
      ['builtin:steak', 'Steak', 3, 'PIECE'],
      ['builtin:tomate', 'Tomate', 300, 'G'],
    ]);
    expect(await ShoppingItemModel.countDocuments({ listId: old })).toBe(0);
  });

  it('fusionne avec ce qui est déjà dans la liste, comme dans l\'application', async () => {
    await newList('Leclerc');
    await respond(addBody('2 kilos de tomates'), deps);
    await respond(addBody('500 grammes de tomates'), deps);
    const items = await ShoppingItemModel.find({ userId: 'user-1' }).lean();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ quantity: 2.5, unit: 'KG' });
  });

  it('ne touche pas à une quantité existante quand les unités sont incompatibles', async () => {
    await newList('Leclerc');
    await respond(addBody('un pain'), deps);
    const reply = await respond(addBody('200 grammes de pain'), deps);
    expect(speech(reply)).toContain('Pain est déjà dans Leclerc avec une autre unité');
    expect(await ShoppingItemModel.findOne({ userId: 'user-1' })).toMatchObject({ quantity: 1, unit: 'PIECE' });
  });

  it('crée la liste « Courses » si l\'utilisateur n\'en a aucune', async () => {
    const reply = await respond(addBody('du lait'), deps);
    expect(speech(reply)).toContain('ajouté à Courses');
    expect(await ShoppingListModel.countDocuments({ userId: 'user-1', name: 'Courses' })).toBe(1);
  });

  it('crée un produit personnel inconnu, une seule fois, et refuse les phrases prises pour des produits', async () => {
    await newList('Leclerc');
    const reply = await respond(addBody('du kombucha au gingembre'), deps);
    expect(speech(reply)).toContain('Nouveau produit : Kombucha au gingembre');
    await respond(addBody('du kombucha au gingembre'), deps);
    expect(await ProductModel.countDocuments({ userId: 'user-1' })).toBe(1);

    extractor = async () => [{ name: 'Je veux que tu me rappelles de sortir les poubelles', quantity: 1, unit: 'PIECE' }];
    const refused = await respond(addBody('blabla'), deps);
    expect(speech(refused)).toContain("Je n'ai pas compris");
    expect(await ProductModel.countDocuments({ userId: 'user-1' })).toBe(1);
  });

  it('se rabat sur l\'analyse à règles quand le modèle échoue', async () => {
    await newList('Leclerc');
    extractor = async () => {
      throw new Error('Bedrock indisponible');
    };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const reply = await respond(addBody('deux kilos de pommes de terre'), deps);
    warn.mockRestore();
    expect(speech(reply)).toContain('2 kilos de pomme de terre');
    expect(await ShoppingItemModel.findOne({ userId: 'user-1' })).toMatchObject({ productId: 'builtin:pomme de terre', quantity: 2, unit: 'KG' });
  });

  it('demande de lier le compte sans jeton ou avec un jeton invalide, sans rien écrire', async () => {
    for (const token of ['', 'bad']) {
      const reply = await respond(addBody('du lait', token), deps);
      expect(reply.response.card).toEqual({ type: 'LinkAccount' });
    }
    expect(await ShoppingItemModel.countDocuments()).toBe(0);
  });

  it('cloisonne les utilisateurs', async () => {
    await newList('À moi', 'user-1');
    await newList('À elle', 'user-2');
    await respond(addBody('du lait', 'user-2'), deps);
    expect(await ShoppingItemModel.countDocuments({ userId: 'user-1' })).toBe(0);
    expect(await ShoppingItemModel.countDocuments({ userId: 'user-2' })).toBe(1);
  });

  it('gère lancement, aide, arrêt et phrase vide', async () => {
    const launch = await respond({ request: { type: 'LaunchRequest' } }, deps);
    expect(launch.response.shouldEndSession).toBe(false);
    const help = await respond({ request: { type: 'IntentRequest', intent: { name: 'AMAZON.HelpIntent' } } }, deps);
    expect(speech(help)).toContain('ajoute trois steaks');
    const stop = await respond({ request: { type: 'IntentRequest', intent: { name: 'AMAZON.StopIntent' } } }, deps);
    expect(stop.response.shouldEndSession).toBe(true);
    extractor = async () => [];
    expect(speech(await respond(addBody('bonjour'), deps))).toContain("Je n'ai pas trouvé de produit");
    expect(await respond({ request: { type: 'SessionEndedRequest' } }, deps)).toEqual({ version: '1.0', response: {} });
  });
});

describe('point d\'entrée HTTP', () => {
  const event = (body: unknown) => ({ body: JSON.stringify(body), isBase64Encoded: false, headers: {} }) as any;

  it('répond 200 pour une requête valide et rejette skill étrangère, requête ancienne et signature invalide', async () => {
    await newList('Leclerc');
    const handler = createHandler(deps);
    const ok = (await handler(event(addBody('du lait')))) as any;
    expect(ok.statusCode).toBe(200);
    expect(JSON.parse(ok.body).response.outputSpeech.text).toContain('ajouté à Leclerc');

    const foreign = addBody('du lait');
    foreign.context.System.application.applicationId = 'amzn1.ask.skill.autre';
    expect(((await handler(event(foreign))) as any).statusCode).toBe(403);

    const old = addBody('du lait');
    old.request.timestamp = '2026-11-16T17:00:00Z';
    expect(((await handler(event(old))) as any).statusCode).toBe(400);

    const badSignature = createHandler({ ...deps, verifyRequest: async () => { throw Object.assign(new Error('Signature invalide'), { statusCode: 400 }); } });
    expect(((await badSignature(event(addBody('du lait')))) as any).statusCode).toBeGreaterThanOrEqual(400);
    expect(await ShoppingItemModel.countDocuments()).toBe(1);
  });

  it('refuse tout si la skill n\'est pas configurée', async () => {
    const handler = createHandler({ ...deps, skillIds: () => [] });
    expect(((await handler(event(addBody('du lait')))) as any).statusCode).toBe(500);
  });
});
