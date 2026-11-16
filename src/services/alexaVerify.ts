import { X509Certificate, createVerify } from 'crypto';
import { rootCertificates } from 'tls';
import { HttpError } from '../utils/validation';

/** Vérifications imposées par Amazon pour tout endpoint HTTPS d'une skill (https://developer.amazon.com/fr-FR/docs/alexa/custom-skills/host-a-custom-skill-as-a-web-service.html). */

const MAX_AGE_MS = 150_000;
const CERT_CACHE_MS = 60 * 60 * 1000;

export function validateCertUrl(raw: string | undefined): URL {
  let url: URL;
  try {
    url = new URL(raw ?? '');
  } catch {
    throw new HttpError(400, 'Adresse du certificat invalide');
  }
  const okPort = url.port === '' || url.port === '443';
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 's3.amazonaws.com' || !url.pathname.startsWith('/echo.api/') || !okPort) {
    throw new HttpError(400, 'Adresse du certificat invalide');
  }
  return url;
}

export function validateTimestamp(timestamp: unknown, now = Date.now()): void {
  const time = typeof timestamp === 'string' ? Date.parse(timestamp) : NaN;
  if (Number.isNaN(time) || Math.abs(now - time) > MAX_AGE_MS) throw new HttpError(400, 'Requête trop ancienne');
}

export function validateSkillId(body: any, allowed: string[]): void {
  const applicationId = body?.context?.System?.application?.applicationId ?? body?.session?.application?.applicationId;
  if (!applicationId || !allowed.includes(applicationId)) throw new HttpError(403, 'Skill non autorisée');
}

let roots: X509Certificate[] | undefined;
function trustedRoots(): X509Certificate[] {
  roots ??= rootCertificates.map((pem) => new X509Certificate(pem));
  return roots;
}

/** Valide la chaîne (dates, nom echo-api.amazon.com, signatures) jusqu'à une autorité racine reconnue. */
export function validateChain(pem: string, now = new Date(), roots: X509Certificate[] = trustedRoots()): X509Certificate {
  const blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
  if (!blocks || blocks.length === 0) throw new HttpError(400, 'Certificat illisible');
  const chain = blocks.map((b) => new X509Certificate(b));
  for (const cert of chain) {
    if (now < new Date(cert.validFrom) || now > new Date(cert.validTo)) throw new HttpError(400, 'Certificat expiré');
  }
  const leaf = chain[0];
  if (!leaf.subjectAltName?.split(',').some((s) => s.trim() === 'DNS:echo-api.amazon.com')) {
    throw new HttpError(400, 'Certificat non destiné à Alexa');
  }
  for (let i = 0; i < chain.length - 1; i++) {
    if (!chain[i].checkIssued(chain[i + 1]) || !chain[i].verify(chain[i + 1].publicKey)) {
      throw new HttpError(400, 'Chaîne de certificats invalide');
    }
  }
  const last = chain[chain.length - 1];
  const trusted = roots.some((root) => root.fingerprint256 === last.fingerprint256 || (last.checkIssued(root) && last.verify(root.publicKey)));
  if (!trusted) throw new HttpError(400, 'Autorité de certification inconnue');
  return leaf;
}

export function verifySignature(publicKey: X509Certificate['publicKey'], rawBody: string, signatureBase64: string): boolean {
  try {
    return createVerify('RSA-SHA256').update(rawBody).verify(publicKey, signatureBase64, 'base64');
  } catch {
    return false;
  }
}

type FetchCert = (url: string) => Promise<string>;

const defaultFetch: FetchCert = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new HttpError(400, 'Certificat introuvable');
  return response.text();
};

const certCache = new Map<string, { leaf: X509Certificate; expires: number }>();

/** Vérifie que le corps brut a bien été signé par Amazon (en-têtes `signaturecertchainurl` et `signature-256`). */
export async function verifyAlexaRequest(
  headers: Record<string, string | undefined>,
  rawBody: string,
  fetchCert: FetchCert = defaultFetch,
): Promise<void> {
  const url = validateCertUrl(headers['signaturecertchainurl']);
  const signature = headers['signature-256'];
  if (!signature) throw new HttpError(400, 'Signature manquante');

  const cached = certCache.get(url.href);
  let leaf = cached && cached.expires > Date.now() ? cached.leaf : undefined;
  if (!leaf) {
    leaf = validateChain(await fetchCert(url.href));
    certCache.set(url.href, { leaf, expires: Date.now() + CERT_CACHE_MS });
  }
  if (!verifySignature(leaf.publicKey, rawBody, signature)) throw new HttpError(400, 'Signature invalide');
}
