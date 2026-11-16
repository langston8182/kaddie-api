import { execFileSync } from 'child_process';
import { X509Certificate } from 'crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { validateChain } from '../../src/services/alexaVerify';

/** Chaîne de certificats fabriquée avec openssl : mêmes contrôles que pour le certificat d'Amazon. */
const dir = mkdtempSync(join(tmpdir(), 'alexa-chain-'));
const openssl = (...args: string[]) => execFileSync('openssl', args, { cwd: dir, stdio: 'pipe' });

function makeCa(name: string) {
  openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${name}.key`, '-out', `${name}.pem`, '-subj', `/CN=${name}`, '-days', '2');
}

function makeLeaf(name: string, ca: string, san: string) {
  openssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${name}.key`, '-out', `${name}.csr`, '-subj', '/CN=echo-api.amazon.com');
  writeFileSync(join(dir, `${name}.ext`), `subjectAltName=DNS:${san}\n`);
  openssl('x509', '-req', '-in', `${name}.csr`, '-CA', `${ca}.pem`, '-CAkey', `${ca}.key`, '-CAcreateserial', '-out', `${name}.pem`, '-days', '1', '-extfile', `${name}.ext`);
}

const read = (name: string) => readFileSync(join(dir, `${name}.pem`), 'utf8');

let available = true;
try {
  openssl('version');
  makeCa('ca');
  makeCa('other');
  makeLeaf('good', 'ca', 'echo-api.amazon.com');
  makeLeaf('wrongname', 'ca', 'example.com');
} catch {
  available = false;
}
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const maybe = available ? describe : describe.skip;

maybe('chaîne de certificats Alexa', () => {
  const roots = () => [new X509Certificate(read('ca'))];

  it('accepte une chaîne valide pour echo-api.amazon.com', () => {
    expect(validateChain(read('good') + read('ca'), new Date(), roots()).subject).toContain('echo-api.amazon.com');
  });

  it('refuse un certificat expiré ou pas encore valide', () => {
    expect(() => validateChain(read('good') + read('ca'), new Date(Date.now() + 10 * 86_400_000), roots())).toThrow('expiré');
    expect(() => validateChain(read('good') + read('ca'), new Date(Date.now() - 10 * 86_400_000), roots())).toThrow('expiré');
  });

  it('refuse un certificat qui n\'est pas celui d\'echo-api.amazon.com', () => {
    expect(() => validateChain(read('wrongname') + read('ca'), new Date(), roots())).toThrow('non destiné à Alexa');
  });

  it('refuse une autorité inconnue ou une chaîne dont les signatures ne se suivent pas', () => {
    expect(() => validateChain(read('good') + read('ca'), new Date(), [])).toThrow('Autorité de certification inconnue');
    expect(() => validateChain(read('good') + read('other'), new Date(), [new X509Certificate(read('other'))])).toThrow('Chaîne de certificats invalide');
  });

  it('refuse un contenu qui n\'est pas un certificat', () => {
    expect(() => validateChain('rien', new Date(), roots())).toThrow('Certificat illisible');
  });
});
