import { randomUUID } from 'crypto';
import { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { connectToDatabase } from '../../src/config/db';
import { handler as health } from '../../src/handlers/health/get';
import { handler as getLists } from '../../src/handlers/lists/getAll';
import { handler as createList } from '../../src/handlers/lists/create';
import { handler as getList } from '../../src/handlers/lists/getById';
import { handler as updateList } from '../../src/handlers/lists/update';
import { handler as deleteList } from '../../src/handlers/lists/remove';
import { handler as duplicateList } from '../../src/handlers/lists/duplicate';
import { handler as clearItems } from '../../src/handlers/lists/clearItems';
import { handler as uncheckAll } from '../../src/handlers/lists/uncheckAll';
import { handler as addItem } from '../../src/handlers/items/add';
import { handler as getItems } from '../../src/handlers/items/getAll';
import { handler as updateItem } from '../../src/handlers/items/update';
import { handler as setPurchased } from '../../src/handlers/items/setPurchased';
import { handler as removeItem } from '../../src/handlers/items/remove';
import { handler as getProducts } from '../../src/handlers/products/getAll';
import { handler as upsertProduct } from '../../src/handlers/products/upsert';
import { handler as removeProduct } from '../../src/handlers/products/remove';
import { handler as deleteAccount } from '../../src/handlers/account/remove';
import { buildEvent, clearAllCollections, startInMemoryDatabase, stopInMemoryDatabase } from '../helpers/setupTestDb';

type Call = (event: any) => Promise<APIGatewayProxyStructuredResultV2>;

function json(res: APIGatewayProxyStructuredResultV2): any {
  return res.body ? JSON.parse(res.body as string) : undefined;
}

async function call(fn: Call, opts: Parameters<typeof buildEvent>[0] = {}) {
  const res = await fn(buildEvent(opts));
  return { status: res.statusCode as number, body: json(res) };
}

async function newList(name = 'Courses', userId = 'user-1') {
  const { body } = await call(createList, { body: { name }, userId });
  return body.id as string;
}

async function add(listId: string, body: Record<string, unknown>, userId = 'user-1') {
  return call(addItem, { pathParameters: { id: listId }, body, userId });
}

beforeAll(async () => {
  await startInMemoryDatabase();
  await connectToDatabase();
});
afterAll(stopInMemoryDatabase);
beforeEach(clearAllCollections);

describe('santé et authentification', () => {
  it('health est public', async () => {
    expect((await call(health, { userId: null })).status).toBe(200);
  });

  it('refuse sans identité', async () => {
    expect((await call(getLists, { userId: null })).status).toBe(401);
  });
});

describe('listes', () => {
  it('crée, lit, renomme et supprime une liste', async () => {
    const id = randomUUID();
    const created = await call(createList, { body: { id, name: '  Courses  ' } });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ id, name: 'Courses', totalCount: 0 });

    expect((await call(createList, { body: { id, name: 'Doublon' } })).status).toBe(409);

    const renamed = await call(updateList, { pathParameters: { id }, body: { name: 'Semaine' } });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe('Semaine');

    expect((await call(getList, { pathParameters: { id } })).body.name).toBe('Semaine');
    expect((await call(deleteList, { pathParameters: { id } })).status).toBe(204);
    expect((await call(getList, { pathParameters: { id } })).status).toBe(404);
  });

  it('PUT crée la liste si elle est absente (rejouable)', async () => {
    const id = randomUUID();
    expect((await call(updateList, { pathParameters: { id }, body: { name: 'Neuve' } })).status).toBe(201);
    expect((await call(updateList, { pathParameters: { id }, body: { name: 'Neuve' } })).status).toBe(200);
  });

  it('valide le nom et les identifiants', async () => {
    expect((await call(createList, { body: { name: '   ' } })).status).toBe(400);
    expect((await call(createList, { body: { name: 'x', id: 'pas-un-uuid' } })).status).toBe(400);
    expect((await call(getList, { pathParameters: { id: 'abc' } })).status).toBe(400);
  });

  it('renvoie les compteurs de produits restants', async () => {
    const id = await newList();
    await add(id, { productId: 'p1', name: 'Lait' });
    const { body: second } = await add(id, { productId: 'p2', name: 'Pain' });
    await call(setPurchased, { pathParameters: { id, itemId: second.item.id }, body: { purchased: true } });
    const { body } = await call(getLists);
    expect(body[0]).toMatchObject({ id, totalCount: 2, remainingCount: 1 });
  });

  it('cloisonne les données par utilisateur', async () => {
    const id = await newList('Privée', 'user-1');
    expect((await call(getList, { pathParameters: { id }, userId: 'user-2' })).status).toBe(404);
    expect((await call(getLists, { userId: 'user-2' })).body).toEqual([]);
  });

  it('filtre avec updatedSince', async () => {
    await newList();
    const future = new Date(Date.now() + 60_000).toISOString();
    expect((await call(getLists, { queryStringParameters: { updatedSince: future } })).body).toEqual([]);
    expect((await call(getLists, { queryStringParameters: { updatedSince: 'nimporte' } })).status).toBe(400);
  });

  it('duplique une liste avec tous les produits à acheter', async () => {
    const id = await newList('Semaine');
    const { body: a } = await add(id, { productId: 'p1', name: 'Lait', quantity: 2, unit: 'L' });
    await call(setPurchased, { pathParameters: { id, itemId: a.item.id }, body: { purchased: true } });

    const copy = await call(duplicateList, { pathParameters: { id } });
    expect(copy.status).toBe(201);
    expect(copy.body.name).toBe('Semaine (copie)');
    expect(copy.body.items).toHaveLength(1);
    expect(copy.body.items[0]).toMatchObject({ quantity: 2, unit: 'L', isPurchased: false, purchasedQuantity: 0 });
    expect(copy.body.items[0].id).not.toBe(a.item.id);
  });

  it('vide la liste, ou seulement les achetés, et décoche tout', async () => {
    const id = await newList();
    const { body: a } = await add(id, { productId: 'p1', name: 'Lait' });
    await add(id, { productId: 'p2', name: 'Pain' });
    await call(setPurchased, { pathParameters: { id, itemId: a.item.id }, body: { purchased: true } });

    const uncheck = await call(uncheckAll, { pathParameters: { id } });
    expect(uncheck.body.modifiedCount).toBe(1);
    await call(setPurchased, { pathParameters: { id, itemId: a.item.id }, body: { purchased: true } });

    const purchasedOnly = await call(clearItems, { pathParameters: { id }, queryStringParameters: { purchased: 'true' } });
    expect(purchasedOnly.body.deletedCount).toBe(1);
    expect((await call(getItems, { pathParameters: { id } })).body).toHaveLength(1);

    const all = await call(clearItems, { pathParameters: { id } });
    expect(all.body.deletedCount).toBe(1);
    expect((await call(getList, { pathParameters: { id } })).status).toBe(200);
  });
});

