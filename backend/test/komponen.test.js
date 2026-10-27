import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { normalisasiSkill } from '../src/scoring/skills.js';
import { hitungSkorCv } from '../src/scoring/cv.js';
import { hitungRiwayatKerja } from '../src/scoring/riwayatKerja.js';
import { hitungSkorTenure } from '../src/scoring/tenure.js';
import { normalisasiSkorTes, hitungSkorTes } from '../src/scoring/tes.js';
import { hitungSkorAnggaran, hitungSkorWaktu } from '../src/scoring/anggaranWaktu.js';
import { validasiLowongan } from '../src/scoring/validasi.js';
import { ScoringInputError } from '../src/scoring/errors.js';

const PENUH_TOLERANSI = 1e-9;
const kiraKira = (aktual, harapan) =>
  assert.ok(Math.abs(aktual - harapan) < PENUH_TOLERANSI, `harapan ${harapan}, didapat ${aktual}`);

describe('2.1 Normalisasi skill', () => {
  test('penulisan berbeda dipetakan ke nama kanonik yang sama', () => {
    for (const variasi of ['ReactJS', 'react', 'React.js', ' REACT ', 'react-js']) {
      assert.equal(normalisasiSkill(variasi), 'react', variasi);
    }
  });

  test('C++ dan C# tidak runtuh menjadi "c"', () => {
    assert.equal(normalisasiSkill('C++'), 'cplusplus');
    assert.equal(normalisasiSkill('C#'), 'csharp');
    assert.equal(normalisasiSkill('C'), 'c');
  });

  test('input kosong atau bukan string → null', () => {
    assert.equal(normalisasiSkill(''), null);
    assert.equal(normalisasiSkill('  .  '), null);
    assert.equal(normalisasiSkill(undefined), null);
    assert.equal(normalisasiSkill(42), null);
  });
});

describe('2.2 Skor CV', () => {
  test('"ReactJS" di CV cocok dengan "react" di lowongan', () => {
    const hasil = hitungSkorCv(['react'], ['ReactJS']);
    assert.equal(hasil.skor, 100);
  });

  test('2 dari 3 skill wajib → 66,67', () => {
    const hasil = hitungSkorCv(['React', 'JavaScript', 'Git'], ['react', 'js']);
    kiraKira(hasil.skor, 200 / 3);
    assert.deepEqual(hasil.tidakDitemukan, ['Git']);
  });

  test('skill dilaporkan dengan ejaan lowongan, bukan bentuk ternormalisasi', () => {
    const hasil = hitungSkorCv(['Manajemen Stok', ' Microsoft Excel '], ['manajemen  stok', 'MS Excel']);
    assert.deepEqual(hasil.ditemukan, ['Manajemen Stok', 'Microsoft Excel']);
    assert.deepEqual(hasil.tidakDitemukan, []);
  });

  test('skill wajib kosong ditolak, bukan dibagi 0', () => {
    assert.throws(() => hitungSkorCv([], ['react']), ScoringInputError);
    assert.throws(() => hitungSkorCv(['', '  '], ['react']), ScoringInputError);
  });
});

