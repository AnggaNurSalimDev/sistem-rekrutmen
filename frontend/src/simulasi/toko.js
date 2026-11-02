/*
 * "Database" mode simulasi: satu objek JS yang menampung semua tabel
 * (users, lowongan, lowongan_tes, soal, kandidat, cv_data, jawaban_kandidat,
 * ujian_teknis, integritas, sesi_ujian), disimpan di localStorage browser
 * pengunjung. Tidak ada server, tidak ada data yang keluar dari browser itu.
 *
 *   seed.json (dibuat sekali lewat skrip Node, lihat backend/scripts/)
 *        │  dimuat saat toko kosong / versinya beda dari yang tersimpan
 *        ▼
 *   toko (di memori)  ──setiap mutasi──▶  localStorage[KUNCI]
 *
 * Nama kolom sengaja snake_case, sama seperti baris PostgreSQL asli,
 * supaya fungsi tampilkanXxx() di rute/*.js bisa disalin nyaris apa adanya
 * dari backend/src/routes/*.js.
 */
import seed from './data/seed.json';

const KUNCI = 'rekrut-simulasi-v1';

function muat() {
  try {
    const teks = window.localStorage.getItem(KUNCI);
    if (!teks) return structuredClone(seed.toko);
    const tersimpan = JSON.parse(teks);
    // Seed baru dirilis (lewat deploy) → data lama di browser pengunjung diganti yang baru.
    if (tersimpan.versi !== seed.versi) return structuredClone(seed.toko);
    return tersimpan;
  } catch {
    return structuredClone(seed.toko);
  }
}

let toko = muat();
let simpanTertunda = null;

function simpan() {
  // Beberapa mutasi dalam satu tugas mikro digabung jadi satu tulis localStorage.
  if (simpanTertunda) return;
  simpanTertunda = Promise.resolve().then(() => {
    simpanTertunda = null;
    try {
      window.localStorage.setItem(KUNCI, JSON.stringify(toko));
    } catch {
      /* penyimpanan penuh/tidak tersedia: perubahan hanya hidup sampai halaman ditutup */
    }
  });
}

/** Kembalikan seluruh toko ke data bawaan (dipanggil dari halaman "atur tampilan" atau tombol reset). */
export function resetSimulasi() {
  toko = structuredClone(seed.toko);
  try {
    window.localStorage.removeItem(KUNCI);
  } catch {
    /* abaikan */
  }
}

export function idBaru() {
  return crypto.randomUUID();
}

export function sekarang() {
  return new Date().toISOString();
}

/** "YYYY-MM-DD" di hari ini, dipakai scoring engine untuk "masih bekerja → dihitung sampai sini". */
export function tanggalHariIni() {
  return new Date().toLocaleDateString('en-CA');
}

// ---------------------------------------------------------------- akses generik

/** @returns {Array} salinan referensi langsung ke array koleksi (mutasi in-place lalu panggil simpan()). */
export function tabel(nama) {
  return toko[nama];
}

export function tandaiBerubah() {
  simpan();
}

export function cari(nama, cocok) {
  return toko[nama].find(cocok) ?? null;
}

export function cariSemua(nama, cocok) {
  return toko[nama].filter(cocok);
}

export function tambah(nama, baris) {
  toko[nama].push(baris);
  simpan();
  return baris;
}

export function hapusBaris(nama, cocok) {
  const sebelum = toko[nama].length;
  toko[nama] = toko[nama].filter((b) => !cocok(b));
  if (toko[nama].length !== sebelum) simpan();
  return sebelum - toko[nama].length;
}
