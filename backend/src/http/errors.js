import { ScoringInputError } from '../scoring/errors.js';

/** Error yang sengaja dilempar handler dan langsung jadi respons HTTP. */
export class HttpError extends Error {
  constructor(status, kode, pesan, extra = {}) {
    super(pesan);
    this.status = status;
    this.kode = kode;
    this.extra = extra;
  }
}

export const tidakDitemukan = (apa = 'Data') => new HttpError(404, 'TIDAK_DITEMUKAN', `${apa} tidak ditemukan`);
export const konflik = (pesan, extra) => new HttpError(409, 'KONFLIK', pesan, extra);
export const validasiGagal = (pesan, extra) => new HttpError(400, 'VALIDASI', pesan, extra);

/** Kode error PostgreSQL → respons yang masuk akal (bukan 500). */
function dariErrorPostgres(err) {
  switch (err.code) {
    case '23505':
      return konflik('Data yang sama sudah ada', { constraint: err.constraint });
    case '23503':
      return konflik('Data masih dipakai oleh data lain', { constraint: err.constraint });
    case '23514':
    case '23502':
      return validasiGagal('Data melanggar aturan database', { constraint: err.constraint ?? err.column });
    default:
      return null;
  }
}

export function notFoundHandler(_req, _res, next) {
  next(new HttpError(404, 'RUTE_TIDAK_ADA', 'Endpoint tidak ditemukan'));
}

export function buatErrorHandler({ log = console } = {}) {
  return function errorHandler(err, req, res, _next) {
    let e = err;

    if (err instanceof ScoringInputError) {
      e = validasiGagal(err.message, { field: err.field });
    } else if (err?.type === 'entity.parse.failed') {
      e = validasiGagal('Body bukan JSON yang valid');
    } else if (err?.type === 'entity.too.large') {
      e = new HttpError(413, 'TERLALU_BESAR', 'Body request terlalu besar');
    } else if (!(err instanceof HttpError)) {
      e = dariErrorPostgres(err) ?? err;
    }

    if (e instanceof HttpError) {
      res.status(e.status).json({ error: { kode: e.kode, pesan: e.message, ...e.extra } });
      return;
    }

    log.error(`[${req.method} ${req.originalUrl}]`, err);
    res.status(500).json({ error: { kode: 'INTERNAL', pesan: 'Terjadi kesalahan di server' } });
  };
}
