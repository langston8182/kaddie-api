const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Les identifiants sont des UUID générés par le client (compatibles avec une synchronisation hors ligne). */
export function isValidUuid(id: string | undefined | null): id is string {
  return !!id && UUID_RE.test(id);
}

export class HttpError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

type Source = Record<string, any>;

interface StringOpts {
  required?: boolean;
  min?: number;
  max?: number;
}

interface NumberOpts {
  required?: boolean;
  min?: number;
  max?: number;
  /** Borne basse exclusive (ex. quantité strictement positive). */
  exclusiveMin?: number;
}

/**
 * Accumule les erreurs de validation d'un payload puis les remonte en une seule 400.
 * Les méthodes renvoient `undefined` quand le champ est absent (mise à jour partielle).
 */
export class Checker {
  readonly errors: Record<string, string> = {};

  private fail(field: string, message: string): undefined {
    this.errors[field] = message;
    return undefined;
  }

  string(src: Source, field: string, opts: StringOpts = {}): string | undefined {
    const value = src[field];
    if (value === undefined || value === null) {
      if (opts.required) this.fail(field, 'Champ obligatoire');
      return undefined;
    }
    if (typeof value !== 'string') return this.fail(field, 'Doit être une chaîne');
    const out = value.trim();
    if (opts.required && !out) return this.fail(field, 'Ne doit pas être vide');
    if (opts.min !== undefined && out.length < opts.min) return this.fail(field, `Minimum ${opts.min} caractères`);
    if (opts.max !== undefined && out.length > opts.max) return this.fail(field, `Maximum ${opts.max} caractères`);
    return out;
  }

  number(src: Source, field: string, opts: NumberOpts = {}): number | undefined {
    const value = src[field];
    if (value === undefined || value === null) {
      if (opts.required) this.fail(field, 'Champ obligatoire');
      return undefined;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) return this.fail(field, 'Doit être un nombre');
    if (opts.min !== undefined && value < opts.min) return this.fail(field, `Minimum ${opts.min}`);
    if (opts.exclusiveMin !== undefined && value <= opts.exclusiveMin) return this.fail(field, `Doit être supérieur à ${opts.exclusiveMin}`);
    if (opts.max !== undefined && value > opts.max) return this.fail(field, `Maximum ${opts.max}`);
    return value;
  }

  boolean(src: Source, field: string, required = false): boolean | undefined {
    const value = src[field];
    if (value === undefined || value === null) {
      if (required) this.fail(field, 'Champ obligatoire');
      return undefined;
    }
    if (typeof value !== 'boolean') return this.fail(field, 'Doit être un booléen');
    return value;
  }

  oneOf<T extends string>(src: Source, field: string, allowed: readonly T[], required = false): T | undefined {
    const value = src[field];
    if (value === undefined || value === null) {
      if (required) this.fail(field, 'Champ obligatoire');
      return undefined;
    }
    if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
      return this.fail(field, `Valeur attendue : ${allowed.join(', ')}`);
    }
    return value as T;
  }

  uuid(src: Source, field: string, required = false): string | undefined {
    const value = src[field];
    if (value === undefined || value === null) {
      if (required) this.fail(field, 'Champ obligatoire');
      return undefined;
    }
    if (typeof value !== 'string' || !isValidUuid(value)) return this.fail(field, 'UUID invalide');
    return value;
  }

  /** Lève une 400 si au moins un champ est invalide. */
  assert(): void {
    if (Object.keys(this.errors).length > 0) {
      throw new HttpError(400, 'Données invalides', this.errors);
    }
  }
}
