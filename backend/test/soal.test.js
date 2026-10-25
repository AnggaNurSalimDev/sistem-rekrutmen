import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { validasiSoal, nilaiJawabanPilihanGanda, soalUntukKandidat } from '../src/scoring/soal.js';
import { ScoringInputError } from '../src/scoring/errors.js';

const SOAL = JSON.parse(readFileSync(new URL('./fixtures/soal-logika.json', import.meta.url), 'utf8'));

// Soal aktif: s1 (1 poin), s2 (1 poin), s3 (2 poin) → total 4 poin. s4 nonaktif.

describe('2.9 Validasi soal', () => {
  const dasar = () => ({
    id: 'x',
    pertanyaan: 'Pertanyaan?',
    opsi: [
      { id: 'a', teks: 'Ya' },
      { id: 'b', teks: 'Tidak' },
    ],
    kunciOpsiId: 'a',
  });

  test('soal valid lolos, poin default 1', () => assert.doesNotThrow(() => validasiSoal(dasar())));

  test('kunci bukan salah satu opsi ditolak', () => {
    assert.throws(() => validasiSoal({ ...dasar(), kunciOpsiId: 'z' }), /kunci jawaban/);
  });

  test('kurang dari 2 atau lebih dari 6 opsi ditolak', () => {
    assert.throws(() => validasiSoal({ ...dasar(), opsi: [{ id: 'a', teks: 'Ya' }] }), /jumlah opsi/);
    const tujuh = Array.from({ length: 7 }, (_, i) => ({ id: `o${i}`, teks: `Opsi ${i}` }));
    assert.throws(() => validasiSoal({ ...dasar(), opsi: tujuh, kunciOpsiId: 'o0' }), /jumlah opsi/);
  });

  test('pertanyaan kosong, teks opsi kosong, id opsi ganda, poin ≤ 0 ditolak', () => {
    assert.throws(() => validasiSoal({ ...dasar(), pertanyaan: '   ' }), ScoringInputError);
    assert.throws(
      () => validasiSoal({ ...dasar(), opsi: [{ id: 'a', teks: 'Ya' }, { id: 'b', teks: '' }] }),
      ScoringInputError,
    );
    assert.throws(
      () => validasiSoal({ ...dasar(), opsi: [{ id: 'a', teks: 'Ya' }, { id: 'a', teks: 'Tidak' }] }),
      /id opsi ganda/,
    );
    assert.throws(() => validasiSoal({ ...dasar(), poin: 0 }), /poin/);
  });
});

describe('2.9 Penilaian jawaban pilihan ganda', () => {
  test('semua benar → 100', () => {
    const hasil = nilaiJawabanPilihanGanda(SOAL, [
      { soalId: 's1', opsiDipilih: 'a' },
      { soalId: 's2', opsiDipilih: 'c' },
      { soalId: 's3', opsiDipilih: 'b' },
    ]);
    assert.equal(hasil.skorPencapaian, 100);
    assert.equal(hasil.poinTotal, 4);
  });

  test('poin berbeda per soal: hanya s3 (2 poin) benar → 50', () => {
    const hasil = nilaiJawabanPilihanGanda(SOAL, [
      { soalId: 's1', opsiDipilih: 'b' },
      { soalId: 's2', opsiDipilih: 'a' },
      { soalId: 's3', opsiDipilih: 'b' },
    ]);
    assert.equal(hasil.skorPencapaian, 50);
  });

  test('soal tidak dijawab dihitung salah: hanya s1 dijawab benar → 25', () => {
    const hasil = nilaiJawabanPilihanGanda(SOAL, [{ soalId: 's1', opsiDipilih: 'a' }]);
    assert.equal(hasil.skorPencapaian, 25);
    assert.equal(hasil.rincian.find((r) => r.soalId === 's3').opsiDipilih, null);
  });

  test('jawaban null (dikosongkan) dihitung salah', () => {
    const hasil = nilaiJawabanPilihanGanda(SOAL, [{ soalId: 's1', opsiDipilih: null }]);
    assert.equal(hasil.skorPencapaian, 0);
  });

  test('soal nonaktif tidak ikut dihitung (total 4, bukan 9)', () => {
    const hasil = nilaiJawabanPilihanGanda(SOAL, []);
    assert.equal(hasil.poinTotal, 4);
    assert.ok(!hasil.rincian.some((r) => r.soalId === 's4'));
  });

  test('jawaban untuk soal asing, soal nonaktif, atau opsi asing ditolak', () => {
    assert.throws(() => nilaiJawabanPilihanGanda(SOAL, [{ soalId: 'zzz', opsiDipilih: 'a' }]), /tidak valid/);
    assert.throws(() => nilaiJawabanPilihanGanda(SOAL, [{ soalId: 's4', opsiDipilih: 'a' }]), /tidak valid/);
    assert.throws(() => nilaiJawabanPilihanGanda(SOAL, [{ soalId: 's1', opsiDipilih: 'e' }]), /tidak ada di soal/);
  });

  test('jawaban ganda untuk satu soal ditolak', () => {
    assert.throws(
      () =>
        nilaiJawabanPilihanGanda(SOAL, [
          { soalId: 's1', opsiDipilih: 'a' },
          { soalId: 's1', opsiDipilih: 'b' },
        ]),
      /Jawaban ganda/,
    );
  });

  test('tes tanpa soal aktif ditolak, bukan dibagi 0', () => {
    assert.throws(() => nilaiJawabanPilihanGanda([SOAL[3]], []), /tidak punya soal aktif/);
    assert.throws(() => nilaiJawabanPilihanGanda([], []), /tidak punya soal aktif/);
  });
});

describe('2.9 Soal untuk kandidat', () => {
  test('kunci jawaban tidak pernah ikut terkirim', () => {
    const aman = soalUntukKandidat(SOAL);
    const json = JSON.stringify(aman);
    assert.ok(!json.includes('kunciOpsiId'));
    assert.ok(!json.includes('poin'));
    assert.ok(!json.includes('aktif'));
  });

  test('soal nonaktif disembunyikan dan urutan mengikuti kolom urutan', () => {
    const acak = [SOAL[2], SOAL[0], SOAL[3], SOAL[1]];
    assert.deepEqual(
      soalUntukKandidat(acak).map((s) => s.id),
      ['s1', 's2', 's3'],
    );
  });

  test('input tidak dimutasi oleh pengurutan', () => {
    const acak = [SOAL[2], SOAL[0], SOAL[1]];
    soalUntukKandidat(acak);
    assert.deepEqual(acak.map((s) => s.id), ['s3', 's1', 's2']);
  });
});
