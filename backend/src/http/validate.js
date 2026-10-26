import { z } from 'zod';
import { HttpError, tidakDitemukan } from './errors.js';

z.config(z.locales.id());

/** Parse body/query dengan skema zod; gagal → 400 dengan daftar field. */
export function parse(skema, data) {
  const hasil = skema.safeParse(data);
  if (hasil.success) return hasil.data;
  throw new HttpError(400, 'VALIDASI', 'Data tidak valid', {
    detail: hasil.error.issues.map((i) => ({ field: i.path.join('.'), pesan: i.message })),
  });
}

const skemaUuid = z.uuid();

/**
 * Parameter :id yang bukan UUID langsung 404, supaya tidak sampai ke
 * PostgreSQL (yang akan melempar error tipe data → 500).
 */
export function idParam(nilai, apa) {
  if (!skemaUuid.safeParse(nilai).success) throw tidakDitemukan(apa);
  return nilai;
}

export { z };