describe('2.3 Riwayat kerja', () => {
  const LAMARAN = '2026-10-25';

  test('durasi inklusif: Jan–Jun = 6 bulan', () => {
    const hasil = hitungRiwayatKerja([{ perusahaan: 'A', mulai: '2024-01', selesai: '2024-06' }], LAMARAN);
    assert.equal(hasil.totalBulan, 6);
    assert.equal(hasil.jumlahPerusahaan, 1);
  });

  test('selesai = null dihitung sampai bulan lamaran', () => {
    const hasil = hitungRiwayatKerja([{ perusahaan: 'A', mulai: '2026-01', selesai: null }], LAMARAN);
    assert.equal(hasil.totalBulan, 10);
  });

  test('entri tidak valid dibuang dan diberi flag', () => {
    const hasil = hitungRiwayatKerja(
      [
        { perusahaan: 'Valid', mulai: '2024-01', selesai: '2024-12' },
        { perusahaan: 'Terbalik', mulai: '2024-06', selesai: '2024-01' },
        { perusahaan: 'Rusak', mulai: 'Januari 2024', selesai: '2024-05' },
        { perusahaan: '', mulai: '2024-01', selesai: '2024-02' },
        { perusahaan: 'Masa depan', mulai: '2027-01', selesai: null },
      ],
      LAMARAN,
    );
    assert.equal(hasil.totalBulan, 12);
    assert.equal(hasil.jumlahPerusahaan, 1);
    assert.equal(hasil.entriDibuang.length, 4);
    assert.deepEqual(hasil.flags, ['riwayat_tidak_valid']);
  });

  test('perusahaan yang sama dengan penulisan berbeda dihitung satu', () => {
    const hasil = hitungRiwayatKerja(
      [
        { perusahaan: 'PT Maju', mulai: '2022-01', selesai: '2022-06' },
        { perusahaan: ' pt  MAJU ', mulai: '2023-01', selesai: '2023-06' },
      ],
      LAMARAN,
    );
    assert.equal(hasil.jumlahPerusahaan, 1);
    assert.equal(hasil.totalBulan, 12);
  });

  test('entri tanpa tanggal (mulai = null) tidak dibuang dan tidak ditebak', () => {
    const hasil = hitungRiwayatKerja(
      [
        { perusahaan: 'Kebab Turki Bandung', mulai: null, selesai: null },
        { perusahaan: 'Bengkel Poles', mulai: null, selesai: null },
        { perusahaan: 'Toko Hewan', mulai: null, selesai: '2023-01' },
      ],
      LAMARAN,
    );
    assert.equal(hasil.totalBulan, 0);
    assert.equal(hasil.jumlahPerusahaan, 0);
    assert.equal(hasil.jumlahTanpaTanggal, 3);
    assert.deepEqual(hasil.entriDibuang, []);
    assert.deepEqual(hasil.flags, ['lama_kerja_tidak_disebut']);
  });

  test('campuran: hanya entri bertanggal yang dihitung, sisanya diberi flag', () => {
    const hasil = hitungRiwayatKerja(
      [
        { perusahaan: 'PT A', mulai: '2024-01', selesai: '2024-12' },
        { perusahaan: 'Warung B', mulai: null, selesai: null },
      ],
      LAMARAN,
    );
    assert.equal(hasil.totalBulan, 12);
    assert.equal(hasil.jumlahPerusahaan, 1);
    assert.equal(hasil.jumlahTanpaTanggal, 1);
    assert.deepEqual(hasil.flags, ['lama_kerja_tidak_disebut']);
  });

  test('perusahaan yang sama bertanggal di entri lain tidak dihitung "tanpa tanggal"', () => {
    const hasil = hitungRiwayatKerja(
      [
        { perusahaan: 'PT A', mulai: '2024-01', selesai: '2024-12' },
        { perusahaan: 'pt a', mulai: null, selesai: null },
      ],
      LAMARAN,
    );
    assert.equal(hasil.jumlahTanpaTanggal, 0);
    assert.deepEqual(hasil.flags, []);
  });

  test('tanggal lamaran tidak valid ditolak', () => {
    assert.throws(() => hitungRiwayatKerja([], '25-10-2026'), ScoringInputError);
  });
});

describe('2.4 Tenure', () => {
  test('tepat 6 bulan → 50', () => {
    assert.equal(hitungSkorTenure({ totalBulan: 6, jumlahPerusahaan: 1 }).skor, 50);
  });

  test('tepat 12 bulan → 50', () => {
    assert.equal(hitungSkorTenure({ totalBulan: 12, jumlahPerusahaan: 1 }).skor, 50);
  });

  test('di bawah 6 → 0, di atas 12 → 100', () => {
    assert.equal(hitungSkorTenure({ totalBulan: 11, jumlahPerusahaan: 2 }).skor, 0);
    assert.equal(hitungSkorTenure({ totalBulan: 25, jumlahPerusahaan: 2 }).skor, 100);
  });

  test('fresh graduate (0 perusahaan) → 50 + flag, bukan NaN atau 100', () => {
    const hasil = hitungSkorTenure({ totalBulan: 0, jumlahPerusahaan: 0 });
    assert.equal(hasil.skor, 50);
    assert.ok(!Number.isNaN(hasil.skor));
    assert.deepEqual(hasil.flags, ['tanpa_riwayat_kerja']);
  });

  test('pilihan (a): punya pengalaman tapi tanpa tanggal → 50 + lama_kerja_tidak_disebut, BUKAN fresh graduate', () => {
    const hasil = hitungSkorTenure({ totalBulan: 0, jumlahPerusahaan: 0, jumlahTanpaTanggal: 3 });
    assert.equal(hasil.skor, 50);
    assert.deepEqual(hasil.flags, ['lama_kerja_tidak_disebut']);
    assert.ok(!hasil.flags.includes('tanpa_riwayat_kerja'));
  });

  test('campuran: skor dari entri bertanggal, tetap diberi flag', () => {
    const hasil = hitungSkorTenure({ totalBulan: 24, jumlahPerusahaan: 1, jumlahTanpaTanggal: 2 });
    assert.equal(hasil.skor, 100);
    assert.deepEqual(hasil.flags, ['lama_kerja_tidak_disebut']);
  });

  test('input negatif atau pecahan ditolak', () => {
    assert.throws(() => hitungSkorTenure({ totalBulan: 0, jumlahPerusahaan: 0, jumlahTanpaTanggal: -1 }), ScoringInputError);
    assert.throws(() => hitungSkorTenure({ totalBulan: -1, jumlahPerusahaan: 1 }), ScoringInputError);
    assert.throws(() => hitungSkorTenure({ totalBulan: 5, jumlahPerusahaan: 0.5 }), ScoringInputError);
  });
});

