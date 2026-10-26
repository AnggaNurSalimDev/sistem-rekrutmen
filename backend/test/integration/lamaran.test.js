import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { siapkan, request, PDF_SCAN, ALASAN_LEWATI } from './helper.js';

/** Jawaban AI palsu yang jujur untuk test/fixtures/pdf/cv-dua-kolom.pdf. */
const aiJujur = async () => ({
  skills: [
    { nama: 'React', kutipan: 'React.js' },
    { nama: 'JavaScript', kutipan: 'JavaScript' },
  ],
  riwayatKerja: [
    { perusahaan: 'PT Solusi Digital Nusantara', jabatan: 'Frontend Developer', mulai: '2022-01', selesai: null, masihBekerja: true, hanyaTahun: false, kutipan: 'Frontend Developer Januari 2022 - Sekarang PT Solusi Digital Nusantara' },
    { perusahaan: 'CV Maju Bersama', jabatan: 'Staf IT', mulai: '2020-03', selesai: '2021-12', masihBekerja: false, hanyaTahun: false, kutipan: 'Staf IT Mar 2020 – Des 2021 CV Maju Bersama' },
  ],
  temuanLain: [],
});

const hitungBerkas = async (dir) => {
  try {
    return (await readdir(path.join(dir, 'cv'))).length;
  } catch {
    return 0;
  }
};

