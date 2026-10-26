import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseCvRegex, daftarPaket } from '../src/cv/index.js';
import { periksaPaket } from '../src/cv/paket/index.js';
import { hitungSkorCv } from '../src/scoring/cv.js';

const ACUAN = '2026-10-26';
const TEKS_KRU = readFileSync(new URL('./fixtures/cv/kru-outlet.txt', import.meta.url), 'utf8');
const parse = (teks, opsi = {}) => parseCvRegex(teks, { tanggalAcuan: ACUAN, paket: ['kru-outlet'], ...opsi });

describe('Paket kamus: validasi', () => {
  test('semua paket bawaan valid dan id-nya unik', () => {
    const paket = daftarPaket();
    assert.ok(paket.length >= 2);
    for (const p of paket) assert.deepEqual(periksaPaket(p), [], p.id);
    assert.equal(new Set(paket.map((p) => p.id)).size, paket.length);
  });

  test('kesalahan paket buatan terdeteksi dengan pesan jelas', () => {
    const dasar = { id: 'contoh', nama: 'Contoh', skill: [{ nama: 'Kasir' }] };
    const kasus = [
      [{ ...dasar, id: 'Ada Spasi' }, /id harus/],
      [{ ...dasar, skill: [] }, /skill minimal 1/],
      [{ ...dasar, skill: [{ nama: 'Kebersihan', alias: ['5R'] }] }, /terlalu pendek.*persis/],
      [{ ...dasar, skill: [{ nama: 'Kasir' }, { nama: 'Kassa', alias: ['kasir'] }] }, /dipakai oleh dua skill/],
      [{ ...dasar, kataKunci: [{ label: 'X', kategori: 'gaji', pola: ['x'] }] }, /kategori "gaji"/],
      [{ ...dasar, kataKunci: [{ label: 'X', kategori: 'sertifikat', pola: ['(rusak'] }] }, /bukan regex valid/],
      [{ ...dasar, kataKunci: [{ label: 'X', kategori: 'sertifikat', pola: ['a*'] }] }, /cocok dengan teks kosong/],
    ];
    for (const [paket, pesan] of kasus) {
      const masalah = periksaPaket(paket);
      assert.ok(masalah.some((m) => pesan.test(m)), `${pesan}: ${JSON.stringify(masalah)}`);
    }
  });
});

