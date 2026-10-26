import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { hitungSkorKandidat } from '../src/scoring/index.js';

const bacaJson = (nama) => JSON.parse(readFileSync(new URL(`./fixtures/${nama}`, import.meta.url), 'utf8'));
const LOWONGAN = bacaJson('lowongan.json');
const KANDIDAT = bacaJson('kandidat.json');

describe('2.7 Agregat skor akhir (fixture JSON statis)', () => {
  test('kandidat dengan semua komponen 100 → skor akhir 100', () => {
    const hasil = hitungSkorKandidat(LOWONGAN, KANDIDAT.sempurna);
    assert.equal(hasil.status, 'lengkap');
    assert.deepEqual(hasil.komponen, { cv: 100, tenure: 100, tes: 100, anggaran: 100, waktu: 100 });
    assert.equal(hasil.skorAkhir, 100);
    assert.deepEqual(hasil.flags, []);
  });

  test('fresh graduate: tenure 50 → skor akhir 90, ada flag', () => {
    const hasil = hitungSkorKandidat(LOWONGAN, KANDIDAT.freshGraduate);
    assert.equal(hasil.komponen.tenure, 50);
    assert.equal(hasil.skorAkhir, 90);
    assert.deepEqual(hasil.flags, ['tanpa_riwayat_kerja']);
  });

  test('ujian belum lengkap → skor akhir null, komponen lain tetap terlihat', () => {
    const hasil = hitungSkorKandidat(LOWONGAN, KANDIDAT.belumUjian);
    assert.equal(hasil.status, 'belum_lengkap');
    assert.equal(hasil.skorAkhir, null);
    assert.deepEqual(hasil.dataKurang, ['tes']);
    assert.equal(hasil.komponen.tes, null);
    assert.equal(hasil.komponen.cv, 33.33);
    assert.equal(hasil.komponen.waktu, 50);
  });

  test('ekstraksi CV gagal → skor akhir null + flag, bukan dihukum 0', () => {
    const hasil = hitungSkorKandidat(LOWONGAN, KANDIDAT.ekstraksiGagal);
    assert.equal(hasil.skorAkhir, null);
    assert.deepEqual(hasil.dataKurang, ['cv']);
    assert.deepEqual(hasil.flags, ['ekstraksi_gagal']);
    assert.equal(hasil.komponen.cv, null);
    assert.equal(hasil.komponen.tenure, null);
  });

  test('hitungan campuran diverifikasi manual', () => {
    // CV 2/3 = 66,667 · Tenure (12+3)/2 = 7,5 bln → 50
    // Tes: logika (60-40)/40 = 50, coding (70-50)/40 = 50 → 50
    // Anggaran: 8,6 jt vs 8 jt = 7,5% → 50 · Waktu sebagian = 50
    // Akhir = 0,3·66,667 + 0,2·50 + 0,3·50 + 0,1·50 + 0,1·50 = 55
    const kandidat = {
      tanggalLamaran: '2026-10-25',
      ekspektasiGaji: 8_600_000,
      ketersediaanWaktu: 'sebagian',
      cv: {
        statusEkstraksi: 'berhasil',
        skills: ['React.js', 'JS'],
        riwayatKerja: [
          { perusahaan: 'A', mulai: '2024-01', selesai: '2024-12' },
          { perusahaan: 'B', mulai: '2025-01', selesai: '2025-03' },
        ],
      },
      hasilUjian: [
        { lowonganTesId: 'tes-logika', skorPencapaian: 60 },
        { lowonganTesId: 'tes-coding', skorPencapaian: 70 },
      ],
    };
    const hasil = hitungSkorKandidat(LOWONGAN, kandidat);
    assert.deepEqual(hasil.komponen, { cv: 66.67, tenure: 50, tes: 50, anggaran: 50, waktu: 50 });
    assert.equal(hasil.skorAkhir, 55);
  });

  test('pembulatan hanya di akhir, bukan per komponen', () => {
    // CV 1/3 = 33,333… · Jika dibulatkan dulu ke 33,33 lalu ×0,3 = 9,999 → hasil akhir berbeda.
    const kandidat = {
      ...KANDIDAT.sempurna,
      cv: { ...KANDIDAT.sempurna.cv, skills: ['react'] },
    };
    const hasil = hitungSkorKandidat(LOWONGAN, kandidat);
    // 0,3·33,333… + 70 = 80 tepat
    assert.equal(hasil.skorAkhir, 80);
  });

  test('lowongan tidak valid ditolak sebelum menghitung apa pun', () => {
    const rusak = { ...LOWONGAN, tes: [{ ...LOWONGAN.tes[0], bobot: 0.5 }] };
    assert.throws(() => hitungSkorKandidat(rusak, KANDIDAT.sempurna), /Jumlah bobot/);
  });

  test('fungsi murni: input tidak dimutasi', () => {
    const salinan = structuredClone(KANDIDAT.sempurna);
    hitungSkorKandidat(LOWONGAN, KANDIDAT.sempurna);
    assert.deepEqual(KANDIDAT.sempurna, salinan);
  });

  describe('Skor sementara (pilihan B)', () => {
    const denganCv = (ubahCv) => ({ ...KANDIDAT.sempurna, cv: { ...KANDIDAT.sempurna.cv, ...ubahCv } });

    test('CV dari parser belum diverifikasi → skor tetap dihitung, berlabel sementara', () => {
      const hasil = hitungSkorKandidat(LOWONGAN, KANDIDAT.sempurna);
      assert.equal(hasil.skorAkhir, 100);
      assert.equal(hasil.sementara, true);
      assert.equal(hasil.cvTerverifikasi, false);
    });

    test('CV sudah dikonfirmasi HR → tidak sementara', () => {
      const hasil = hitungSkorKandidat(LOWONGAN, denganCv({ terverifikasi: true }));
      assert.equal(hasil.sementara, false);
      assert.equal(hasil.cvTerverifikasi, true);
    });

    test('status perlu_tinjau tetap menghasilkan skor + flag cv_perlu_tinjau', () => {
      const hasil = hitungSkorKandidat(LOWONGAN, denganCv({ statusEkstraksi: 'perlu_tinjau' }));
      assert.equal(hasil.skorAkhir, 100);
      assert.equal(hasil.sementara, true);
      assert.ok(hasil.flags.includes('cv_perlu_tinjau'));

      const sudah = hitungSkorKandidat(LOWONGAN, denganCv({ statusEkstraksi: 'perlu_tinjau', terverifikasi: true }));
      assert.ok(!sudah.flags.includes('cv_perlu_tinjau'));
      assert.equal(sudah.sementara, false);
    });

    test('nilai "terverifikasi" selain true persis tidak dianggap terverifikasi', () => {
      for (const nilai of ['true', 1, 'ya', null]) {
        assert.equal(hitungSkorKandidat(LOWONGAN, denganCv({ terverifikasi: nilai })).sementara, true, String(nilai));
      }
    });

    test('CV gagal atau belum diekstrak → skor akhir null, bukan skor sementara', () => {
      for (const statusEkstraksi of ['gagal', 'menunggu']) {
        const hasil = hitungSkorKandidat(LOWONGAN, denganCv({ statusEkstraksi }));
        assert.equal(hasil.skorAkhir, null, statusEkstraksi);
        assert.equal(hasil.komponen.cv, null);
        assert.equal(hasil.sementara, false);
      }
    });
  });
});
