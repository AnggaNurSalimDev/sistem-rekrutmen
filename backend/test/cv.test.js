import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseCv, parseCvRegex, ekstrakTeksPdf, skemaHasilParser } from '../src/cv/index.js';
import { cariRentangTanggal } from '../src/cv/tanggal.js';
import { hitungRiwayatKerja } from '../src/scoring/riwayatKerja.js';

const ACUAN = '2026-10-26';
const cv = (nama) => readFileSync(new URL(`./fixtures/cv/${nama}`, import.meta.url), 'utf8');
const pdf = (nama) => readFileSync(new URL(`./fixtures/pdf/${nama}`, import.meta.url));
const parse = (teks, opsi = {}) => parseCvRegex(teks, { tanggalAcuan: ACUAN, ...opsi });

describe('3.2 Rentang tanggal', () => {
  const rentang = (baris) =>
    cariRentangTanggal(baris, { tahunMaks: 2027 }).map(({ mulai, selesai, tahunSaja }) => ({ mulai, selesai, tahunSaja }));

  test('nama bulan Indonesia dan Inggris, lengkap dan singkat', () => {
    assert.deepEqual(rentang('Januari 2022 - Desember 2023'), [{ mulai: '2022-01', selesai: '2023-12', tahunSaja: false }]);
    assert.deepEqual(rentang('Agt 2019 – Mei 2020'), [{ mulai: '2019-08', selesai: '2020-05', tahunSaja: false }]);
    assert.deepEqual(rentang('Sept. 2018 to Oct 2019'), [{ mulai: '2018-09', selesai: '2019-10', tahunSaja: false }]);
    assert.deepEqual(rentang('1 Maret 2020 s/d 30 Juni 2021'), [{ mulai: '2020-03', selesai: '2021-06', tahunSaja: false }]);
  });

  test('format angka: MM/YYYY dan YYYY-MM', () => {
    assert.deepEqual(rentang('03/2019 - 12/2021'), [{ mulai: '2019-03', selesai: '2021-12', tahunSaja: false }]);
    assert.deepEqual(rentang('2020-01 sampai dengan 2021-06'), [{ mulai: '2020-01', selesai: '2021-06', tahunSaja: false }]);
  });

  test('"sekarang"/"present" → selesai null', () => {
    for (const b of ['Mar 2023 - Sekarang', 'Jan 2022 – Present', '05/2024 hingga kini', 'Juli 2025 - saat ini']) {
      assert.equal(rentang(b)[0]?.selesai, null, b);
    }
  });

  test('tahun saja → Jan–Des dan ditandai', () => {
    assert.deepEqual(rentang('2018 - 2020'), [{ mulai: '2018-01', selesai: '2020-12', tahunSaja: true }]);
  });

  test('bukan rentang: nomor HP, tanggal tunggal, tahun mustahil, bulan 13', () => {
    for (const b of ['0812-3456-7890', 'Lahir 12 Mei 1999', '1800 - 1850', '13/2020 - 14/2021', 'Mei 2030 - Juni 2031']) {
      assert.deepEqual(rentang(b), [], b);
    }
  });
});

describe('3.2 Parser regex: skill', () => {
  test('alias dan penulisan berbeda ("ReactJS", "Node.js")', () => {
    const { skills } = parse('Keahlian\nReactJS, node.js, MYSQL');
    assert.deepEqual(skills.sort(), ['MySQL', 'Node.js', 'React']);
  });

  test('longest match: "Tailwind CSS" tidak ikut menghasilkan "CSS"', () => {
    const { skills } = parse('Keahlian\nTailwind CSS, React Native');
    assert.deepEqual(skills.sort(), ['React Native', 'Tailwind CSS']);
  });

  test('skill dengan garis miring ditemukan utuh', () => {
    assert.ok(parse('Keahlian\nUI/UX dan CI/CD').skills.includes('UI/UX'));
  });

  test('skill lowongan yang tidak ada di kamus umum tetap dicari, dengan nama dari HR', () => {
    const { skills } = parse('Pernah memakai Odoo dan Zahir.', { skillLowongan: ['Odoo', 'Zahir Accounting'] });
    assert.deepEqual(skills, ['Odoo']);
  });

  test('skill pendek: harus persis sama dan diberi alasan tinjau', () => {
    const hasil = parse(cv('skill-pendek.txt'));
    assert.ok(hasil.skills.includes('Go'));
    assert.ok(hasil.skills.includes('C'));
    assert.ok(hasil.alasanTinjau.some((a) => a.includes('"Go"')));
    assert.equal(hasil.keyakinan, 'rendah');

    const kecil = parse('Pengalaman Kerja\nkami go live minggu depan');
    assert.ok(!kecil.skills.includes('Go'));
  });

  test('"Golang" → Go tanpa alasan tinjau (bentuk panjang tidak ambigu)', () => {
    const hasil = parse('Keahlian\nGolang');
    assert.deepEqual(hasil.skills, ['Go']);
    assert.ok(!hasil.alasanTinjau.some((a) => a.includes('Skill pendek')));
  });
});

