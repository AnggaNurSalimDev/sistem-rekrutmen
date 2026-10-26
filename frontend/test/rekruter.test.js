import { describe, expect, it } from 'vitest';
import { bagiSegmen, cariKataKunci, hitungKataKunci, rapikanKataKunci } from '../src/rekruter/sorotan.js';
import { labelCv, perluVerifikasi, rataRataKomponen, saring, sebaranSkor, urutkan } from '../src/rekruter/kandidat.js';
import { buatCsv, namaBerkas, selAman } from '../src/rekruter/ekspor.js';
import { dariLowongan, formBaru, keBody, pisahDaftar, rupiah } from '../src/rekruter/formLowongan.js';
import { geser, hapusOpsi, idOpsiBaru, keBodySoal, soalKosong, tambahOpsi } from '../src/rekruter/formSoal.js';

describe('sorotan kata kunci', () => {
  it('mencocokkan tanpa beda huruf besar dan hanya kata utuh', () => {
    const teks = 'Punya SIM C. Simpan data. sim c aktif';
    const hasil = cariKataKunci(teks, ['sim c']);
    expect(hasil.map((h) => teks.slice(h.awal, h.akhir))).toEqual(['SIM C', 'sim c']);
    expect(cariKataKunci(teks, ['sim'])).toHaveLength(2); // "Simpan" tidak ikut
  });

  it('spasi di kata kunci cocok dengan baris baru dari PDF', () => {
    const teks = 'bersedia kerja\nshift malam';
    expect(cariKataKunci(teks, ['bersedia kerja shift'])).toHaveLength(1);
  });

  it('karakter khusus regex diperlakukan sebagai teks biasa', () => {
    expect(cariKataKunci('Bisa C++ dan C#', ['C++', 'C#'])).toHaveLength(2);
    expect(cariKataKunci('abc', ['.*'])).toHaveLength(0);
  });

  it('merapikan daftar: trim, buang kosong dan dobel', () => {
    expect(rapikanKataKunci([' SIM C ', 'sim  c', '', 5, 'Barista'])).toEqual(['SIM C', 'Barista']);
    expect(rapikanKataKunci(null)).toEqual([]);
  });

  it('menghitung kemunculan, termasuk yang tidak ditemukan', () => {
    expect(hitungKataKunci('kasir, Kasir, barista', ['kasir', 'shift'])).toEqual({ kasir: 2, shift: 0 });
  });

  it('segmen menutup seluruh teks tanpa celah dan menggabungkan dua sumber', () => {
    const teks = 'Kasir di Toko Maju, punya SIM C';
    const ai = [{ awal: 9, akhir: 18, kategori: 'perusahaan', label: 'Toko Maju' }];
    const seg = bagiSegmen(teks, ai, ['SIM C', 'toko']);
    expect(seg.map((s) => s.teks).join('')).toBe(teks);
    for (let i = 1; i < seg.length; i++) expect(seg[i].awal).toBe(seg[i - 1].akhir);
    const toko = seg.find((s) => s.teks === 'Toko');
    expect(toko.ai.kategori).toBe('perusahaan');
    expect(toko.kata).toEqual(['toko']);
    expect(seg.find((s) => s.teks === ' Maju').kata).toEqual([]);
    expect(seg.at(-1)).toMatchObject({ teks: 'SIM C', ai: null, kata: ['SIM C'] });
  });

  it('mengabaikan sorotan server yang rusak atau di luar teks', () => {
    const seg = bagiSegmen('halo', [{ awal: 2, akhir: 99 }, { awal: 3, akhir: 1 }, { awal: '0', akhir: 2 }]);
    expect(seg).toEqual([{ teks: 'halo', awal: 0, akhir: 4, ai: null, kata: [] }]);
    expect(bagiSegmen('')).toEqual([]);
    expect(() => bagiSegmen(null)).toThrow();
  });
});

const k = (o) => ({
  nama: 'A',
  email: 'a@x.id',
  skorAkhir: null,
  skor: { sementara: false, komponen: {} },
  cv: { terverifikasi: false, statusEkstraksi: 'berhasil', sumber: 'ai' },
  statusAplikasi: 'selesai',
  dikirimPada: '2026-10-01T00:00:00Z',
  integritas: null,
  ...o,
});

