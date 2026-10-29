/*
 * Profil perusahaan: satu file JSON → tampilan seluruh aplikasi.
 *
 *   profil/<id>.json ──validasiProfil──▶ { profil, masalah[] }
 *                                          │
 *                         variabelCss ◀────┘
 *                              │
 *          { '--utama': '#…', '--radius': '10px', … } ──terapkanProfil──▶ <html style="…">
 *
 * Field yang salah tidak membuat aplikasi mati: field itu diganti nilai bawaan
 * dan dicatat di `masalah`, supaya kesalahan ketik di JSON klien terlihat di console.
 */

import { campur, hexValid, kontras, sesuaikanKontras, tintaDiAtas } from './warna.js';

export const HURUF = {
  jakarta: "'Plus Jakarta Sans Variable', system-ui, -apple-system, 'Segoe UI', sans-serif",
  fraunces: "'Fraunces Variable', Georgia, 'Times New Roman', serif",
  grotesk: "'Space Grotesk Variable', system-ui, -apple-system, 'Segoe UI', sans-serif",
};

export const SUDUT = {
  tajam: { kecil: '2px', besar: '3px' },
  sedang: { kecil: '6px', besar: '10px' },
  bulat: { kecil: '12px', besar: '18px' },
};

// Ukuran huruf dasar. Hampir semua ukuran di styles.css memakai rem, jadi
// angka ini ikut melebarkan/merapatkan seluruh halaman.
export const KERAPATAN = {
  rapat: { dasar: '93.75%', tepi: '12px', lebar: '680px' },
  normal: { dasar: '100%', tepi: '16px', lebar: '720px' },
  lega: { dasar: '106.25%', tepi: '20px', lebar: '760px' },
};

const TEMA = {
  terang: {
    '--latar': '#f3f5f8',
    '--permukaan': '#ffffff',
    '--tinta': '#1b2333',
    '--tinta-lembut': '#4b5568',
    '--garis': '#d8dde6',
    '--garis-bantu': '#e8ebf0',
    '--garis-sumbu': '#c4cad4',
    '--baris-sorot': '#fafbfd',
    '--kuning': '#f2b705',
    '--kuning-gelap': '#6b4f00',
    '--di-atas-kuning': '#6b4f00',
    '--kuning-pudar': '#fff8e1',
    '--kuning-stabilo': '#ffe680',
    '--hijau': '#1f7a4d',
    '--hijau-pudar': '#e3f2ea',
    '--merah': '#b42318',
    '--merah-pudar': '#fdecea',
  },
  gelap: {
    '--latar': '#0f141c',
    '--permukaan': '#171d27',
    '--tinta': '#e8ecf2',
    '--tinta-lembut': '#a3adbd',
    '--garis': '#2c3443',
    '--garis-bantu': '#232a36',
    '--garis-sumbu': '#3a4354',
    '--baris-sorot': '#1c2330',
    '--kuning': '#f2b705',
    '--kuning-gelap': '#e0b84a',
    // Stempel selalu berlatar kuning terang, jadi tulisannya tetap gelap di tema gelap.
    '--di-atas-kuning': '#6b4f00',
    '--kuning-pudar': '#2d2510',
    '--kuning-stabilo': '#5c4a0f',
    '--hijau': '#5cc98f',
    '--hijau-pudar': '#12301f',
    '--merah': '#f07a70',
    '--merah-pudar': '#3a1714',
  },
};

export const PROFIL_BAWAAN = Object.freeze({
  id: 'rekrut',
  nama: 'Rekrut',
  logo: { teks: 'Rekrut', titik: true, gambar: null },
  favicon: '/favicon.svg',
  warna: { utama: '#2b3a8f', aksen: '#f2b705' },
  huruf: 'jakarta',
  gaya: { tema: 'terang', sudut: 'sedang', kerapatan: 'normal' },
  teks: {
    judulBeranda: 'Lowongan yang sedang dibuka',
    deskripsiBeranda: 'Pilih lowongan, kirim CV, lalu kerjakan tes pilihan ganda singkat. Semua bisa dari HP.',
    tentang: null,
    tombolLamar: 'Kirim lamaran',
  },
  fiktif: false,
});

const POLA_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const KUNCI = ['id', 'nama', 'logo', 'favicon', 'warna', 'huruf', 'gaya', 'teks', 'fiktif'];