describe('3.2 Parser regex: riwayat kerja', () => {
  test('CV Indonesia rapi → keyakinan tinggi, pendidikan tidak dihitung', () => {
    const hasil = parse(cv('id-rapi.txt'));
    assert.equal(hasil.keyakinan, 'tinggi', hasil.alasanTinjau.join(' | '));
    assert.deepEqual(hasil.riwayatKerja, [
      { perusahaan: 'PT Kreasi Teknologi Indonesia', mulai: '2023-08', selesai: null },
      { perusahaan: 'CV Sinar Abadi', mulai: '2021-02', selesai: '2023-07' },
    ]);
  });

  test('kata "di" di baris deskripsi (tanpa bullet) tidak dianggap nama perusahaan', () => {
    const teks = 'Pengalaman Kerja\nKasir | Jan 2020 - Des 2021\nBertugas di kasir utama\nPT Toko Serba Ada';
    assert.deepEqual(
      parse(teks).riwayatKerja.map((r) => r.perusahaan),
      ['PT Toko Serba Ada'],
    );
  });

  test('CV Inggris: "at Tokopedia" dan "Developer, PT ..."', () => {
    const hasil = parse(cv('en.txt'));
    assert.equal(hasil.keyakinan, 'tinggi', hasil.alasanTinjau.join(' | '));
    assert.deepEqual(hasil.riwayatKerja, [
      { perusahaan: 'Tokopedia', mulai: '2022-01', selesai: null },
      { perusahaan: 'PT Data Prima Solusi', mulai: '2019-03', selesai: '2021-12' },
    ]);
    assert.deepEqual(hasil.skills.sort(), ['AWS', 'CI/CD', 'PostgreSQL', 'Python', 'React', 'TypeScript']);
  });

  test('CV tanpa judul bagian: baris universitas dibuang, keyakinan rendah', () => {
    const hasil = parse(cv('tanpa-judul.txt'));
    assert.deepEqual(
      hasil.riwayatKerja.map((r) => r.perusahaan),
      ['Toko Bangunan Makmur', 'PT Logistik Cepat'],
    );
    assert.equal(hasil.keyakinan, 'rendah');
    assert.ok(hasil.alasanTinjau.some((a) => a.includes('tidak punya judul bagian')));
  });

  test('tahun saja dan nama perusahaan tanpa penanda → ditandai', () => {
    const hasil = parse(cv('tahun-saja.txt'));
    assert.deepEqual(hasil.riwayatKerja, [
      { perusahaan: 'PT Tambang Jaya', mulai: '2018-01', selesai: '2020-12' },
      { perusahaan: 'Bengkel Motor Pak Udin', mulai: '2020-01', selesai: '2022-12' },
    ]);
    assert.ok(hasil.alasanTinjau.some((a) => a.includes('hanya menyebut tahun')));
    assert.ok(hasil.alasanTinjau.some((a) => a.includes('hanya ditebak')));
  });

  test('fresh graduate: pengalaman organisasi dan pendidikan tidak dihitung sebagai kerja', () => {
    const hasil = parse(cv('fresh-graduate.txt'));
    assert.deepEqual(hasil.riwayatKerja, []);
    assert.equal(hasil.keyakinan, 'rendah');
    assert.ok(hasil.alasanTinjau.some((a) => a.includes('Tidak ada riwayat kerja')));
  });

  test('perusahaan di atas tanggal (tata letak lain) juga terbaca', () => {
    const teks = 'Pengalaman Kerja\nPT Alpha Beta\nKasir | 2021-01 - 2022-06\n- melayani pelanggan\nPT Gamma Delta\nAdmin | 2022-07 - 2024-01';
    assert.deepEqual(
      parse(teks).riwayatKerja.map((r) => r.perusahaan),
      ['PT Alpha Beta', 'PT Gamma Delta'],
    );
  });

  test('tahun di masa depan (lewat tahun acuan + 1) diabaikan', () => {
    const hasil = parse('Pengalaman Kerja\nPT X | Jan 2030 - Des 2031');
    assert.deepEqual(hasil.riwayatKerja, []);
  });

  test('guard input', () => {
    assert.throws(() => parseCvRegex(null, { tanggalAcuan: ACUAN }));
    assert.throws(() => parseCvRegex('teks', { tanggalAcuan: '26-10-2026' }));
    assert.throws(() => parseCvRegex('teks', { tanggalAcuan: ACUAN, skillLowongan: 'React' }));
  });
});

