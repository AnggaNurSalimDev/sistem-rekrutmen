/*
 * Logika murni halaman editor tampilan (/atur-tampilan). Tanpa React, bisa diuji.
 *
 *   isian form (draf) ──draftKeMentah──▶ objek profil mentah ──validasiProfil──▶ { profil, masalah }
 *                                                                  │
 *                                     galatPerField(masalah) ◀─────┘  → { 'warna.utama': '…', … }
 */
import { MAKS_DATA_URL, slugDariNama } from './profil.js';

export const JENIS_GAMBAR = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
// Base64 membuat ukuran naik ±4/3, jadi batas berkas mentah sedikit di bawah batas data URL.
export const MAKS_BYTE_GAMBAR = Math.floor((MAKS_DATA_URL - 40) * 0.75);

/** Draf editor → objek yang siap divalidasi. id selalu diturunkan dari nama. */
export function draftKeMentah(draf) {
  if (draf === null || typeof draf !== 'object') throw new TypeError('draf harus objek');
  const id = slugDariNama(draf.nama) || 'perusahaan';
  const gambar = draf.logo?.gambar ?? null;
  return {
    id,
    nama: draf.nama,
    logo: { teks: draf.logo?.teks || draf.nama, titik: Boolean(draf.logo?.titik), gambar },
    // Favicon ikut logo; tanpa logo pakai ikon bawaan aplikasi.
    favicon: gambar ?? '/favicon.svg',
    warna: { utama: draf.warna?.utama, aksen: draf.warna?.aksen },
    huruf: draf.huruf,
    gaya: { tema: draf.gaya?.tema, sudut: draf.gaya?.sudut, kerapatan: draf.gaya?.kerapatan },
    teks: {
      judulBeranda: draf.teks?.judulBeranda,
      deskripsiBeranda: draf.teks?.deskripsiBeranda,
      tentang: draf.teks?.tentang?.trim() ? draf.teks.tentang : null,
      tombolLamar: draf.teks?.tombolLamar,
    },
  };
}

/** Profil (hasil validasi) → draf editor. Kebalikan draftKeMentah. */
export function profilKeDraf(profil) {
  if (profil === null || typeof profil !== 'object') throw new TypeError('profil harus objek');
  return {
    nama: profil.nama,
    logo: { ...profil.logo },
    warna: { ...profil.warna },
    huruf: profil.huruf,
    gaya: { ...profil.gaya },
    teks: { ...profil.teks, tentang: profil.teks.tentang ?? '' },
  };
}

/**
 * ["warna.utama: format #rrggbb", "nama: 1–60 karakter"]
 *   → { 'warna.utama': 'format #rrggbb', nama: '1–60 karakter' }
 * Pesan pertama per field yang dipakai.
 */
export function galatPerField(masalah) {
  if (!Array.isArray(masalah)) return {};
  const hasil = {};
  for (const m of masalah) {
    if (typeof m !== 'string') continue;
    const i = m.indexOf(': ');
    if (i <= 0) continue;
    const field = m.slice(0, i);
    if (!(field in hasil)) hasil[field] = m.slice(i + 2);
  }
  return hasil;
}

/** Cek berkas logo sebelum dibaca. Mengembalikan pesan galat, atau null jika boleh. */
export function periksaBerkasGambar(berkas) {
  if (!berkas || typeof berkas !== 'object') return 'Pilih berkas gambar.';
  if (!JENIS_GAMBAR.includes(berkas.type)) return 'Logo harus PNG, JPG, WEBP, atau SVG.';
  if (!(berkas.size > 0)) return 'Berkas kosong.';
  if (berkas.size > MAKS_BYTE_GAMBAR) {
    return `Logo ${Math.ceil(berkas.size / 1024)} KB, maksimal ${Math.floor(MAKS_BYTE_GAMBAR / 1024)} KB. Perkecil ukurannya dulu (misalnya 256×256 piksel).`;
  }
  return null;
}

/** Nama file unduhan: "Toko Maju" → "profil-toko-maju.json". */
export function namaFileUnduhan(mentah) {
  const id = typeof mentah?.id === 'string' && mentah.id ? mentah.id : 'perusahaan';
  return `profil-${id}.json`;
}