describe('produits d une liste', () => {
  it('ajoute puis fusionne les quantités', async () => {
    const id = await newList();
    const first = await add(id, { productId: 'tomate', name: 'Tomate', quantity: 2 });
    expect(first.status).toBe(201);
    expect(first.body.result).toBe('ADDED');

    const second = await add(id, { productId: 'tomate', name: 'Tomates', quantity: 3 });
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ result: 'MERGED', item: { quantity: 5, name: 'Tomate' } });
    expect((await call(getItems, { pathParameters: { id } })).body).toHaveLength(1);
  });

  it('convertit les unités compatibles', async () => {
    const id = await newList();
    await add(id, { productId: 'farine', name: 'Farine', quantity: 500, unit: 'G' });
    const merged = await add(id, { productId: 'farine', name: 'Farine', quantity: 1, unit: 'KG' });
    expect(merged.body.item).toMatchObject({ quantity: 1.5, unit: 'KG' });
  });

  it('demande un arbitrage pour des unités incompatibles', async () => {
    const id = await newList();
    await add(id, { productId: 'pain', name: 'Pain', quantity: 1 });
    const conflict = await add(id, { productId: 'pain', name: 'Pain', quantity: 200, unit: 'G' });
    expect(conflict.status).toBe(409);
    expect(conflict.body.details.code).toBe('UNIT_CONFLICT');

    const kept = await add(id, { productId: 'pain', name: 'Pain', quantity: 200, unit: 'G', unitConflict: 'KEEP_EXISTING' });
    expect(kept.body).toMatchObject({ result: 'UNCHANGED', item: { quantity: 1, unit: 'PIECE' } });

    const replaced = await add(id, { productId: 'pain', name: 'Pain', quantity: 200, unit: 'G', unitConflict: 'REPLACE' });
    expect(replaced.body).toMatchObject({ result: 'MERGED', item: { quantity: 200, unit: 'G' } });
  });

  it('remet à acheter un produit acheté et garde la quantité déjà achetée', async () => {
    const id = await newList();
    const { body } = await add(id, { productId: 'pain', name: 'Pain' });
    await call(setPurchased, { pathParameters: { id, itemId: body.item.id }, body: { purchased: true } });
    const merged = await add(id, { productId: 'pain', name: 'Pain' });
    expect(merged.body.item).toMatchObject({ quantity: 2, purchasedQuantity: 1, isPurchased: false });
  });

  it('est idempotent quand le client rejoue le même identifiant', async () => {
    const id = await newList();
    const itemId = randomUUID();
    await add(id, { id: itemId, productId: 'lait', name: 'Lait', quantity: 1 });
    const replay = await add(id, { id: itemId, productId: 'lait', name: 'Lait', quantity: 1 });
    expect(replay.body).toMatchObject({ result: 'UNCHANGED', item: { quantity: 1 } });
  });

  it('gère les ajouts concurrents du même produit sans doublon', async () => {
    const id = await newList();
    await Promise.all(Array.from({ length: 6 }, () => add(id, { productId: 'oeuf', name: 'Oeufs', quantity: 1 })));
    const items = (await call(getItems, { pathParameters: { id } })).body;
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(6);
  });

  it('valide les entrées et la liste cible', async () => {
    const id = await newList();
    expect((await add(id, { productId: 'p', name: 'Lait', quantity: 0 })).status).toBe(400);
    expect((await add(id, { productId: 'p', name: 'Lait', unit: 'TONNE' })).status).toBe(400);
    expect((await add(randomUUID(), { productId: 'p', name: 'Lait' })).status).toBe(404);
  });

  it('modifie, coche et supprime un produit', async () => {
    const id = await newList();
    const { body } = await add(id, { productId: 'lait', name: 'Lait', quantity: 2 });
    const itemId = body.item.id;

    const edited = await call(updateItem, { pathParameters: { id, itemId }, body: { quantity: 3, unit: 'L', note: ' bio ' } });
    expect(edited.body).toMatchObject({ quantity: 3, unit: 'L', note: 'bio' });
    expect((await call(updateItem, { pathParameters: { id, itemId }, body: {} })).status).toBe(400);

    const bought = await call(setPurchased, { pathParameters: { id, itemId }, body: { purchased: true } });
    expect(bought.body).toMatchObject({ isPurchased: true, purchasedQuantity: 3 });
    const raised = await call(updateItem, { pathParameters: { id, itemId }, body: { quantity: 4 } });
    expect(raised.body).toMatchObject({ isPurchased: false, purchasedQuantity: 3 });
    expect((await call(setPurchased, { pathParameters: { id, itemId }, body: {} })).status).toBe(400);

    expect((await call(removeItem, { pathParameters: { id, itemId } })).status).toBe(204);
    expect((await call(removeItem, { pathParameters: { id, itemId } })).status).toBe(404);
  });

  it('supprime les produits avec la liste', async () => {
    const id = await newList();
    await add(id, { productId: 'p', name: 'Lait' });
    await call(deleteList, { pathParameters: { id } });
    const recreated = await call(updateList, { pathParameters: { id }, body: { name: 'Nouvelle' } });
    expect(recreated.status).toBe(201);
    expect((await call(getItems, { pathParameters: { id } })).body).toEqual([]);
  });
});

