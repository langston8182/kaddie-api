import { generateKeyPairSync, createSign } from 'crypto';
import { builtinProductNames, findBuiltinProduct } from '../../src/domain/dictionary';
import { parseSpokenItems } from '../../src/domain/spokenParser';
import { validateCertUrl, validateSkillId, validateTimestamp, verifySignature } from '../../src/services/alexaVerify';
import { buildSystemPrompt, parseModelOutput, sanitizeAgainstPhrase } from '../../src/services/bedrock';
import { describeResults, spokenQuantity } from '../../src/handlers/alexa/handle';

describe('dictionnaire de base', () => {
  it('retrouve les produits comme l\'application, alias compris', () => {
    expect(findBuiltinProduct('Tomates')?.id).toBe('builtin:tomate');
    expect(findBuiltinProduct('pomme-de-terre')?.name).toBe('Pomme de terre');
    expect(findBuiltinProduct('yaourt')?.name).toBe('Yaourt nature');
    expect(findBuiltinProduct("Flocons d'avoine")?.id).toBe('builtin:flocon d avoine');
    expect(findBuiltinProduct('quelquechosedinconnu')).toBeUndefined();
    expect(builtinProductNames().length).toBeGreaterThan(1000);
  });
});

describe('analyse à règles (secours)', () => {
  it('comprend quantité, unité et plusieurs produits', () => {
    expect(parseSpokenItems('deux kilos de tomates, du lait et 500 grammes de farine')).toEqual([
      { name: 'Tomates', quantity: 2, unit: 'KG' },
      { name: 'Lait', quantity: 1, unit: 'PIECE' },
      { name: 'Farine', quantity: 500, unit: 'G' },
    ]);
    expect(parseSpokenItems('1,5 litre de lait')).toEqual([{ name: 'Lait', quantity: 1.5, unit: 'L' }]);
    expect(parseSpokenItems("une douzaine d'oeufs")).toEqual([{ name: 'Oeufs', quantity: 12, unit: 'PIECE' }]);
    expect(parseSpokenItems('33 cl de coca')).toEqual([{ name: 'Coca', quantity: 330, unit: 'ML' }]);
    expect(parseSpokenItems('')).toEqual([]);
  });
});

describe('réponse du modèle', () => {
  it('extrait le JSON même entouré de texte et rejette l\'inutilisable', () => {
    const items = parseModelOutput('Voici : {"items":[{"name":"Steak","quantity":3,"unit":"piece"},{"name":"","quantity":1},{"name":"X","quantity":-1}]} fin');
    expect(items).toEqual([{ name: 'Steak', quantity: 3, unit: 'PIECE' }]);
    expect(parseModelOutput('{"items":[{"name":"Sel","quantity":1,"unit":"TONNE"}]}')[0].unit).toBe('PIECE');
    expect(() => parseModelOutput('désolé')).toThrow();
    expect(() => parseModelOutput('{"produits":[]}')).toThrow();
  });

  it('n\'accepte une unité ou une quantité que si elles ont été dites', () => {
    const items = [
      { name: 'Flocons', quantity: 1, unit: 'PACK' as const },
      { name: 'Yaourt', quantity: 1, unit: 'L' as const },
      { name: 'Tomate', quantity: 300, unit: 'G' as const },
      { name: 'Lait', quantity: 2, unit: 'BOTTLE' as const },
    ];
    expect(sanitizeAgainstPhrase(items, '300 grammes de tomates, deux bouteilles de lait, du flocon et du yaourt')).toEqual([
      { name: 'Flocons', quantity: 1, unit: 'PIECE' },
      { name: 'Yaourt', quantity: 1, unit: 'PIECE' },
      { name: 'Tomate', quantity: 300, unit: 'G' },
      { name: 'Lait', quantity: 2, unit: 'BOTTLE' },
    ]);
    expect(sanitizeAgainstPhrase([{ name: 'Avocat', quantity: 3, unit: 'PIECE' }], 'des avocats')[0].quantity).toBe(1);
    expect(sanitizeAgainstPhrase([{ name: 'Avocat', quantity: 3, unit: 'PIECE' }], 'trois avocats')[0].quantity).toBe(3);
  });

  it('le prompt impose les unités et la liste de produits', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('PIECE, PACK, BOTTLE, KG, G, L, ML');
    expect(prompt).toContain('Tomate');
  });
});