function objekBiasa(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function teksPendek(x, maks) {
  return typeof x === 'string' && x.trim().length > 0 && x.length <= maks;
}

/** Path di folder public (diawali satu "/"), bukan URL luar. */
function pathPublik(x) {
  return typeof x === 'string' && /^\/(?!\/)[\w\-./]+$/.test(x) && !x.includes('..');
}

// Gambar yang diunggah lewat editor disimpan di dalam file profil sebagai data URL,
// supaya satu file JSON sudah membawa semuanya. 150.000 karakter base64 ≈ 109 KB gambar.
export const MAKS_DATA_URL = 150_000;
const KB_GAMBAR = Math.floor((MAKS_DATA_URL * 0.75) / 1024);
const POLA_DATA_URL = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Path di public, atau gambar tertanam (data URL) yang kecil. URL luar ditolak. */
export function sumberGambarValid(x) {
  if (pathPublik(x)) return true;
  return typeof x === 'string' && x.length <= MAKS_DATA_URL && POLA_DATA_URL.test(x);
}

/** "Toko Maju Jaya!" → "toko-maju-jaya". Untuk id profil yang dibuat editor. */
export function slugDariNama(nama) {
  if (typeof nama !== 'string') return '';
  return nama
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // "é" → "e" + tanda aksen; aksennya dibuang
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

/**
 * Teks file yang dipilih pengguna → profil. Tidak pernah melempar:
 * JSON rusak menghasilkan { profil: null, masalah: [...] }.
 */
export function bacaTeksProfil(teks) {
  if (typeof teks !== 'string' || teks.length === 0) return { profil: null, masalah: ['File kosong'] };
  if (teks.length > 2 * MAKS_DATA_URL) return { profil: null, masalah: ['File terlalu besar untuk file profil'] };
  let mentah;
  try {
    mentah = JSON.parse(teks);
  } catch {
    return { profil: null, masalah: ['Isi file bukan JSON yang valid'] };
  }
  const hasil = validasiProfil(mentah);
  if (hasil.profil === PROFIL_BAWAAN && mentah?.id !== PROFIL_BAWAAN.id) return { profil: null, masalah: hasil.masalah };
  return hasil;
}

/** Ambil `mentah[kunci]` kalau lolos `cek`; selain itu pakai bawaan dan catat masalahnya. */
function ambil(mentah, kunci, cek, bawaan, masalah, pesan, jalur) {
  if (!(kunci in mentah)) return bawaan;
  if (cek(mentah[kunci])) return mentah[kunci];
  masalah.push(`${jalur}${kunci}: ${pesan}`);
  return bawaan;
}

function validasiBagian(mentah, bawaan, aturan, jalur, masalah) {
  if (mentah === undefined) return { ...bawaan };
  if (!objekBiasa(mentah)) {
    masalah.push(`${jalur.slice(0, -1)}: harus objek`);
    return { ...bawaan };
  }
  for (const k of Object.keys(mentah)) if (!(k in aturan)) masalah.push(`${jalur}${k}: field tidak dikenal`);
  const hasil = {};
  for (const [k, [cek, pesan]] of Object.entries(aturan)) {
    hasil[k] = ambil(mentah, k, cek, bawaan[k], masalah, pesan, jalur);
  }
  return hasil;
}

/**
 * @returns {{ profil: object, masalah: string[] }} profil selalu lengkap dan aman dipakai.
 */
export function validasiProfil(mentah) {
  const masalah = [];
  const B = PROFIL_BAWAAN;
  if (!objekBiasa(mentah)) return { profil: B, masalah: ['profil harus objek JSON'] };

  for (const k of Object.keys(mentah)) if (!KUNCI.includes(k)) masalah.push(`${k}: field tidak dikenal`);

  // id wajib dan tidak diganti bawaan: dua profil ber-id sama akan saling menimpa.
  if (!(typeof mentah.id === 'string' && POLA_ID.test(mentah.id))) {
    return { profil: B, masalah: [...masalah, 'id: wajib, huruf kecil/angka/tanda hubung (contoh "toko-maju")'] };
  }

  const nama = ambil(mentah, 'nama', (x) => teksPendek(x, 60), B.nama, masalah, '1–60 karakter', '');
  const profil = {
    id: mentah.id,
    nama,
    favicon: ambil(mentah, 'favicon', sumberGambarValid, B.favicon, masalah, `path di folder public (contoh "/merek/toko.svg") atau gambar ≤ ${KB_GAMBAR} KB`, ''),
    huruf: ambil(mentah, 'huruf', (x) => x in HURUF, B.huruf, masalah, `salah satu: ${Object.keys(HURUF).join(', ')}`, ''),
    fiktif: ambil(mentah, 'fiktif', (x) => typeof x === 'boolean', false, masalah, 'true/false', ''),
    logo: validasiBagian(
      mentah.logo,
      { ...B.logo, teks: nama.length <= 40 ? nama : B.logo.teks },
      {
        teks: [(x) => teksPendek(x, 40), '1–40 karakter'],
        titik: [(x) => typeof x === 'boolean', 'true/false'],
        gambar: [(x) => x === null || sumberGambarValid(x), `null, path di folder public, atau gambar ≤ ${KB_GAMBAR} KB`],
      },
      'logo.',
      masalah,
    ),
    warna: validasiBagian(
      mentah.warna,
      B.warna,
      { utama: [hexValid, 'format #rrggbb'], aksen: [hexValid, 'format #rrggbb'] },
      'warna.',
      masalah,
    ),
    gaya: validasiBagian(
      mentah.gaya,
      B.gaya,
      {
        tema: [(x) => x in TEMA, 'terang | gelap'],
        sudut: [(x) => x in SUDUT, 'tajam | sedang | bulat'],
        kerapatan: [(x) => x in KERAPATAN, 'rapat | normal | lega'],
      },
      'gaya.',
      masalah,
    ),
    teks: validasiBagian(
      mentah.teks,
      B.teks,
      {
        judulBeranda: [(x) => teksPendek(x, 90), '1–90 karakter'],
        deskripsiBeranda: [(x) => teksPendek(x, 300), '1–300 karakter'],
        tentang: [(x) => x === null || teksPendek(x, 600), 'null atau 1–600 karakter'],
        tombolLamar: [(x) => teksPendek(x, 30), '1–30 karakter'],
      },
      'teks.',
      masalah,
    ),
  };

  // Invariant keterbacaan: tulisan di atas warna utama (kepala, tombol) minimal 4.5:1.
  const diAtas = tintaDiAtas(profil.warna.utama);
  if (kontras(diAtas, profil.warna.utama) < 4.5) {
    masalah.push(
      `warna.utama: ${profil.warna.utama} terlalu "tengah" — tulisan putih maupun hitam di atasnya kurang terbaca (< 4.5:1). Pilih yang lebih gelap atau lebih terang.`,
    );
  }

  return { profil, masalah };
}

/**
 * Profil → variabel CSS. Warna turunan dihitung di sini supaya klien cukup
 * menulis dua warna (utama + aksen), dan semua tetap terbaca di tema terang maupun gelap.
 */
export function variabelCss(profil) {
  if (!objekBiasa(profil) || !objekBiasa(profil.warna) || !objekBiasa(profil.gaya)) {
    throw new TypeError('variabelCss butuh profil hasil validasiProfil');
  }
  const tema = TEMA[profil.gaya.tema];
  const sudut = SUDUT[profil.gaya.sudut];
  const rapat = KERAPATAN[profil.gaya.kerapatan];
  if (!tema || !sudut || !rapat) throw new TypeError('gaya profil tidak dikenal');

  const { utama, aksen } = profil.warna;
  const permukaan = tema['--permukaan'];
  const diAtasUtama = tintaDiAtas(utama);

  return {
    ...tema,
    '--utama': utama,
    '--utama-gelap': campur(utama, '#000000', 0.25),
    '--utama-pudar': campur(utama, permukaan, 0.86),
    '--di-atas-utama': diAtasUtama,
    // Teks/garis berwarna utama di atas permukaan (tautan, outline fokus, tanda grafik).
    '--tautan': sesuaikanKontras(utama, permukaan, 4.5),
    '--tanda-data': sesuaikanKontras(campur(utama, '#ffffff', 0.12), permukaan, 3),
    // Aksen dipakai di atas kepala berwarna utama; kalau tidak kontras, pakai warna tulisan kepala.
    '--aksen': kontras(aksen, utama) >= 3 ? aksen : diAtasUtama,
    '--huruf': HURUF[profil.huruf],
    '--radius-kecil': sudut.kecil,
    '--radius': sudut.besar,
    '--lebar': rapat.lebar,
    '--tepi': rapat.tepi,
    '--ukuran-dasar': rapat.dasar,
  };
}

/**
 * Pilih id profil yang dipakai saat aplikasi dibuka.
 * Di luar mode demo, hanya `bawaan` (dari VITE_PROFIL) yang berlaku.
 */
export function pilihIdProfil({ bawaan, demo, dariUrl, dariPenyimpanan, tersedia }) {
  if (!(tersedia instanceof Set) || tersedia.size === 0) throw new TypeError('tersedia harus Set id profil yang tidak kosong');
  const awal = tersedia.has(bawaan) ? bawaan : PROFIL_BAWAAN.id;
  if (!demo) return awal;
  if (tersedia.has(dariUrl)) return dariUrl;
  if (tersedia.has(dariPenyimpanan)) return dariPenyimpanan;
  return awal;
}
