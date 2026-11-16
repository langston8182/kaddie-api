export const UNITS = ['PIECE', 'PACK', 'BOTTLE', 'KG', 'G', 'L', 'ML'] as const;
export type Unit = (typeof UNITS)[number];

export const CATEGORIES = [
  'fruits_legumes',
  'viandes_poissons',
  'produits_laitiers',
  'epicerie',
  'boissons',
  'surgeles',
  'boulangerie',
  'hygiene',
  'entretien',
  'autres',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const UNIT_CONFLICT_RESOLUTIONS = ['REPLACE', 'KEEP_EXISTING'] as const;
export type UnitConflictResolution = (typeof UNIT_CONFLICT_RESOLUTIONS)[number];

type Dimension = 'PIECE' | 'PACK' | 'BOTTLE' | 'MASS' | 'VOLUME';

/** `factor` convertit une unité vers l'unité de base de sa dimension (g pour la masse, mL pour le volume). */
export const UNIT_INFO: Record<Unit, { dimension: Dimension; factor: number }> = {
  PIECE: { dimension: 'PIECE', factor: 1 },
  PACK: { dimension: 'PACK', factor: 1 },
  BOTTLE: { dimension: 'BOTTLE', factor: 1 },
  KG: { dimension: 'MASS', factor: 1000 },
  G: { dimension: 'MASS', factor: 1 },
  L: { dimension: 'VOLUME', factor: 1000 },
  ML: { dimension: 'VOLUME', factor: 1 },
};
