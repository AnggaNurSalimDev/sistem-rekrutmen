/**
 * Logika murni untuk tabel kandidat: label, filter, urutan, statistik.
 * Tidak menyentuh DOM supaya bisa diuji tanpa browser.
 */

export const KOMPONEN = Object.freeze([
  { kunci: 'cv', nama: 'CV', bobot: 30 },
  { kunci: 'tenure', nama: 'Lama kerja', bobot: 20 },
  { kunci: 'tes', nama: 'Tes', bobot: 30 },
  { kunci: 'anggaran', nama: 'Gaji', bobot: 10 },
  { kunci: 'waktu', nama: 'Waktu kerja', bobot: 10 },
]);

export const LABEL_FLAG = Object.freeze({
  tanpa_riwayat_kerja: 'Belum ada riwayat kerja (nilai lama kerja netral 50)',
  lama_kerja_tidak_disebut: 'Ada pekerjaan tanpa tanggal (nilai lama kerja netral 50)',
  riwayat_tidak_valid: 'Ada riwayat kerja dengan tanggal tidak masuk akal (diabaikan)',
  ekstraksi_gagal: 'Teks CV tidak bisa dibaca, perlu diisi manual',
  cv_perlu_tinjau: 'Hasil baca CV perlu dicek HR',
});

export const LABEL_STATUS = Object.freeze({
  dilamar: 'Belum tes',
  ujian: 'Sedang tes',
  selesai: 'Tes selesai',
  diterima: 'Diterima',
  ditolak: 'Ditolak',
});

export const LABEL_KAMERA = Object.freeze({
  granted: 'Kamera aktif',
  denied: 'Kamera ditolak',
  hardware_not_found: 'Tidak ada kamera',
  not_supported: 'Browser tanpa kamera',
});

export const LABEL_WAKTU = Object.freeze({ penuh: 'Bisa sepenuhnya', sebagian: 'Sebagian', tidak: 'Tidak bisa' });

/** Kandidat yang data CV-nya belum dicek HR (termasuk CV yang belum terbaca sama sekali). */
export function perluVerifikasi(k) {
  return k?.cv?.terverifikasi !== true;
}

/** Ringkasan satu kata untuk kolom CV di tabel. */
export function labelCv(k) {
  const cv = k?.cv;
  if (!cv) return 'Tidak ada CV';
  if (cv.terverifikasi) return cv.sumber === 'manual' ? 'Diisi HR' : 'Dicek HR';
  if (cv.statusEkstraksi === 'gagal') return 'Tidak terbaca';
  if (cv.statusEkstraksi === 'menunggu') return 'Belum dibaca';
  if (cv.statusEkstraksi === 'perlu_tinjau') return 'Perlu dicek';
  if (cv.sumber === 'contoh') return 'Contoh, belum dicek';
  return 'Belum dicek';
}

export const FILTER = Object.freeze({
  semua: 'Semua',
  perlu_verifikasi: 'Perlu dicek HR',
  terverifikasi: 'Sudah dicek HR',
  diputuskan: 'Sudah diputuskan',
});

export function saring(daftar, filter = 'semua', cari = '') {
  if (!Array.isArray(daftar)) return [];
  if (!(filter in FILTER)) throw new Error(`filter tidak dikenal: ${filter}`);
  const q = cari.trim().toLowerCase();
  return daftar.filter((k) => {
    if (filter === 'perlu_verifikasi' && !perluVerifikasi(k)) return false;
    if (filter === 'terverifikasi' && perluVerifikasi(k)) return false;
    if (filter === 'diputuskan' && !['diterima', 'ditolak'].includes(k.statusAplikasi)) return false;
    if (q && !`${k.nama} ${k.email}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

const PENGAMBIL = {
  skor: (k) => k.skorAkhir,
  nama: (k) => k.nama?.toLowerCase() ?? '',
  dikirim: (k) => Date.parse(k.dikirimPada) || 0,
  keluarFokus: (k) => k.integritas?.jumlahKeluarFokus ?? null,
  gaji: (k) => k.ekspektasiGaji,
};
for (const { kunci } of KOMPONEN) PENGAMBIL[kunci] = (k) => k.skor?.komponen?.[kunci] ?? null;

export const KOLOM_URUT = Object.freeze(Object.keys(PENGAMBIL));

/** Urutan stabil. Nilai kosong (null) selalu di bawah, apa pun arahnya. */
export function urutkan(daftar, kolom = 'skor', arah = 'turun') {
  const ambil = PENGAMBIL[kolom];
  if (!ambil) throw new Error(`kolom urut tidak dikenal: ${kolom}`);
  if (arah !== 'naik' && arah !== 'turun') throw new Error('arah harus naik atau turun');
  const faktor = arah === 'naik' ? 1 : -1;
  return daftar
    .map((k, i) => ({ k, i, v: ambil(k) }))
    .sort((a, b) => {
      const kosongA = a.v === null || a.v === undefined;
      const kosongB = b.v === null || b.v === undefined;
      if (kosongA !== kosongB) return kosongA ? 1 : -1;
      if (!kosongA && a.v !== b.v) return (a.v < b.v ? -1 : 1) * faktor;
      return a.i - b.i;
    })
    .map((x) => x.k);
}

/**
 * Sebaran skor akhir per rentang 10 poin (0–9, 10–19, …, 90–100).
 * Kandidat tanpa skor akhir tidak masuk sebaran tapi dihitung terpisah.
 */
export function sebaranSkor(daftar) {
  const kelompok = Array.from({ length: 10 }, (_, i) => ({
    dari: i * 10,
    sampai: i === 9 ? 100 : i * 10 + 9,
    jumlah: 0,
    sementara: 0,
  }));
  let tanpaSkor = 0;
  for (const k of daftar) {
    const s = k.skorAkhir;
    if (!Number.isFinite(s)) {
      tanpaSkor++;
      continue;
    }
    const i = Math.min(9, Math.max(0, Math.floor(s / 10)));
    kelompok[i].jumlah++;
    if (k.skor?.sementara) kelompok[i].sementara++;
  }
  return { kelompok, tanpaSkor };
}

/** Rata-rata tiap komponen, hanya dari kandidat yang komponennya sudah ada. */
export function rataRataKomponen(daftar) {
  return KOMPONEN.map(({ kunci, nama, bobot }) => {
    const nilai = daftar.map((k) => k.skor?.komponen?.[kunci]).filter(Number.isFinite);
    const rata = nilai.length ? nilai.reduce((t, v) => t + v, 0) / nilai.length : null;
    return { kunci, nama, bobot, rata: rata === null ? null : Math.round(rata * 10) / 10, jumlah: nilai.length };
  });
}

export function formatRupiah(n) {
  if (!Number.isFinite(n)) return '–';
  return `Rp${n.toLocaleString('id-ID')}`;
}

export function formatDurasi(detik) {
  if (!Number.isFinite(detik) || detik < 0) return '–';
  const m = Math.floor(detik / 60);
  const s = Math.round(detik % 60);
  return m > 0 ? `${m} mnt ${s} dtk` : `${s} dtk`;
}