describe('3.2 Kompatibilitas dengan scoring engine', () => {
  test('output regex lolos skema yang sama dengan parser AI', () => {
    for (const f of ['id-rapi.txt', 'en.txt', 'tanpa-judul.txt', 'tahun-saja.txt', 'fresh-graduate.txt', 'skill-pendek.txt']) {
      const { skills, riwayatKerja } = parse(cv(f));
      assert.ok(skemaHasilParser.safeParse({ skills, riwayatKerja }).success, f);
    }
  });

  test('riwayat kerja hasil parser langsung bisa dihitung scoring engine', () => {
    const { riwayatKerja } = parse(cv('id-rapi.txt'));
    const hasil = hitungRiwayatKerja(riwayatKerja, ACUAN);
    // Agu 2023–Okt 2026 = 39 bulan, Feb 2021–Jul 2023 = 30 bulan
    assert.equal(hasil.totalBulan, 69);
    assert.equal(hasil.jumlahPerusahaan, 2);
    assert.deepEqual(hasil.entriDibuang, []);
  });
});

describe('3.1 Ekstraksi teks PDF', () => {
  test('PDF berteks → baris terjaga, lalu bisa di-parse ujung ke ujung', async () => {
    const hasil = await ekstrakTeksPdf(pdf('cv-dua-kolom.pdf'));
    assert.equal(hasil.ok, true);
    assert.equal(hasil.jumlahHalaman, 2);
    assert.ok(hasil.teks.includes('\nPT Solusi Digital Nusantara\n'));

    const cvHasil = parse(hasil.teks);
    assert.deepEqual(cvHasil.riwayatKerja, [
      { perusahaan: 'PT Solusi Digital Nusantara', mulai: '2022-01', selesai: null },
      { perusahaan: 'CV Maju Bersama', mulai: '2020-03', selesai: '2021-12' },
    ]);
    assert.equal(cvHasil.keyakinan, 'tinggi', cvHasil.alasanTinjau.join(' | '));
  });

  test('DoD 3.1: PDF hasil scan (tanpa teks) → gagal dengan alasan, tidak crash', async () => {
    const hasil = await ekstrakTeksPdf(pdf('cv-scan-tanpa-teks.pdf'));
    assert.equal(hasil.ok, false);
    assert.match(hasil.alasan, /hasil scan/);
  });

  test('bukan PDF, PDF rusak, buffer kosong → gagal dengan alasan', async () => {
    for (const buf of [Buffer.from('bukan pdf'), Buffer.from('%PDF-1.4 rusak total'), Buffer.alloc(0), 'string']) {
      const hasil = await ekstrakTeksPdf(buf);
      assert.equal(hasil.ok, false);
      assert.ok(hasil.alasan.length > 0);
    }
  });
});

