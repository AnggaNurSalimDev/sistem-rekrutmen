/**
 * Rumus skor yang ditampilkan ke rekruter. Harus sama dengan scoring engine
 * di backend (backend/src/scoring); test di frontend/test memeriksa contohnya.
 *
 * - Skor satu tes  = 0 jika nilai ≤ batas bawah, 100 jika nilai ≥ target,
 *                    di antaranya (nilai − batas bawah) / (target − batas bawah) × 100.
 * - Komponen Tes   = Σ (skor tes × bobot tes), bobot semua tes berjumlah 100%.
 * - Skor akhir     = CV 30% + Lama kerja 20% + Tes 30% + Gaji 10% + Waktu kerja 10%.
 */
import { KOMPONEN } from './kandidat.js';

/**
 * Bobot rata untuk n tes dalam persen, satu angka di belakang koma, dan
 * jumlahnya PERSIS 100 (sisa pembulatan diberikan ke tes pertama).
 * 3 tes → [33.4, 33.3, 33.3].
 */
export function bagiRata(n) {
  if (!Number.isInteger(n) || n < 1) throw new Error('jumlah tes minimal 1');
  const dasar = Math.floor(1000 / n) / 10;
  const sisa = Math.round((100 - dasar * n) * 10) / 10;
  return Array.from({ length: n }, (_, i) => (i === 0 ? Math.round((dasar + sisa) * 10) / 10 : dasar));
}

export function skorSatuTes(nilai, target, batasBawah) {
  if (![nilai, target, batasBawah].every(Number.isFinite)) return null;
  if (!(target > batasBawah)) return null;
  if (nilai <= batasBawah) return 0;
  if (nilai >= target) return 100;
  return ((nilai - batasBawah) / (target - batasBawah)) * 100;
}

const bulat1 = (n) => Math.round(n * 10) / 10;
export const angkaId = (n) => (Number.isFinite(n) ? bulat1(n).toLocaleString('id-ID') : '–');

/**
 * Baris perhitungan komponen Tes dari rincian scoring engine:
 * [{ jenisTes, skor, bobot }] (bobot pecahan) → teks + total.
 */
export function rincianKomponenTes(rincian) {
  if (!Array.isArray(rincian) || rincian.length === 0) return null;
  const baris = rincian.map((r) => ({
    jenisTes: r.jenisTes,
    skor: r.skor,
    persen: bulat1(r.bobot * 100),
    hasil: r.skor * r.bobot,
  }));
  return { baris, total: baris.reduce((t, b) => t + b.hasil, 0) };
}

/** Baris perhitungan skor akhir dari komponen. null jika ada komponen kosong. */
export function rincianSkorAkhir(komponen) {
  if (!komponen) return null;
  const baris = KOMPONEN.map(({ kunci, nama, bobot }) => ({
    kunci,
    nama,
    bobot,
    nilai: komponen[kunci],
    hasil: Number.isFinite(komponen[kunci]) ? (komponen[kunci] * bobot) / 100 : null,
  }));
  if (baris.some((b) => b.hasil === null)) return null;
  return { baris, total: baris.reduce((t, b) => t + b.hasil, 0) };
}