describe('vérification des requêtes Alexa', () => {
  it('n\'accepte que les certificats publiés par Amazon', () => {
    expect(() => validateCertUrl('https://s3.amazonaws.com/echo.api/echo-api-cert-7.pem')).not.toThrow();
    expect(() => validateCertUrl('https://s3.amazonaws.com:443/echo.api/cert.pem')).not.toThrow();
    for (const bad of ['http://s3.amazonaws.com/echo.api/c.pem', 'https://s3.amazonaws.com.evil.com/echo.api/c.pem', 'https://s3.amazonaws.com/evil/c.pem', 'https://s3.amazonaws.com:8443/echo.api/c.pem', 'pas une url', undefined]) {
      expect(() => validateCertUrl(bad)).toThrow();
    }
  });

  it('refuse les requêtes trop anciennes ou datées du futur', () => {
    const now = Date.parse('2026-11-16T18:00:00Z');
    expect(() => validateTimestamp('2026-11-16T17:59:00Z', now)).not.toThrow();
    expect(() => validateTimestamp('2026-11-16T17:50:00Z', now)).toThrow();
    expect(() => validateTimestamp('2026-11-16T18:10:00Z', now)).toThrow();
    expect(() => validateTimestamp('nimporte', now)).toThrow();
    expect(() => validateTimestamp(undefined, now)).toThrow();
  });

  it('refuse une autre skill', () => {
    const body = { context: { System: { application: { applicationId: 'amzn1.ask.skill.ok' } } } };
    expect(() => validateSkillId(body, ['amzn1.ask.skill.ok'])).not.toThrow();
    expect(() => validateSkillId(body, ['amzn1.ask.skill.autre'])).toThrow();
    expect(() => validateSkillId({}, ['amzn1.ask.skill.ok'])).toThrow();
  });

  it('vérifie la signature RSA-SHA256 du corps exact', () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const body = '{"request":{"type":"LaunchRequest"}}';
    const signature = createSign('RSA-SHA256').update(body).sign(privateKey, 'base64');
    expect(verifySignature(publicKey, body, signature)).toBe(true);
    expect(verifySignature(publicKey, body + ' ', signature)).toBe(false);
    expect(verifySignature(publicKey, body, 'AAAA')).toBe(false);
  });
});

describe('phrases prononcées', () => {
  it('formule les quantités à voix haute', () => {
    expect(spokenQuantity(300, 'G', 'Tomate')).toBe('300 grammes de tomate');
    expect(spokenQuantity(1, 'KG', 'Orange')).toBe("1 kilo d'orange");
    expect(spokenQuantity(1.5, 'L', 'Lait')).toBe('1,5 litres de lait');
    expect(spokenQuantity(3, 'PIECE', 'Steak')).toBe('3 steak');
  });

  it('résume ce qui a été fait, y compris les cas particuliers', () => {
    const base = { status: 'ADDED' as const, isNewProduct: false, total: 1, totalUnit: 'PIECE' as const };
    const text = describeResults(
      'Leclerc',
      [
        { ...base, name: 'Steak', quantity: 3, unit: 'PIECE' },
        { ...base, name: 'Pain', quantity: 200, unit: 'G', status: 'UNCHANGED' },
        { ...base, name: 'Kombucha', quantity: 1, unit: 'PIECE', isNewProduct: true },
      ],
      ['je veux voir'],
    );
    expect(text).toContain("C'est fait : 3 steak, 1 kombucha, ajouté à Leclerc.");
    expect(text).toContain('Pain est déjà dans Leclerc avec une autre unité');
    expect(text).toContain('Nouveau produit : Kombucha.');
    expect(text).toContain("Je n'ai pas compris : je veux voir.");
  });
});