describe('produits personnels', () => {
  it('crée, met à jour et empêche les doublons équivalents', async () => {
    const id = randomUUID();
    const created = await call(upsertProduct, { pathParameters: { id }, body: { name: 'quinoa royal', category: 'epicerie' } });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Quinoa royal', category: 'epicerie' });

    const dup = await call(upsertProduct, { pathParameters: { id: randomUUID() }, body: { name: 'Quinoas Royal' } });
    expect(dup.status).toBe(409);
    expect(dup.body.details.existing.id).toBe(id);

    expect((await call(upsertProduct, { pathParameters: { id }, body: { name: 'Quinoa rouge' } })).status).toBe(200);
    expect((await call(getProducts)).body).toHaveLength(1);
    expect((await call(upsertProduct, { pathParameters: { id: randomUUID() }, body: { name: 'x', category: 'inconnue' } })).status).toBe(400);
  });

  it('incrémente le compteur d usage et protège les produits utilisés', async () => {
    const productId = randomUUID();
    await call(upsertProduct, { pathParameters: { id: productId }, body: { name: 'Kombucha' } });
    const listId = await newList();
    await add(listId, { productId, name: 'Kombucha' });
    await add(listId, { productId, name: 'Kombucha' });
    expect((await call(getProducts)).body[0].usageCount).toBe(2);
    expect((await call(removeProduct, { pathParameters: { id: productId } })).status).toBe(409);
    await call(clearItems, { pathParameters: { id: listId } });
    expect((await call(removeProduct, { pathParameters: { id: productId } })).status).toBe(204);
  });
});

describe('compte', () => {
  it('supprime toutes les données de l utilisateur sans toucher aux autres', async () => {
    const mine = await newList('Mienne', 'user-1');
    await add(mine, { productId: 'p', name: 'Lait' }, 'user-1');
    await newList('Autre', 'user-2');

    expect((await call(deleteAccount, { userId: 'user-1' })).status).toBe(204);
    expect((await call(getLists, { userId: 'user-1' })).body).toEqual([]);
    expect((await call(getLists, { userId: 'user-2' })).body).toHaveLength(1);
  });
});
