import { skemaHasilAi } from './ai/skema.js';
import { verifikasiHasilAi } from './verifikasi.js';

export { ekstrakTeksPdf } from './ekstrakTeks.js';
export { buatParserClaude, ErrorParserAi } from './ai/claude.js';
export { verifikasiHasilAi, rapikanSorotan } from './verifikasi.js';

export const PESAN_AI_NONAKTIF = 'Parser AI tidak aktif. Isi data CV secara manual.';

const hasilKosong = (status, alasan) => ({
  status,
  sumber: null,
  skills: [],
  riwayatKerja: [],
  rincian: { skills: [], riwayatKerja: [], temuanLain: [] },
  sorotan: [],
  alasanTinjau: [alasan],
});

/**
 * Memanggil parser AI dan memvalidasi output dengan skema.
 * Dicoba ulang satu kali, kecuali error yang pasti terulang (key salah dll).
 */
async function jalankanAi(parserAi, teks, opsi) {
  let alasan = 'Parser AI tidak mengembalikan data yang valid';
  for (let percobaan = 1; percobaan <= 2; percobaan++) {
    try {
      const hasil = skemaHasilAi.safeParse(await parserAi(teks, opsi));
      if (hasil.success) return { ok: true, data: hasil.data };
      const masalah = hasil.error.issues[0];
      alasan = `Output parser AI tidak sesuai skema (${masalah?.path.join('.') || '-'}: ${masalah?.message})`;
    } catch (err) {
      alasan = err?.message ? `Parser AI gagal: ${err.message}` : 'Parser AI gagal';
      if (err?.bisaDiulang === false) break;
    }
  }
  return { ok: false, alasan };
}

/**
 * Teks CV → data untuk cv_data dan scoring engine.
 *
 * Status:
 * - 'menunggu'     parser AI tidak aktif (tidak ada API key, misalnya di demo).
 *                  HR mengisi data manual; skor CV/Tenure null sampai diisi.
 * - 'gagal'        AI gagal dua kali / teks kosong. Lamaran tetap diterima.
 * - 'berhasil'     semua temuan terbukti lewat kutipan.
 * - 'perlu_tinjau' ada temuan dibuang, tanggal dikosongkan, atau CV mencurigakan.
 *
 * 'berhasil' BUKAN berarti terverifikasi: skor tetap berlabel sementara
 * sampai HR mengonfirmasi.
 *
 * @param {object} p
 * @param {string} p.teks hasil ekstrakTeksPdf
 * @param {Function|null} p.parserAi dari buatParserClaude, atau null jika tidak aktif
 * @param {string[]} [p.skillLowongan] skill wajib + opsional lowongan
 * @returns {Promise<{status, sumber, skills: string[], riwayatKerja, rincian, sorotan, alasanTinjau}>}
 *   riwayatKerja berbentuk input scoring engine: [{perusahaan, mulai, selesai}]
 */
export async function prosesCv({ teks, parserAi, skillLowongan = [] }) {
  if (parserAi !== null && typeof parserAi !== 'function') throw new Error('parserAi harus fungsi atau null');
  if (!Array.isArray(skillLowongan)) throw new Error('skillLowongan harus berupa array');
  if (typeof teks !== 'string' || teks.trim() === '') return hasilKosong('gagal', 'Teks CV kosong');
  if (parserAi === null) return hasilKosong('menunggu', PESAN_AI_NONAKTIF);

  const ai = await jalankanAi(parserAi, teks, { skillLowongan });
  if (!ai.ok) return { ...hasilKosong('gagal', ai.alasan), sumber: 'ai' };

  const v = verifikasiHasilAi(teks, ai.data);
  return {
    status: v.alasanTinjau.length === 0 ? 'berhasil' : 'perlu_tinjau',
    sumber: 'ai',
    skills: [...new Set(v.skills.map((s) => s.nama))],
    riwayatKerja: v.riwayatKerja.map(({ perusahaan, mulai, selesai }) => ({ perusahaan, mulai, selesai })),
    rincian: { skills: v.skills, riwayatKerja: v.riwayatKerja, temuanLain: v.temuanLain },
    sorotan: v.sorotan,
    alasanTinjau: v.alasanTinjau,
  };
}
