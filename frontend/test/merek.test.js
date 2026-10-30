import { describe, test, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { campur, hexKeRgb, kontras, sesuaikanKontras, tintaDiAtas } from '../src/merek/warna.js';
import { PROFIL_BAWAAN, pilihIdProfil, validasiProfil, variabelCss } from '../src/merek/profil.js';

describe('warna', () => {
  test('hex → rgb dan menolak format lain', () => {
    expect(hexKeRgb('#2b3a8f')).toEqual([43, 58, 143]);
    expect(() => hexKeRgb('#fff')).toThrow();
    expect(() => hexKeRgb('red')).toThrow();
  });

  test('kontras putih–hitam = 21, warna dengan dirinya = 1', () => {
    expect(kontras('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(kontras('#2b3a8f', '#2b3a8f')).toBeCloseTo(1, 5);
  });

  test('campur di ujung-ujungnya mengembalikan warna asal', () => {
    expect(campur('#2b3a8f', '#ffffff', 0)).toBe('#2b3a8f');
    expect(campur('#2b3a8f', '#ffffff', 1)).toBe('#ffffff');
    expect(() => campur('#2b3a8f', '#ffffff', 1.5)).toThrow();
  });

  test('tulisan di atas warna gelap = putih, di atas warna terang = gelap', () => {
    expect(tintaDiAtas('#2b3a8f')).toBe('#ffffff');
    expect(tintaDiAtas('#38bdf8')).not.toBe('#ffffff');
  });

  test('sesuaikanKontras mencapai target, dan tidak mengubah warna yang sudah cukup', () => {
    expect(sesuaikanKontras('#2b3a8f', '#ffffff', 4.5)).toBe('#2b3a8f');
    const diGelap = sesuaikanKontras('#2b3a8f', '#171d27', 4.5);
    expect(kontras(diGelap, '#171d27')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('validasiProfil', () => {
  test('bukan objek → profil bawaan + masalah', () => {
    for (const x of [null, 'rekrut', [], 42]) {
      const { profil, masalah } = validasiProfil(x);
      expect(profil).toBe(PROFIL_BAWAAN);
      expect(masalah.length).toBe(1);
    }
  });

  test('id wajib dan berpola slug', () => {
    expect(validasiProfil({ nama: 'Toko' }).profil).toBe(PROFIL_BAWAAN);
    expect(validasiProfil({ id: 'Toko Maju' }).profil).toBe(PROFIL_BAWAAN);
    expect(validasiProfil({ id: 'toko-maju' }).profil.id).toBe('toko-maju');
  });

  test('field salah diganti bawaan dan dicatat, field lain tetap dipakai', () => {
    const { profil, masalah } = validasiProfil({
      id: 'toko',
      nama: 'Toko Maju',
      warna: { utama: 'merah', aksen: '#ffcc00' },
      gaya: { tema: 'ungu' },
    });
    expect(profil.warna.utama).toBe(PROFIL_BAWAAN.warna.utama);
    expect(profil.warna.aksen).toBe('#ffcc00');
    expect(profil.gaya.tema).toBe('terang');
    expect(profil.logo.teks).toBe('Toko Maju'); // logo ikut nama kalau tidak ditulis
    expect(masalah).toEqual(expect.arrayContaining([expect.stringContaining('warna.utama'), expect.stringContaining('gaya.tema')]));
  });

  test('field asing dicatat (salah ketik tidak hilang diam-diam)', () => {
    const { masalah } = validasiProfil({ id: 'toko', warnaa: {}, teks: { judul: 'x' } });
    expect(masalah).toEqual(expect.arrayContaining(['warnaa: field tidak dikenal', 'teks.judul: field tidak dikenal']));
  });

  test('gambar dan favicon hanya path lokal, bukan URL luar', () => {
    const { profil, masalah } = validasiProfil({
      id: 'toko',
      favicon: 'https://contoh.com/a.svg',
      logo: { gambar: '//contoh.com/a.svg' },
    });
    expect(profil.favicon).toBe(PROFIL_BAWAAN.favicon);
    expect(profil.logo.gambar).toBe(null);
    expect(masalah.length).toBe(2);
    expect(validasiProfil({ id: 'toko', favicon: '/../rahasia' }).profil.favicon).toBe(PROFIL_BAWAAN.favicon);
  });

  test('warna utama "tengah" yang tidak terbaca dengan putih maupun hitam diperingatkan', () => {
    const { masalah } = validasiProfil({ id: 'toko', warna: { utama: '#777777', aksen: '#000000' } });
    expect(masalah.some((m) => m.startsWith('warna.utama'))).toBe(true);
  });
});

describe('variabelCss', () => {
  test('semua profil di src/merek/profil valid dan terbaca', () => {
    const folder = join(import.meta.dirname, '../src/merek/profil');
    for (const nama of readdirSync(folder)) {
      const { profil, masalah } = validasiProfil(JSON.parse(readFileSync(join(folder, nama), 'utf8')));
      expect(masalah, nama).toEqual([]);
      const v = variabelCss(profil);
      expect(kontras(v['--di-atas-utama'], v['--utama']), nama).toBeGreaterThanOrEqual(4.5);
      expect(kontras(v['--tautan'], v['--permukaan']), nama).toBeGreaterThanOrEqual(4.5);
      expect(kontras(v['--tanda-data'], v['--permukaan']), nama).toBeGreaterThanOrEqual(3);
      expect(kontras(v['--tinta'], v['--permukaan']), nama).toBeGreaterThanOrEqual(7);
    }
  });

  test('aksen yang tidak kontras dengan kepala diganti warna tulisan kepala', () => {
    const { profil } = validasiProfil({ id: 'toko', warna: { utama: '#2b3a8f', aksen: '#2b3a90' } });
    const v = variabelCss(profil);
    expect(v['--aksen']).toBe(v['--di-atas-utama']);
  });

  test('menolak objek yang bukan hasil validasi', () => {
    expect(() => variabelCss({})).toThrow();
    expect(() => variabelCss({ warna: {}, gaya: { tema: 'x' } })).toThrow();
  });
});

describe('pilihIdProfil', () => {
  const tersedia = new Set(['rekrut', 'toko', 'kafe']);

  test('di luar mode demo hanya VITE_PROFIL yang berlaku', () => {
    expect(pilihIdProfil({ bawaan: 'toko', demo: false, dariUrl: 'kafe', dariPenyimpanan: 'kafe', tersedia })).toBe('toko');
  });

  test('mode demo: URL > penyimpanan > bawaan; id tak dikenal diabaikan', () => {
    expect(pilihIdProfil({ bawaan: 'toko', demo: true, dariUrl: 'kafe', dariPenyimpanan: 'rekrut', tersedia })).toBe('kafe');
    expect(pilihIdProfil({ bawaan: 'toko', demo: true, dariUrl: 'ngawur', dariPenyimpanan: 'rekrut', tersedia })).toBe('rekrut');
    expect(pilihIdProfil({ bawaan: 'toko', demo: true, dariUrl: null, dariPenyimpanan: null, tersedia })).toBe('toko');
  });

  test('VITE_PROFIL yang tidak ada → profil bawaan', () => {
    expect(pilihIdProfil({ bawaan: 'salah-ketik', demo: false, tersedia })).toBe('rekrut');
  });
});

import { bacaTeksProfil, slugDariNama, sumberGambarValid } from '../src/merek/profil.js';
import { MAKS_BYTE_GAMBAR, draftKeMentah, galatPerField, namaFileUnduhan, periksaBerkasGambar, profilKeDraf } from '../src/merek/editor.js';

describe('editor tampilan', () => {
  test('slug dari nama', () => {
    expect(slugDariNama('Toko Maju Jaya!')).toBe('toko-maju-jaya');
    expect(slugDariNama('  Café Ümit  ')).toBe('cafe-umit');
    expect(slugDariNama('!!!')).toBe('');
    expect(slugDariNama(null)).toBe('');
  });

  test('gambar: path publik dan data URL kecil diterima, URL luar dan data URL raksasa ditolak', () => {
    expect(sumberGambarValid('/merek/a.svg')).toBe(true);
    expect(sumberGambarValid('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(sumberGambarValid('https://contoh.com/a.png')).toBe(false);
    expect(sumberGambarValid('data:text/html;base64,PHNjcmlwdD4=')).toBe(false);
    expect(sumberGambarValid('data:image/png;base64,' + 'A'.repeat(200_000))).toBe(false);
  });

  test('draf → profil → draf tidak kehilangan isi', () => {
    const awal = profilKeDraf(PROFIL_BAWAAN);
    const { profil, masalah } = validasiProfil(draftKeMentah({ ...awal, nama: 'Toko Maju', logo: { ...awal.logo, teks: '' } }));
    expect(masalah).toEqual([]);
    expect(profil.id).toBe('toko-maju');
    expect(profil.logo.teks).toBe('Toko Maju'); // tulisan logo kosong → ikut nama
    expect(profil.teks.tentang).toBe(null); // '' → null
    expect(profil.favicon).toBe('/favicon.svg'); // tanpa logo → ikon bawaan
    expect(profilKeDraf(profil).teks.tentang).toBe('');
  });

  test('logo tertanam ikut menjadi favicon', () => {
    const gambar = 'data:image/png;base64,iVBORw0KGgo=';
    const d = profilKeDraf(PROFIL_BAWAAN);
    expect(draftKeMentah({ ...d, logo: { ...d.logo, gambar } }).favicon).toBe(gambar);
  });

  test('nama kosong → galat di field nama, id cadangan "perusahaan"', () => {
    const d = profilKeDraf(PROFIL_BAWAAN);
    const mentah = draftKeMentah({ ...d, nama: '' });
    expect(mentah.id).toBe('perusahaan');
    expect(galatPerField(validasiProfil(mentah).masalah).nama).toBeTruthy();
  });

  test('galatPerField mengambil pesan pertama per field dan mengabaikan sampah', () => {
    expect(galatPerField(['warna.utama: a', 'warna.utama: b', 'tanpa titik dua', 42])).toEqual({ 'warna.utama': 'a' });
    expect(galatPerField(null)).toEqual({});
  });

  test('periksaBerkasGambar', () => {
    expect(periksaBerkasGambar(null)).toMatch(/Pilih/);
    expect(periksaBerkasGambar({ type: 'image/gif', size: 10 })).toMatch(/PNG/);
    expect(periksaBerkasGambar({ type: 'image/png', size: 0 })).toMatch(/kosong/);
    expect(periksaBerkasGambar({ type: 'image/png', size: MAKS_BYTE_GAMBAR + 1 })).toMatch(/maksimal/);
    expect(periksaBerkasGambar({ type: 'image/svg+xml', size: 2000 })).toBe(null);
  });

  test('gambar sebesar batas maksimal masih lolos validasi setelah jadi data URL', () => {
    const base64 = 'A'.repeat(Math.ceil(MAKS_BYTE_GAMBAR / 3) * 4);
    expect(sumberGambarValid(`data:image/png;base64,${base64}`)).toBe(true);
  });

  test('bacaTeksProfil tidak pernah melempar', () => {
    expect(bacaTeksProfil('{rusak').profil).toBe(null);
    expect(bacaTeksProfil('').profil).toBe(null);
    expect(bacaTeksProfil('{"nama":"tanpa id"}').profil).toBe(null);
    expect(bacaTeksProfil(JSON.stringify({ id: 'toko', nama: 'Toko' })).profil.nama).toBe('Toko');
  });

  test('nama file unduhan', () => {
    expect(namaFileUnduhan({ id: 'toko-maju' })).toBe('profil-toko-maju.json');
    expect(namaFileUnduhan({})).toBe('profil-perusahaan.json');
  });
});