describe('Paket Kru Outlet', () => {
  test('CV kru outlet terbaca lengkap dengan keyakinan tinggi', () => {
    const hasil = parse(TEKS_KRU);
    assert.equal(hasil.keyakinan, 'tinggi', hasil.alasanTinjau.join(' | '));
    assert.deepEqual(hasil.riwayatKerja, [
      { perusahaan: 'Indomaret Cabang Cimahi', mulai: '2023-03', selesai: null },
      { perusahaan: 'Kopi Kenangan Dago', mulai: '2021-06', selesai: '2023-02' },
    ]);
    for (const s of ['Kasir', 'Barista', 'Cash Handling', 'Kebersihan Outlet', 'Penanganan Komplain', 'Mesin POS']) {
      assert.ok(hasil.skills.includes(s), s);
    }
  });

  test('alias dipetakan ke satu skill ("closing kasir" → Cash Handling, "5R" → Kebersihan Outlet)', () => {
    const hasil = parse(TEKS_KRU);
    const label = (potongan) => hasil.sorotan.find((s) => TEKS_KRU.slice(s.awal, s.akhir) === potongan)?.label;
    assert.equal(label('closing kasir'), 'Cash Handling');
    assert.equal(label('5R'), 'Kebersihan Outlet');
    assert.equal(label('latte art'), 'Barista');
  });

  test('merek tanpa "PT" dikenali sebagai tempat kerja hanya jika paket dipilih', () => {
    const tanpa = parseCvRegex(TEKS_KRU, { tanggalAcuan: ACUAN, paket: [] });
    assert.ok(tanpa.alasanTinjau.some((a) => a.includes('hanya ditebak')));
    assert.ok(!parse(TEKS_KRU).alasanTinjau.some((a) => a.includes('hanya ditebak')));
  });

  test('kata kunci non-skill: sertifikat, ketersediaan, jabatan', () => {
    const label = parse(TEKS_KRU).temuanLain.map((t) => `${t.kategori}:${t.label}`);
    for (const harap of [
      'sertifikat:Sertifikat penjamah makanan',
      'sertifikat:SIM C',
      'ketersediaan:Bersedia kerja shift',
      'ketersediaan:Bersedia ditempatkan',
      'jabatan:Pengalaman jabatan kru outlet',
    ]) {
      assert.ok(label.includes(harap), harap);
    }
  });

  test('"POS" hanya cocok jika ditulis persis; "kantor pos" bukan skill', () => {
    assert.ok(!parse('Pernah magang di kantor pos Cimahi').skills.includes('Mesin POS'));
    assert.ok(parse('Terbiasa memakai POS dan mesin EDC').skills.includes('Mesin POS'));
  });

  test('istilah HR menang: lowongan menulis "Cashier", CV menulis "kasir"', () => {
    const hasil = parse('Keahlian\nkasir, pelayanan pelanggan', { skillLowongan: ['Cashier'] });
    assert.ok(hasil.skills.includes('Cashier'));
    assert.ok(!hasil.skills.includes('Kasir'));
    assert.equal(hitungSkorCv(['Cashier', 'Pelayanan Pelanggan'], hasil.skills).skor, 100);
  });

  test('deskripsi tugas yang memuat kata "outlet" tidak membalik arah pencarian perusahaan', () => {
    const teks = [
      'Pengalaman Kerja',
      'Toko Sinar Jaya',
      'Pramuniaga | Jan 2020 - Des 2021',
      '- Menjaga kebersihan outlet',
      'Kafe Senja',
      'Barista | Jan 2022 - Des 2023',
      '- Membersihkan area outlet',
    ].join('\n');
    assert.deepEqual(
      parse(teks).riwayatKerja.map((r) => r.perusahaan),
      ['Toko Sinar Jaya', 'Kafe Senja'],
    );
  });
});

describe('Sorotan untuk HR', () => {
  test('posisi sorotan tepat menunjuk teks yang ditemukan', () => {
    const hasil = parse(TEKS_KRU);
    const ambil = (kategori) =>
      hasil.sorotan.filter((s) => s.kategori === kategori).map((s) => TEKS_KRU.slice(s.awal, s.akhir));
    assert.deepEqual(ambil('tanggal'), ['Maret 2023 - Sekarang', 'Juni 2021 - Februari 2023']);
    assert.deepEqual(ambil('perusahaan'), ['Indomaret Cabang Cimahi', 'Kopi Kenangan Dago']);
    assert.ok(ambil('bagian').includes('PENGALAMAN KERJA'));
    assert.ok(ambil('sertifikat').includes('SIM C'));
  });

  test('setiap kemunculan skill disorot, bukan hanya yang pertama', () => {
    const teks = 'Keahlian\nKasir\nPengalaman Kerja\nKasir | Jan 2020 - Des 2021\nIndomaret';
    const kasir = parse(teks).sorotan.filter((s) => s.label === 'Kasir');
    assert.equal(kasir.length, 2);
  });

  test('sorotan tidak tumpang tindih dan urut posisi', () => {
    const { sorotan } = parse(TEKS_KRU);
    for (let i = 1; i < sorotan.length; i++) {
      assert.ok(sorotan[i].awal >= sorotan[i - 1].akhir, JSON.stringify([sorotan[i - 1], sorotan[i]]));
    }
  });

  test('posisi tetap benar jika baris diawali spasi', () => {
    const teks = 'Pengalaman Kerja\n    PT Maju Jaya\n   Kasir | 03/2020 - 04/2021';
    const { sorotan } = parse(teks);
    const potong = sorotan.map((s) => teks.slice(s.awal, s.akhir));
    assert.ok(potong.includes('PT Maju Jaya'), JSON.stringify(potong));
    assert.ok(potong.includes('03/2020 - 04/2021'), JSON.stringify(potong));
  });
});
