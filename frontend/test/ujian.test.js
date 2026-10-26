import { describe, test, expect } from 'vitest';
import { buatPelacakFokus, pasangPendengarFokus } from '../src/ujian/pelacakFokus.js';
import { statusDariError, mintaKamera, statusUntukDikirim } from '../src/ujian/kamera.js';
import { acakBerbenih } from '../src/ujian/acak.js';

function jamPalsu() {
  let t = 0;
  return { sekarang: () => t, maju: (ms) => (t += ms) };
}

describe('Pelacak fokus (DoD 4.3)', () => {
  test('satu kali pindah tab (blur + hidden, lalu visible + focus) = 1 episode, bukan 2', () => {
    const jam = jamPalsu();
    const p = buatPelacakFokus({ sekarang: jam.sekarang });
    p.hilang(); // blur
    p.hilang(); // visibilitychange hidden
    jam.maju(4000);
    p.kembali(); // visible
    p.kembali(); // focus
    expect(p.ringkasan()).toEqual({ jumlah: 1, totalDetik: 4, episode: [{ detik: 4 }] });
  });

  test('tiga kali keluar → 3 episode, durasi dijumlahkan', () => {
    const jam = jamPalsu();
    const p = buatPelacakFokus({ sekarang: jam.sekarang });
    for (const ms of [2000, 5000, 7000]) {
      p.hilang();
      jam.maju(ms);
      p.kembali();
      jam.maju(10_000);
    }
    expect(p.ringkasan().jumlah).toBe(3);
    expect(p.ringkasan().totalDetik).toBe(14);
  });

  test('kembali tanpa pernah keluar diabaikan', () => {
    const p = buatPelacakFokus({ sekarang: () => 0 });
    p.kembali();
    expect(p.ringkasan().jumlah).toBe(0);
  });

  test('jawaban dikirim saat masih di luar halaman → episode ditutup saat itu', () => {
    const jam = jamPalsu();
    const p = buatPelacakFokus({ sekarang: jam.sekarang });
    p.hilang();
    jam.maju(3000);
    expect(p.sedangKeluar()).toBe(true);
    p.tutup();
    expect(p.ringkasan()).toEqual({ jumlah: 1, totalDetik: 3, episode: [{ detik: 3 }] });
  });

  test('ringkasan adalah salinan (tidak bisa diubah dari luar)', () => {
    const p = buatPelacakFokus({ sekarang: () => 0 });
    p.hilang();
    p.kembali();
    p.ringkasan().episode.push({ detik: 999 });
    expect(p.ringkasan().jumlah).toBe(1);
  });

  test('dipulihkan setelah muat ulang: episode lama tetap ada, dan muat ulang ikut terhitung', () => {
    const jam = jamPalsu();
    const sebelum = buatPelacakFokus({ sekarang: jam.sekarang });
    sebelum.hilang();
    jam.maju(2000);
    sebelum.kembali(); // satu kali pindah tab
    sebelum.hilang(); // pagehide saat halaman dimuat ulang
    const tersimpan = JSON.parse(JSON.stringify(sebelum.serialisasi()));

    jam.maju(5000); // halaman baru selesai dimuat 5 detik kemudian
    const sesudah = buatPelacakFokus({ sekarang: jam.sekarang, awal: tersimpan });
    expect(sesudah.sedangKeluar()).toBe(true);
    sesudah.kembali();
    expect(sesudah.ringkasan()).toEqual({ jumlah: 2, totalDetik: 7, episode: [{ detik: 2 }, { detik: 5 }] });
  });

  test('data simpanan rusak diabaikan, bukan membuat crash', () => {
    for (const awal of [null, 'teks', { mulai: 'x', episode: 'y' }, { episode: [{ detik: -3 }, { detik: 'a' }, null] }]) {
      const p = buatPelacakFokus({ sekarang: () => 0, awal });
      expect(p.ringkasan().jumlah).toBe(0);
      expect(p.sedangKeluar()).toBe(false);
    }
  });

  test('pagehide (muat ulang / tutup tab) membuka episode', () => {
    const p = buatPelacakFokus({ sekarang: () => 0 });
    const jendela = new EventTarget();
    const dokumen = new EventTarget();
    dokumen.visibilityState = 'visible';
    pasangPendengarFokus(p, { jendela, dokumen });
    jendela.dispatchEvent(new Event('pagehide'));
    expect(p.sedangKeluar()).toBe(true);
  });

  test('pendengar event browser: blur + hidden + visible + focus = 1 episode; bisa dilepas', () => {
    const jam = jamPalsu();
    const p = buatPelacakFokus({ sekarang: jam.sekarang });
    const jendela = new EventTarget();
    const dokumen = new EventTarget();
    dokumen.visibilityState = 'visible';
    let berubah = 0;
    const lepas = pasangPendengarFokus(p, { jendela, dokumen, saatBerubah: () => berubah++ });

    jendela.dispatchEvent(new Event('blur'));
    dokumen.visibilityState = 'hidden';
    dokumen.dispatchEvent(new Event('visibilitychange'));
    jam.maju(1500);
    dokumen.visibilityState = 'visible';
    dokumen.dispatchEvent(new Event('visibilitychange'));
    jendela.dispatchEvent(new Event('focus'));
    expect(p.ringkasan().jumlah).toBe(1);
    expect(berubah).toBe(4);

    lepas();
    jendela.dispatchEvent(new Event('blur'));
    jendela.dispatchEvent(new Event('focus'));
    expect(p.ringkasan().jumlah).toBe(1);
  });
});