describe('tabel kandidat', () => {
  it('urut skor turun, nilai kosong selalu di bawah, stabil', () => {
    const d = [k({ nama: 'a', skorAkhir: null }), k({ nama: 'b', skorAkhir: 70 }), k({ nama: 'c', skorAkhir: 90 }), k({ nama: 'd', skorAkhir: 70 })];
    expect(urutkan(d, 'skor', 'turun').map((x) => x.nama)).toEqual(['c', 'b', 'd', 'a']);
    expect(urutkan(d, 'skor', 'naik').map((x) => x.nama)).toEqual(['b', 'd', 'c', 'a']);
    expect(() => urutkan(d, 'tidakada')).toThrow();
    expect(() => urutkan(d, 'skor', 'acak')).toThrow();
  });

  it('filter perlu dicek, sudah dicek, diputuskan, dan cari nama', () => {
    const d = [
      k({ nama: 'Rina', cv: { terverifikasi: true, statusEkstraksi: 'berhasil', sumber: 'ai' } }),
      k({ nama: 'Budi', cv: null }),
      k({ nama: 'Sari', statusAplikasi: 'ditolak' }),
    ];
    expect(saring(d, 'perlu_verifikasi').map((x) => x.nama)).toEqual(['Budi', 'Sari']);
    expect(saring(d, 'terverifikasi').map((x) => x.nama)).toEqual(['Rina']);
    expect(saring(d, 'diputuskan').map((x) => x.nama)).toEqual(['Sari']);
    expect(saring(d, 'semua', ' rin ').map((x) => x.nama)).toEqual(['Rina']);
    expect(() => saring(d, 'aneh')).toThrow();
  });

  it('label CV', () => {
    expect(labelCv(k({ cv: null }))).toBe('Tidak ada CV');
    expect(labelCv(k({ cv: { statusEkstraksi: 'gagal' } }))).toBe('Tidak terbaca');
    expect(labelCv(k({ cv: { statusEkstraksi: 'menunggu' } }))).toBe('Belum dibaca');
    expect(labelCv(k({ cv: { terverifikasi: true, sumber: 'manual' } }))).toBe('Diisi HR');
    expect(perluVerifikasi(k({ cv: null }))).toBe(true);
  });

  it('sebaran skor: 100 masuk kelompok terakhir, tanpa skor dihitung terpisah', () => {
    const { kelompok, tanpaSkor } = sebaranSkor([
      k({ skorAkhir: 100 }),
      k({ skorAkhir: 90, skor: { sementara: true } }),
      k({ skorAkhir: 9.9 }),
      k({ skorAkhir: null }),
    ]);
    expect(kelompok).toHaveLength(10);
    expect(kelompok[9]).toMatchObject({ dari: 90, sampai: 100, jumlah: 2, sementara: 1 });
    expect(kelompok[0].jumlah).toBe(1);
    expect(tanpaSkor).toBe(1);
  });

  it('rata-rata komponen hanya dari nilai yang ada', () => {
    const r = rataRataKomponen([k({ skor: { komponen: { cv: 100, tes: null } } }), k({ skor: { komponen: { cv: 50 } } })]);
    expect(r.find((x) => x.kunci === 'cv')).toMatchObject({ rata: 75, jumlah: 2 });
    expect(r.find((x) => x.kunci === 'tes')).toMatchObject({ rata: null, jumlah: 0 });
  });
});

