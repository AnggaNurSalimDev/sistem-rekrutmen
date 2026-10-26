import { parseCvRegex } from './parserRegex.js';
import { skemaHasilParser } from './skema.js';

export { ekstrakTeksPdf } from './ekstrakTeks.js';
export { parseCvRegex } from './parserRegex.js';
export { skemaHasilParser } from './skema.js';

export const MODE_PARSER = Object.freeze(['regex', 'ai', 'gabungan']);

/**
 * Memanggil parser AI dan memvalidasi output dengan skema yang sama.
 * Output tidak valid dicoba ulang satu kali.
 * @returns {Promise<{ok: true, data} | {ok: false, alasan}>}
 */
async function jalankanAi(parserAi, teks, opsi) {
  let alasan = 'Parser AI tidak mengembalikan data yang valid';
  for (let percobaan = 1; percobaan <= 2; percobaan++) {
    try {
      const hasil = skemaHasilParser.safeParse(await parserAi(teks, opsi));
      if (hasil.success) return { ok: true, data: hasil.data };
      alasan = `Output parser AI tidak sesuai skema: ${hasil.error.issues[0]?.message ?? 'tidak diketahui'}`;
    } catch (err) {
      alasan = `Parser AI gagal: ${err.message}`;
    }
  }
  return { ok: false, alasan };
}

/**
 * Titik masuk parser CV. Semua mode mengembalikan bentuk yang sama:
 * { status: 'berhasil' | 'perlu_tinjau' | 'gagal', sumber: 'regex' | 'ai' | null,
 *   skills, riwayatKerja, alasanTinjau }
 *
 * - regex:    selalu regex.
 * - ai:       selalu AI. Gagal dua kali → status 'gagal'.
 * - gabungan: regex dulu; AI hanya dipanggil jika keyakinan regex rendah.
 *             Jika AI gagal, hasil regex tetap dipakai (status 'perlu_tinjau').
 *
 * @param {object} p
 * @param {string} p.teks
 * @param {'regex'|'ai'|'gabungan'} p.mode
 * @param {(teks, opsi) => Promise<object>} [p.parserAi] wajib untuk mode ai/gabungan
 * @param {string[]} [p.skillLowongan]
 * @param {string} p.tanggalAcuan YYYY-MM-DD
 */
export async function parseCv({ teks, mode, parserAi, skillLowongan = [], tanggalAcuan }) {
  if (!MODE_PARSER.includes(mode)) throw new Error(`Mode parser tidak dikenal: ${mode}`);
  if (mode !== 'regex' && typeof parserAi !== 'function') {
    throw new Error(`Mode "${mode}" butuh parserAi, tapi parser AI belum dikonfigurasi`);
  }
  if (typeof teks !== 'string' || teks.trim() === '') {
    return { status: 'gagal', sumber: null, skills: [], riwayatKerja: [], alasanTinjau: ['Teks CV kosong'] };
  }

  const opsi = { skillLowongan, tanggalAcuan };

  if (mode === 'ai') {
    const ai = await jalankanAi(parserAi, teks, opsi);
    if (!ai.ok) return { status: 'gagal', sumber: 'ai', skills: [], riwayatKerja: [], alasanTinjau: [ai.alasan] };
    return { status: 'berhasil', sumber: 'ai', ...ai.data, alasanTinjau: [] };
  }

  const regex = parseCvRegex(teks, opsi);
  const hasilRegex = {
    status: regex.keyakinan === 'tinggi' ? 'berhasil' : 'perlu_tinjau',
    sumber: 'regex',
    skills: regex.skills,
    riwayatKerja: regex.riwayatKerja,
    alasanTinjau: regex.alasanTinjau,
  };

  if (mode === 'regex' || regex.keyakinan === 'tinggi') return hasilRegex;

  const ai = await jalankanAi(parserAi, teks, opsi);
  if (!ai.ok) {
    return { ...hasilRegex, alasanTinjau: [...hasilRegex.alasanTinjau, `${ai.alasan}; memakai hasil regex.`] };
  }
  return { status: 'berhasil', sumber: 'ai', ...ai.data, alasanTinjau: [] };
}
