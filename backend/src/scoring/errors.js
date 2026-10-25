/**
 * Error untuk input yang melanggar invariant.
 * Dipisah dari Error biasa supaya lapisan API bisa membedakan
 * "data salah dari pengguna" (400) dari bug internal (500).
 */
export class ScoringInputError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ScoringInputError';
    this.field = field;
  }
}

/** Melempar ScoringInputError jika kondisi tidak terpenuhi. */
export function pastikan(kondisi, message, field) {
  if (!kondisi) throw new ScoringInputError(message, field);
}

export function angkaHingga(nilai) {
  return typeof nilai === 'number' && Number.isFinite(nilai);
}
