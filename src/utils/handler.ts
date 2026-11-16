import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { connectToDatabase } from '../config/db';
import { error, success } from './response';
import { HttpError, isValidUuid } from './validation';

export interface ApiContext {
  event: APIGatewayProxyEventV2;
  userId: string;
  params: Record<string, string>;
  query: Record<string, string>;
  /** Corps JSON désérialisé (objet vide si absent). */
  body: Record<string, any>;
}

type ApiFn = (ctx: ApiContext) => Promise<APIGatewayProxyStructuredResultV2>;

/**
 * Identité de l'appelant.
 * L'authentification (Cognito) n'est pas encore branchée : seul l'en-tête `x-user-id` est accepté,
 * et uniquement si ALLOW_DEV_USER_HEADER=true. C'est le point d'extension à remplacer plus tard
 * (claim `sub` d'un JWT validé).
 */
export async function resolveUserId(event: APIGatewayProxyEventV2): Promise<string> {
  if (process.env.ALLOW_DEV_USER_HEADER === 'true') {
    const header = event.headers?.['x-user-id'];
    if (header && header.length <= 128) return header;
  }
  throw new HttpError(401, 'Authentification requise');
}

function parseBody(event: APIGatewayProxyEventV2): Record<string, any> {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'Corps JSON invalide');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HttpError(400, 'Le corps doit être un objet JSON');
  }
  return parsed as Record<string, any>;
}

/** Enveloppe commune des lambdas : auth, connexion DB, parsing et gestion centralisée des erreurs. */
export function api(fn: ApiFn, options: { auth?: boolean; db?: boolean } = {}) {
  const auth = options.auth !== false;
  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    try {
      const userId = auth ? await resolveUserId(event) : '';
      const body = parseBody(event);
      if (options.db !== false) await connectToDatabase();
      return await fn({
        event,
        userId,
        params: (event.pathParameters ?? {}) as Record<string, string>,
        query: (event.queryStringParameters ?? {}) as Record<string, string>,
        body,
      });
    } catch (err: any) {
      if (err instanceof HttpError) return error(err.statusCode, err.message, err.details);
      if (err?.name === 'ValidationError') return error(400, 'Données invalides', err.errors);
      if (err?.name === 'CastError') return error(400, 'Identifiant invalide');
      if (err?.code === 11000) return error(409, 'Conflit : ressource déjà existante');
      console.error(err);
      return error(500, 'Erreur interne du serveur');
    }
  };
}

export function requireId(ctx: ApiContext, name = 'id'): string {
  const id = ctx.params[name];
  if (!isValidUuid(id)) throw new HttpError(400, 'Identifiant invalide');
  return id;
}

/** Date `updatedSince` (ISO 8601) optionnelle, pour les lectures incrémentales. */
export function updatedSince(ctx: ApiContext): Date | undefined {
  const raw = ctx.query.updatedSince;
  if (!raw) return undefined;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new HttpError(400, 'updatedSince invalide (ISO 8601 attendu)');
  return date;
}

export function ok<T>(data: T) {
  return success(200, data);
}
