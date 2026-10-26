import { parseCvRegex } from './parserRegex.js';
import { skemaHasilParser } from './skema.js';

export { ekstrakTeksPdf } from './ekstrakTeks.js';
export { parseCvRegex, rapikanSorotan } from './parserRegex.js';
export { skemaHasilParser } from './skema.js';
export { daftarPaket, paketAda, ambilPaket } from './paket/index.js';

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
 *   skills, riwayatKerja, temuanLain, sorotan, alasanTinjau }
 *
 * - regex:    data dari regex.
 * - ai:       data dari AI. Gagal dua kali → status 'gagal'.
 * - gabungan: regex dulu; AI hanya dipanggil jika keyakinan regex rendah.
 *             Jika AI gagal, hasil regex tetap dipakai (status 'perlu_tinjau').
 *
 * Sorotan dan temuan lain SELALU dari regex, di mode apa pun: posisi teks
 * dibutuhkan HR untuk memeriksa CV, dan AI tidak mengembalikan posisi.
 *
 * Status 'berhasil' bukan berarti terverifikasi. Semua hasil parser tetap
 * berlabel "sementara" sampai HR mengonfirmasi.
 */
export async function parseCv({ teks, mode, parserAi, skillLowongan = [], paket = [], tanggalAcuan }) {
  if (!MODE_PARSER.includes(mode)) throw new Error(`Mode parser tidak dikenal: ${mode}`);
  if (mode !== 'regex' && typeof parserAi !== 'function') {
    throw new Error(`Mode "${mode}" butuh parserAi, tapi parser AI belum dikonfigurasi`);
  }
  if (typeof teks !== 'string' || teks.trim() === '') {
    return {
      status: 'gagal',
      sumber: null,
      skills: [],
      riwayatKerja: [],
      temuanLain: [],
      sorotan: [],
      alasanTinjau: ['Teks CV kosong'],
    };
  }

  const regex = parseCvRegex(teks, { skillLowongan, paket, tanggalAcuan });
  const bantuBaca = { temuanLain: regex.temuanLain, sorotan: regex.sorotan };
  const hasilRegex = {
    status: regex.keyakinan === 'tinggi' ? 'berhasil' : 'perlu_tinjau',
    sumber: 'regex',
    skills: regex.skills,
    riwayatKerja: regex.riwayatKerja,
    ...bantuBaca,
    alasanTinjau: regex.alasanTinjau,
  };

  if (mode === 'regex') return hasilRegex;
  if (mode === 'gabungan' && regex.keyakinan === 'tinggi') return hasilRegex;

  const ai = await jalankanAi(parserAi, teks, { skillLowongan, paket, tanggalAcuan });
  if (ai.ok) return { status: 'berhasil', sumber: 'ai', ...ai.data, ...bantuBaca, alasanTinjau: [] };

  if (mode === 'ai') {
    return { status: 'gagal', sumber: 'ai', skills: [], riwayatKerja: [], ...bantuBaca, alasanTinjau: [ai.alasan] };
  }
  return { ...hasilRegex, alasanTinjau: [...hasilRegex.alasanTinjau, `${ai.alasan}; memakai hasil regex.`] };
}
