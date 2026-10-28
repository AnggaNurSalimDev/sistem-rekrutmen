import { KOMPONEN, LABEL_KAMERA, LABEL_STATUS, LABEL_WAKTU, labelCv } from './kandidat.js';

/**
 * Ekspor tabel kandidat ke CSV, dibuat di browser (data tidak dikirim ke mana pun).
 *
 * - Pemisah titik koma: Excel dengan pengaturan Indonesia membaca koma
 *   sebagai desimal, jadi CSV berpemisah koma akan jadi satu kolom.
 * - Diawali BOM UTF-8 supaya Excel membaca huruf non-ASCII dengan benar.
 * - Sel yang diawali = + - @ diberi tanda kutip tunggal di depan supaya
 *   tidak dijalankan sebagai rumus (CSV injection). Nama dan email berasal
 *   dari pelamar, jadi tidak bisa dipercaya.
 */

const PEMISAH = ';';

export function selAman(nilai) {
  if (nilai === null || nilai === undefined) return '';
  let s = typeof nilai === 'number' ? String(nilai).replace('.', ',') : String(nilai);
  if (typeof nilai !== 'number' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[";\r\n]/.test(s) || s.includes(PEMISAH)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

const KOLOM = [
  ['Nama', (k) => k.nama],
  ['Email', (k) => k.email],
  ['Nomor kontak', (k) => k.nomorKontak],
  ['Skor akhir', (k) => k.skorAkhir],
  ['Skor sementara (CV belum dicek HR)', (k) => (k.skorAkhir === null ? '' : k.skor?.sementara ? 'Ya' : 'Tidak')],
  ...KOMPONEN.map(({ kunci, nama }) => [`Skor ${nama}`, (k) => k.skor?.komponen?.[kunci] ?? null]),
  ['Status CV', (k) => labelCv(k)],
  ['Ekspektasi gaji', (k) => k.ekspektasiGaji],
  ['Ketersediaan waktu', (k) => LABEL_WAKTU[k.ketersediaanWaktu] ?? k.ketersediaanWaktu],
  ['Status', (k) => LABEL_STATUS[k.statusAplikasi] ?? k.statusAplikasi],
  ['Kamera', (k) => (k.integritas ? (LABEL_KAMERA[k.integritas.statusKamera] ?? k.integritas.statusKamera) : '')],
  ['Keluar halaman (kali)', (k) => k.integritas?.jumlahKeluarFokus ?? null],
  ['Keluar halaman (detik)', (k) => k.integritas?.totalDetikKeluarFokus ?? null],
  ['Halaman tes dibuka ulang', (k) => k.integritas?.dibukaUlang ?? null],
  ['Dikirim pada', (k) => k.dikirimPada],
];

export function buatCsv(daftar) {
  if (!Array.isArray(daftar)) throw new Error('daftar kandidat harus array');
  const baris = [KOLOM.map(([judul]) => selAman(judul)).join(PEMISAH)];
  for (const k of daftar) baris.push(KOLOM.map(([, ambil]) => selAman(ambil(k))).join(PEMISAH));
  return `\uFEFF${baris.join('\r\n')}\r\n`;
}

/** Nama berkas aman dari posisi lowongan: huruf kecil, tanda hubung, tanggal. */
export function namaBerkas(posisi, tanggal = new Date()) {
  // toISOString melempar RangeError untuk tanggal tidak valid; pakai hari ini sebagai gantinya.
  if (!(tanggal instanceof Date) || Number.isNaN(tanggal.getTime())) tanggal = new Date();
  const dasar =
    String(posisi ?? 'lowongan')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'lowongan';
  const t = tanggal.toISOString().slice(0, 10);
  return `kandidat-${dasar}-${t}.csv`;
}

export function unduhCsv(daftar, posisi) {
  const blob = new Blob([buatCsv(daftar)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = namaBerkas(posisi);
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