describe('3.3 Orkestrator mode parser', () => {
  const dataAi = { skills: ['React'], riwayatKerja: [{ perusahaan: 'PT AI', mulai: '2020-01', selesai: null }] };
  const aiPalsu = (balasan) => {
    const f = async () => (typeof balasan === 'function' ? balasan() : balasan);
    f.dipanggil = 0;
    const dibungkus = async (...a) => {
      dibungkus.dipanggil++;
      return f(...a);
    };
    dibungkus.dipanggil = 0;
    return dibungkus;
  };

  test('mode regex tidak pernah memanggil AI', async () => {
    const ai = aiPalsu(dataAi);
    const hasil = await parseCv({ teks: cv('tahun-saja.txt'), mode: 'regex', parserAi: ai, tanggalAcuan: ACUAN });
    assert.equal(ai.dipanggil, 0);
    assert.equal(hasil.sumber, 'regex');
    assert.equal(hasil.status, 'perlu_tinjau');
  });

  test('DoD 3.3: gabungan + keyakinan tinggi → AI tidak dipanggil', async () => {
    const ai = aiPalsu(dataAi);
    const hasil = await parseCv({ teks: cv('id-rapi.txt'), mode: 'gabungan', parserAi: ai, tanggalAcuan: ACUAN });
    assert.equal(ai.dipanggil, 0);
    assert.equal(hasil.status, 'berhasil');
    assert.equal(hasil.sumber, 'regex');
  });

  test('DoD 3.3: gabungan + keyakinan rendah → AI dipanggil, hasil AI dipakai', async () => {
    const ai = aiPalsu(dataAi);
    const hasil = await parseCv({ teks: cv('tahun-saja.txt'), mode: 'gabungan', parserAi: ai, tanggalAcuan: ACUAN });
    assert.equal(ai.dipanggil, 1);
    assert.equal(hasil.sumber, 'ai');
    assert.deepEqual(hasil.riwayatKerja, dataAi.riwayatKerja);
  });

  test('gabungan + AI gagal dua kali → kembali ke hasil regex, alasan dicatat', async () => {
    const ai = aiPalsu({ skills: 'bukan array' });
    const hasil = await parseCv({ teks: cv('tahun-saja.txt'), mode: 'gabungan', parserAi: ai, tanggalAcuan: ACUAN });
    assert.equal(ai.dipanggil, 2);
    assert.equal(hasil.sumber, 'regex');
    assert.equal(hasil.status, 'perlu_tinjau');
    assert.ok(hasil.alasanTinjau.some((a) => a.includes('memakai hasil regex')));
  });

  test('mode ai: gagal sekali lalu berhasil → berhasil (dicoba ulang satu kali)', async () => {
    let ke = 0;
    const ai = aiPalsu(() => {
      ke++;
      if (ke === 1) throw new Error('timeout');
      return dataAi;
    });
    const hasil = await parseCv({ teks: 'teks cv', mode: 'ai', parserAi: ai, tanggalAcuan: ACUAN });
    assert.equal(ai.dipanggil, 2);
    assert.equal(hasil.status, 'berhasil');
  });

  test('mode ai: output tidak valid dua kali → gagal, bukan crash', async () => {
    const ai = aiPalsu({ skills: [], riwayatKerja: [{ perusahaan: 'X', mulai: 'Januari 2020', selesai: null }] });
    const hasil = await parseCv({ teks: 'teks cv', mode: 'ai', parserAi: ai, tanggalAcuan: ACUAN });
    assert.equal(ai.dipanggil, 2);
    assert.equal(hasil.status, 'gagal');
    assert.match(hasil.alasanTinjau[0], /YYYY-MM/);
  });

  test('konfigurasi salah ditolak di depan', async () => {
    await assert.rejects(parseCv({ teks: 'x', mode: 'llm', tanggalAcuan: ACUAN }), /tidak dikenal/);
    await assert.rejects(parseCv({ teks: 'x', mode: 'ai', tanggalAcuan: ACUAN }), /belum dikonfigurasi/);
    await assert.rejects(parseCv({ teks: 'x', mode: 'gabungan', tanggalAcuan: ACUAN }), /belum dikonfigurasi/);
  });

  test('teks kosong → gagal', async () => {
    const hasil = await parseCv({ teks: '   ', mode: 'regex', tanggalAcuan: ACUAN });
    assert.equal(hasil.status, 'gagal');
  });
});
