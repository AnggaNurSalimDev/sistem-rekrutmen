/**
 * Error simulasi dengan bentuk persis seperti HttpError backend
 * (src/http/errors.js), supaya router (lihat index.js) bisa mengubahnya
 * menjadi { status, data: { error: { kode, pesan, ...extra } } } —
 * sama persis dengan yang dibaca ErrorApi di api/klien.js.
 */
export class GalatSimulasi extends Error {
  constructor(status, kode, pesan, extra = {}) {
    super(pesan);
    this.status = status;
    this.kode = kode;
    this.extra = extra;
  }
}

export const tidakDitemukan = (apa = 'Data') => new GalatSimulasi(404, 'TIDAK_DITEMUKAN', `${apa} tidak ditemukan`);
export const konflik = (pesan, extra) => new GalatSimulasi(409, 'KONFLIK', pesan, extra);
export const validasiGagal = (pesan, extra) => new GalatSimulasi(400, 'VALIDASI', pesan, extra);
export const dilarang = (pesan) => new GalatSimulasi(403, 'DILARANG', pesan);

/** Dipakai handler untuk mengubah ScoringInputError (lihat mesin/scoring/errors.js) jadi 400. */
export function dariErrorValidasiSkor(err) {
  if (err?.name === 'ScoringInputError') return validasiGagal(err.message, { field: err.field });
  return null;
}

const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parameter :id yang bukan UUID langsung 404 (meniru http/validate.js:idParam). */
export function idParam(nilai, apa) {
  if (typeof nilai !== 'string' || !POLA_UUID.test(nilai)) throw tidakDitemukan(apa);
  return nilai;
}