describe('ekspor CSV', () => {
  it('menetralkan rumus dari data pelamar', () => {
    expect(selAman('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(selAman('+62812')).toBe("'+62812");
    expect(selAman('@a')).toBe("'@a");
    expect(selAman(-5)).toBe('-5');
    expect(selAman(72.5)).toBe('72,5');
    expect(selAman('a;b')).toBe('"a;b"');
    expect(selAman(null)).toBe('');
  });

  it('BOM, pemisah titik koma, satu baris per kandidat, label sementara', () => {
    const csv = buatCsv([k({ nama: 'Rina', skorAkhir: 80, skor: { sementara: true, komponen: { cv: 100 } } })]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const baris = csv.trim().split('\r\n');
    expect(baris).toHaveLength(2);
    const judul = baris[0].replace('\uFEFF', '').split(';');
    const isi = baris[1].split(';');
    expect(judul.length).toBe(isi.length);
    expect(isi[judul.indexOf('Skor sementara (CV belum dicek HR)')]).toBe('Ya');
    expect(() => buatCsv(null)).toThrow();
  });

  it('nama berkas aman', () => {
    expect(namaBerkas('Kasir / Outlet  Bandung', new Date('2026-10-26T00:00:00Z'))).toBe('kandidat-kasir-outlet-bandung-2026-10-26.csv');
    expect(namaBerkas('***', new Date('2026-10-26T00:00:00Z'))).toBe('kandidat-lowongan-2026-10-26.csv');
  });
});

describe('form lowongan', () => {
  const isi = (o = {}) => ({
    ...formBaru(),
    posisi: 'Kasir',
    budgetMaksimal: '4.500.000',
    skillWajib: 'Kasir, pelayanan, kasir',
    kebutuhanWaktu: 'Shift pagi',
    ...o,
  });

  it('membentuk body: rupiah bertitik, skill tanpa dobel, bobot persen → pecahan', () => {
    const { galat, body } = keBody(isi({ tes: [
      { jenisTes: 'logika', targetSkor: '80', batasBawah: '40', bobot: '33,3' },
      { jenisTes: 'hitung', targetSkor: '80', batasBawah: '40', bobot: '33.3' },
      { jenisTes: 'sikap', targetSkor: '80', batasBawah: '40', bobot: '33.4' },
    ] }));
    expect(galat).toEqual({});
    expect(body.budgetMaksimal).toBe(4_500_000);
    expect(body.skillWajib).toEqual(['Kasir', 'pelayanan']);
    expect(body.tes.map((t) => t.bobot)).toEqual([0.333, 0.333, 0.334]);
    expect(Math.abs(body.tes.reduce((t, x) => t + x.bobot, 0) - 1)).toBeLessThan(0.001);
  });

  it('menolak bobot tidak 100%, target ≤ batas bawah, nama tes dobel', () => {
    expect(keBody(isi({ tes: [{ jenisTes: 'a', targetSkor: '80', batasBawah: '40', bobot: '90' }] })).galat.tes).toMatch(/100%/);
    expect(keBody(isi({ tes: [{ jenisTes: 'a', targetSkor: '40', batasBawah: '40', bobot: '100' }] })).galat['tes.0.batasBawah']).toBeTruthy();
    const dobel = keBody(isi({ tes: [
      { jenisTes: 'Logika', targetSkor: '80', batasBawah: '40', bobot: '50' },
      { jenisTes: 'logika', targetSkor: '80', batasBawah: '40', bobot: '50' },
    ] }));
    expect(dobel.galat.tes).toMatch(/dobel|lebih dari sekali/);
    expect(dobel.body).toBeNull();
  });

  it('field wajib kosong → pesan per field; tanpa tes saat bukan draf', () => {
    const { galat } = keBody(formBaru());
    expect(Object.keys(galat)).toEqual(expect.arrayContaining(['posisi', 'budgetMaksimal', 'skillWajib', 'kebutuhanWaktu']));
    const { body } = keBody(isi({ tes: [] }), { sertakanTes: false });
    expect(body).not.toHaveProperty('tes');
  });

  it('bolak-balik dari data API', () => {
    const l = { posisi: 'K', budgetMaksimal: 5, skillWajib: ['a'], skillOpsional: [], kebutuhanWaktu: 'x', kataKunciSorot: ['SIM C'],
      tes: [{ id: 't1', jenisTes: 'logika', targetSkor: 80, batasBawah: 40, bobot: 0.6 }, { id: 't2', jenisTes: 'b', targetSkor: 80, batasBawah: 40, bobot: 0.4 }] };
    const { body } = keBody(dariLowongan(l));
    expect(body.tes).toEqual([{ id: 't1', jenisTes: 'logika', targetSkor: 80, batasBawah: 40, bobot: 0.6 }, { id: 't2', jenisTes: 'b', targetSkor: 80, batasBawah: 40, bobot: 0.4 }]);
    expect(body.kataKunciSorot).toEqual(['SIM C']);
    expect(pisahDaftar('a\nb, ,a')).toEqual(['a', 'b']);
    expect(rupiah('Rp 1.000')).toBe(1000);
  });
});

describe('form soal', () => {
  it('id opsi baru tidak bentrok', () => {
    expect(idOpsiBaru(['a', 'c'])).toBe('b');
    expect(idOpsiBaru([...'abcdefghijklmnopqrstuvwxyz'])).toBe('o27');
  });

  it('tambah/hapus opsi dibatasi 2–6, hapus kunci mengosongkan kunci', () => {
    let s = { ...soalKosong(), kunciOpsiId: 'c' };
    for (let i = 0; i < 5; i++) s = tambahOpsi(s);
    expect(s.opsi).toHaveLength(6);
    s = hapusOpsi(s, 'c');
    expect(s.kunciOpsiId).toBe('');
    let dua = soalKosong();
    dua = hapusOpsi(hapusOpsi(dua, 'a'), 'b');
    expect(dua.opsi).toHaveLength(2);
  });

  it('validasi: kunci wajib, opsi tidak kosong dan tidak kembar', () => {
    const s = { pertanyaan: 'Berapa 2+2?', opsi: [{ id: 'a', teks: '4' }, { id: 'b', teks: ' 4 ' }], kunciOpsiId: '', poin: '1' };
    const { galat } = keBodySoal(s);
    expect(galat.kunciOpsiId).toBeTruthy();
    expect(galat.opsi).toMatch(/sama/);
    const ok = keBodySoal({ ...s, opsi: [{ id: 'a', teks: '4' }, { id: 'b', teks: '5' }], kunciOpsiId: 'a' });
    expect(ok.body).toEqual({ pertanyaan: 'Berapa 2+2?', opsi: [{ id: 'a', teks: '4' }, { id: 'b', teks: '5' }], kunciOpsiId: 'a', poin: 1 });
  });

  it('geser urutan di batas tidak berubah', () => {
    expect(geser([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(geser([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(geser([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });
});

import { barisDariCv, validasiRiwayat } from '../src/rekruter/riwayat.js';

describe('koreksi riwayat kerja', () => {
  it('dari data CV: tanpa tanggal dan masih bekerja dikenali', () => {
    expect(barisDariCv([{ perusahaan: 'A', mulai: null, selesai: null }, { perusahaan: 'B', mulai: '2024-01', selesai: null }])).toEqual([
      { perusahaan: 'A', mulai: '', selesai: '', tanpaTanggal: true, masihBekerja: false },
      { perusahaan: 'B', mulai: '2024-01', selesai: '', tanpaTanggal: false, masihBekerja: true },
    ]);
  });

  it('validasi sama dengan aturan API', () => {
    const b = (o) => ({ perusahaan: 'Toko', mulai: '2024-01', selesai: '2024-06', tanpaTanggal: false, masihBekerja: false, ...o });
    const sekarang = '2026-10';
    expect(validasiRiwayat([b()], sekarang)).toEqual({ galat: {}, hasil: [{ perusahaan: 'Toko', mulai: '2024-01', selesai: '2024-06' }] });
    expect(validasiRiwayat([b({ selesai: '2023-12' })], sekarang).galat[0]).toMatch(/sebelum/);
    expect(validasiRiwayat([b({ mulai: '2027-01' })], sekarang).galat[0]).toMatch(/masa depan/);
    expect(validasiRiwayat([b({ selesai: '' })], sekarang).galat[0]).toMatch(/selesai/);
    expect(validasiRiwayat([b({ perusahaan: ' ' })], sekarang).galat[0]).toMatch(/nama/);
    expect(validasiRiwayat([b({ masihBekerja: true })], sekarang).hasil[0].selesai).toBeNull();
    expect(validasiRiwayat([b({ tanpaTanggal: true, mulai: 'x' })], sekarang).hasil[0]).toEqual({ perusahaan: 'Toko', mulai: null, selesai: null });
  });
});