describe('2.5 Tes teknis', () => {
  test('tepat di batas bawah → 0', () => assert.equal(normalisasiSkorTes(40, 80, 40), 0));
  test('di bawah batas bawah → 0', () => assert.equal(normalisasiSkorTes(10, 80, 40), 0));
  test('di antara → proporsional', () => assert.equal(normalisasiSkorTes(60, 80, 40), 50));
  test('tepat di target → 100', () => assert.equal(normalisasiSkorTes(80, 80, 40), 100));
  test('di atas target → 100', () => assert.equal(normalisasiSkorTes(99, 80, 40), 100));

  test('target ≤ batas bawah ditolak, bukan dibagi 0', () => {
    assert.throws(() => normalisasiSkorTes(50, 40, 40), ScoringInputError);
  });

  const TES = [
    { id: 'a', jenisTes: 'logika', targetSkor: 80, batasBawah: 40, bobot: 0.4 },
    { id: 'b', jenisTes: 'coding', targetSkor: 90, batasBawah: 50, bobot: 0.6 },
  ];

  test('rata-rata tertimbang: 0,4×50 + 0,6×100 = 80', () => {
    const hasil = hitungSkorTes(TES, [
      { lowonganTesId: 'a', skorPencapaian: 60 },
      { lowonganTesId: 'b', skorPencapaian: 95 },
    ]);
    kiraKira(hasil.skor, 80);
  });

  test('ujian belum lengkap → null, bukan 0', () => {
    const hasil = hitungSkorTes(TES, [{ lowonganTesId: 'a', skorPencapaian: 60 }]);
    assert.equal(hasil.skor, null);
    assert.deepEqual(hasil.belumDikerjakan, ['coding']);
  });

  test('hasil ganda atau id tes asing ditolak', () => {
    assert.throws(
      () =>
        hitungSkorTes(TES, [
          { lowonganTesId: 'a', skorPencapaian: 60 },
          { lowonganTesId: 'a', skorPencapaian: 70 },
        ]),
      ScoringInputError,
    );
    assert.throws(() => hitungSkorTes(TES, [{ lowonganTesId: 'zzz', skorPencapaian: 60 }]), ScoringInputError);
  });
});

describe('2.6 Anggaran dan ketersediaan waktu', () => {
  const BUDGET = 1_000_000;

  test('sama dengan budget → 100', () => assert.equal(hitungSkorAnggaran(1_000_000, BUDGET), 100));
  test('di bawah budget → 100', () => assert.equal(hitungSkorAnggaran(500_000, BUDGET), 100));
  test('7,5% di atas budget → 50', () => kiraKira(hitungSkorAnggaran(1_075_000, BUDGET), 50));
  test('tepat 15% di atas budget → 0', () => kiraKira(hitungSkorAnggaran(1_150_000, BUDGET), 0));
  test('16% di atas budget → 0', () => assert.equal(hitungSkorAnggaran(1_160_000, BUDGET), 0));

  test('budget 0 dan ekspektasi negatif ditolak', () => {
    assert.throws(() => hitungSkorAnggaran(100, 0), ScoringInputError);
    assert.throws(() => hitungSkorAnggaran(-1, BUDGET), ScoringInputError);
  });

  test('ketersediaan waktu: penuh/sebagian/tidak', () => {
    assert.equal(hitungSkorWaktu('penuh'), 100);
    assert.equal(hitungSkorWaktu('sebagian'), 50);
    assert.equal(hitungSkorWaktu('tidak'), 0);
  });

  test('jawaban di luar pilihan ditolak (termasuk "toString")', () => {
    assert.throws(() => hitungSkorWaktu('mungkin'), ScoringInputError);
    assert.throws(() => hitungSkorWaktu('toString'), ScoringInputError);
    assert.throws(() => hitungSkorWaktu(undefined), ScoringInputError);
  });
});

describe('Validasi invariant lowongan', () => {
  const dasar = () => ({
    budgetMaksimal: 5_000_000,
    skillWajib: ['react'],
    tes: [{ id: 't1', jenisTes: 'coding', targetSkor: 80, batasBawah: 40, bobot: 1 }],
  });

  test('lowongan valid lolos', () => assert.doesNotThrow(() => validasiLowongan(dasar())));

  test('jumlah bobot bukan 1 ditolak', () => {
    const l = dasar();
    l.tes[0].bobot = 0.9;
    assert.throws(() => validasiLowongan(l), /Jumlah bobot/);
  });

  test('bobot 0,1 + 0,2 + 0,7 diterima (toleransi floating point)', () => {
    const l = dasar();
    l.tes = [
      { id: 'a', targetSkor: 80, batasBawah: 40, bobot: 0.1 },
      { id: 'b', targetSkor: 80, batasBawah: 40, bobot: 0.2 },
      { id: 'c', targetSkor: 80, batasBawah: 40, bobot: 0.7 },
    ];
    assert.doesNotThrow(() => validasiLowongan(l));
  });

  test('skill wajib kosong, budget 0, target ≤ batas bawah ditolak', () => {
    assert.throws(() => validasiLowongan({ ...dasar(), skillWajib: [] }), ScoringInputError);
    assert.throws(() => validasiLowongan({ ...dasar(), budgetMaksimal: 0 }), ScoringInputError);
    const l = dasar();
    l.tes[0].targetSkor = 40;
    assert.throws(() => validasiLowongan(l), ScoringInputError);
  });
});