describe('Kamera (DoD 4.4: tidak pernah memblokir ujian)', () => {
  test('pemetaan error browser ke status', () => {
    expect(statusDariError({ name: 'NotAllowedError' })).toBe('denied');
    expect(statusDariError({ name: 'NotFoundError' })).toBe('hardware_not_found');
    expect(statusDariError({ name: 'NotReadableError' })).toBe('hardware_not_found');
    expect(statusDariError({ name: 'AnehError' })).toBe('not_supported');
    expect(statusDariError(undefined)).toBe('not_supported');
  });

  test('browser tanpa mediaDevices → not_supported, tidak melempar', async () => {
    expect(await mintaKamera(undefined)).toEqual({ status: 'not_supported', stream: null });
    expect(await mintaKamera({})).toEqual({ status: 'not_supported', stream: null });
  });

  test('izin ditolak / kamera tidak ada → status, bukan error', async () => {
    const gagal = (name) => ({ getUserMedia: async () => Promise.reject(Object.assign(new Error('x'), { name })) });
    expect((await mintaKamera(gagal('NotAllowedError'))).status).toBe('denied');
    expect((await mintaKamera(gagal('NotFoundError'))).status).toBe('hardware_not_found');
  });

  test('izin diberikan → granted dengan stream', async () => {
    const stream = { getTracks: () => [] };
    expect(await mintaKamera({ getUserMedia: async () => stream })).toEqual({ status: 'granted', stream });
  });

  test('belum menjawab izin sampai jawaban dikirim → denied', () => {
    expect(statusUntukDikirim('menunggu')).toBe('denied');
    expect(statusUntukDikirim(undefined)).toBe('denied');
    expect(statusUntukDikirim('granted')).toBe('granted');
  });
});

describe('Pengacak opsi berbenih', () => {
  const opsi = ['a', 'b', 'c', 'd', 'e', 'f'];

  test('benih sama → urutan sama (stabil saat halaman dimuat ulang)', () => {
    expect(acakBerbenih(opsi, 'lamaran-1:soal-1')).toEqual(acakBerbenih(opsi, 'lamaran-1:soal-1'));
  });

  test('benih berbeda → biasanya urutan berbeda; isi tetap sama; array asli tidak berubah', () => {
    const hasil = new Set(Array.from({ length: 20 }, (_, i) => acakBerbenih(opsi, `lamaran-${i}`).join('')));
    expect(hasil.size).toBeGreaterThan(5);
    expect([...acakBerbenih(opsi, 'x')].sort()).toEqual(opsi);
    expect(opsi).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  test('guard input', () => {
    expect(() => acakBerbenih('abc', 'x')).toThrow();
    expect(() => acakBerbenih(opsi, '')).toThrow();
  });
});