describe('4.1 Lowongan terbuka & kirim lamaran', { skip: ALASAN_LEWATI }, () => {
  let api;
  let rekruter;
  let lowongan;
  let panggilanAi = 0;

  before(async () => {
    api = await siapkan({}, {
      parserAi: async (...a) => {
        panggilanAi++;
        return aiJujur(...a);
      },
    });
    rekruter = await api.daftar('rekruter');
    lowongan = await api.lowonganTerbuka(rekruter);
  });
  after(() => api?.tutup());

  test('GET /lowongan-terbuka publik, hanya status buka, tanpa data internal', async () => {
    await api.buatLowongan(rekruter, { posisi: 'Masih Draf' });
    const res = await request(api.app).get('/lowongan-terbuka');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.map((l) => l.id), [lowongan.id]);
    const json = JSON.stringify(res.body);
    for (const rahasia of ['budget', 'kataKunciSorot', 'targetSkor', 'batasBawah', 'bobot']) {
      assert.ok(!json.includes(rahasia), rahasia);
    }
    assert.deepEqual(res.body.data[0].tes.map((t) => [t.jenisTes, t.jumlahSoal]), [['logika', 1], ['coding', 1]]);
  });

  test('detail lowongan draf / tidak ada → 404', async () => {
    const draf = await api.buatLowongan(rekruter);
    assert.equal((await request(api.app).get(`/lowongan-terbuka/${draf.id}`)).status, 404);
    assert.equal((await request(api.app).get('/lowongan-terbuka/bukan-uuid')).status, 404);
  });

  test('lamaran berhasil: CV disimpan, AI dipanggil, data CV & skor tersimpan, skor tidak dikirim ke kandidat', async () => {
    const kandidat = await api.daftar('kandidat');
    const sebelum = await hitungBerkas(api.dirStorage);
    const res = await api.lamar(kandidat, lowongan.id);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.statusAplikasi, 'dilamar');
    assert.deepEqual(res.body.data.tes.map((t) => t.status), ['belum', 'belum']);
    assert.ok(!/skor|rincian|cv_data|sorotan/i.test(JSON.stringify(res.body)));
    assert.equal(await hitungBerkas(api.dirStorage), sebelum + 1);

    const { rows } = await api.pool.query(
      `SELECT c.status_ekstraksi, c.sumber_ekstraksi, c.skills_mentah, c.jumlah_perusahaan, c.teks_cv IS NOT NULL AS ada_teks,
              k.skor_akhir, k.rincian_skor, k.email
       FROM kandidat k JOIN cv_data c ON c.kandidat_id = k.id WHERE k.id = $1`,
      [res.body.data.id],
    );
    const r = rows[0];
    assert.equal(r.status_ekstraksi, 'berhasil');
    assert.equal(r.sumber_ekstraksi, 'ai');
    assert.deepEqual(r.skills_mentah, ['React', 'JavaScript']);
    assert.equal(r.jumlah_perusahaan, 2);
    assert.equal(r.ada_teks, true);
    assert.equal(r.email, kandidat.user.email);
    // Belum ujian → skor akhir null, tetapi komponen CV sudah terlihat.
    assert.equal(r.skor_akhir, null);
    assert.equal(r.rincian_skor.status, 'belum_lengkap');
    assert.equal(r.rincian_skor.komponen.cv, 100);
  });

  test('melamar dua kali → 409, tanpa menyimpan berkas baru dan tanpa memanggil AI', async () => {
    const kandidat = await api.daftar('kandidat');
    assert.equal((await api.lamar(kandidat, lowongan.id)).status, 201);
    const berkas = await hitungBerkas(api.dirStorage);
    const ai = panggilanAi;
    const res = await api.lamar(kandidat, lowongan.id);
    assert.equal(res.status, 409);
    assert.equal(await hitungBerkas(api.dirStorage), berkas);
    assert.equal(panggilanAi, ai);
  });

  test('PDF hasil scan tetap diterima; CV berstatus gagal dengan alasan', async () => {
    const kandidat = await api.daftar('kandidat');
    const res = await api.lamar(kandidat, lowongan.id, { pdf: PDF_SCAN });
    assert.equal(res.status, 201);
    const { rows } = await api.pool.query('SELECT status_ekstraksi, alasan_tinjau FROM cv_data WHERE kandidat_id = $1', [res.body.data.id]);
    assert.equal(rows[0].status_ekstraksi, 'gagal');
    assert.match(rows[0].alasan_tinjau[0], /hasil scan/);
  });

  test('bukan PDF, tanpa CV, tanpa persetujuan, nomor tidak valid → 400', async () => {
    const kandidat = await api.daftar('kandidat');
    const kasus = [
      { pdf: Buffer.from('ini bukan pdf') },
      { pdf: null },
      { ubah: { persetujuanData: 'false' } },
      { ubah: { persetujuanData: undefined } },
      { ubah: { nomorKontak: 'telepon saya' } },
      { ubah: { ekspektasiGaji: '-5' } },
      { ubah: { isAdmin: 'true' } },
    ];
    for (const k of kasus) {
      const res = await api.lamar(kandidat, lowongan.id, k);
      assert.equal(res.status, 400, JSON.stringify(k).slice(0, 80));
    }
  });

  test('CV lebih dari 10 MB → 413', async () => {
    const kandidat = await api.daftar('kandidat');
    const besar = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(10 * 1024 * 1024 + 10, 32)]);
    const res = await api.lamar(kandidat, lowongan.id, { pdf: besar });
    assert.equal(res.status, 413);
  });

  test('lowongan draf → 404, lowongan ditutup → 409', async () => {
    const kandidat = await api.daftar('kandidat');
    const draf = await api.buatLowongan(rekruter);
    assert.equal((await api.lamar(kandidat, draf.id)).status, 404);

    const ditutup = await api.lowonganTerbuka(rekruter);
    await request(api.app).patch(`/lowongan/${ditutup.id}/status`).set(rekruter.auth).send({ status: 'tutup' });
    assert.equal((await api.lamar(kandidat, ditutup.id)).status, 409);
  });

  test('rekruter tidak bisa melamar → 403', async () => {
    assert.equal((await api.lamar(rekruter, lowongan.id)).status, 403);
  });

  test('lamaran-saya hanya milik sendiri; lamaran orang lain → 404', async () => {
    const a = await api.daftar('kandidat');
    const b = await api.daftar('kandidat');
    const lamaranA = (await api.lamar(a, lowongan.id)).body.data;

    const daftarB = await request(api.app).get('/lamaran').set(b.auth);
    assert.deepEqual(daftarB.body.data, []);
    assert.equal((await request(api.app).get(`/lamaran/${lamaranA.id}`).set(b.auth)).status, 404);
    assert.equal((await request(api.app).get(`/lamaran/${lamaranA.id}`).set(a.auth)).status, 200);
  });
});

describe('4.1 Lamaran tanpa parser AI (mode demo)', { skip: ALASAN_LEWATI }, () => {
  let api;
  before(async () => {
    api = await siapkan();
  });
  after(() => api?.tutup());

  test('CV diterima dengan status menunggu (isi manual), skor CV null', async () => {
    const rekruter = await api.daftar('rekruter');
    const lowongan = await api.lowonganTerbuka(rekruter);
    const kandidat = await api.daftar('kandidat');
    const res = await api.lamar(kandidat, lowongan.id);
    assert.equal(res.status, 201);
    const { rows } = await api.pool.query(
      'SELECT c.status_ekstraksi, c.alasan_tinjau, k.rincian_skor FROM cv_data c JOIN kandidat k ON k.id = c.kandidat_id WHERE k.id = $1',
      [res.body.data.id],
    );
    assert.equal(rows[0].status_ekstraksi, 'menunggu');
    assert.match(rows[0].alasan_tinjau[0], /tidak aktif/);
    assert.equal(rows[0].rincian_skor.komponen.cv, null);
  });
});
