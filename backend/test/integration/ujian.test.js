import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { siapkan, request, contohSoal, ALASAN_LEWATI } from './helper.js';

const aiJujur = async () => ({
  skills: [
    { nama: 'React', kutipan: 'React.js' },
    { nama: 'JavaScript', kutipan: 'JavaScript' },
  ],
  riwayatKerja: [
    { perusahaan: 'PT Solusi Digital Nusantara', jabatan: null, mulai: '2022-01', selesai: null, masihBekerja: true, hanyaTahun: false, kutipan: 'Januari 2022 - Sekarang PT Solusi Digital Nusantara' },
  ],
  temuanLain: [],
});

const integritasBersih = { statusKamera: 'granted', episodeKeluarFokus: [] };

describe('4.2–4.4 Ujian & integrity signals', { skip: ALASAN_LEWATI }, () => {
  let api;
  let rekruter;
  let lowongan;

  before(async () => {
    api = await siapkan({}, { parserAi: aiJujur });
    rekruter = await api.daftar('rekruter');
    lowongan = await api.buatLowongan(rekruter);
    // Tes logika: 2 soal (kunci "a" dan "b"); tes coding: 1 soal.
    await api.buatSoal(rekruter, lowongan.tes[0].id, { pertanyaan: 'L1' });
    await api.buatSoal(rekruter, lowongan.tes[0].id, { ...contohSoal(), pertanyaan: 'L2', kunciOpsiId: 'b' });
    await api.buatSoal(rekruter, lowongan.tes[1].id, { pertanyaan: 'C1' });
    await request(api.app).patch(`/lowongan/${lowongan.id}/status`).set(rekruter.auth).send({ status: 'buka' });
  });
  after(() => api?.tutup());

  async function lamaranBaru() {
    const kandidat = await api.daftar('kandidat');
    const res = await api.lamar(kandidat, lowongan.id);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return { kandidat, lamaran: res.body.data };
  }
  const url = (lamaran, tesId, aksi) => `/lamaran/${lamaran.id}/ujian/${tesId}/${aksi}`;
  const mulai = (k, l, tesId) => request(api.app).post(url(l, tesId, 'mulai')).set(k.auth).send({});
  const kirim = (k, l, tesId, body) => request(api.app).post(url(l, tesId, 'kirim')).set(k.auth).send(body);

  test('DoD 4.2: mulai → soal tanpa kunci jawaban, poin, atau status aktif', async () => {
    const { kandidat, lamaran } = await lamaranBaru();
    const res = await mulai(kandidat, lamaran, lowongan.tes[0].id);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.soal.map((s) => s.pertanyaan), ['L1', 'L2']);
    assert.ok(!/kunciOpsiId|poin|aktif/.test(JSON.stringify(res.body)));
  });

  test('mulai dua kali (halaman dimuat ulang) → sesi sama, waktu mulai tidak diulang', async () => {
    const { kandidat, lamaran } = await lamaranBaru();
    const a = await mulai(kandidat, lamaran, lowongan.tes[0].id);
    const b = await mulai(kandidat, lamaran, lowongan.tes[0].id);
    assert.equal(a.body.data.dimulaiPada, b.body.data.dimulaiPada);
    const detail = await request(api.app).get(`/lamaran/${lamaran.id}`).set(kandidat.auth);
    assert.equal(detail.body.data.statusAplikasi, 'ujian');
    assert.equal(detail.body.data.tes[0].status, 'berlangsung');
  });

  test('server menghitung berapa kali halaman tes dibuka ulang (tidak bisa dihapus dari browser)', async () => {
    const { kandidat, lamaran } = await lamaranBaru();
    const tesId = lowongan.tes[1].id;
    await mulai(kandidat, lamaran, tesId);
    await mulai(kandidat, lamaran, tesId);
    await mulai(kandidat, lamaran, tesId);
    await kirim(kandidat, lamaran, tesId, { jawaban: [], integritas: integritasBersih });
    const { rows } = await api.pool.query('SELECT log_pelanggaran FROM integritas WHERE kandidat_id = $1', [lamaran.id]);
    assert.deepEqual(
      rows[0].log_pelanggaran.filter((l) => l.jenis === 'dibuka_ulang').map((l) => l.jumlah),
      [2],
    );
  });

  test('alur lengkap: dua tes dikirim → skor akhir terhitung (sementara), soal terkunci, status selesai', async () => {
    const { kandidat, lamaran } = await lamaranBaru();
    const [logika, coding] = lowongan.tes;

    const soalLogika = (await mulai(kandidat, lamaran, logika.id)).body.data.soal;
    // L1 benar (a), L2 salah (a, kuncinya b) → 1 dari 2 poin = 50
    const r1 = await kirim(kandidat, lamaran, logika.id, {
      jawaban: soalLogika.map((s) => ({ soalId: s.id, opsiDipilih: 'a' })),
      integritas: { statusKamera: 'granted', episodeKeluarFokus: [] },
    });
    assert.equal(r1.status, 200, JSON.stringify(r1.body));
    assert.deepEqual(Object.keys(r1.body.data).sort(), ['dikirimPada', 'terkirim']);

    const soalCoding = (await mulai(kandidat, lamaran, coding.id)).body.data.soal;
    await kirim(kandidat, lamaran, coding.id, {
      jawaban: [{ soalId: soalCoding[0].id, opsiDipilih: 'a' }],
      integritas: integritasBersih,
    });

    const { rows } = await api.pool.query(
      `SELECT k.status_aplikasi, k.skor_akhir, k.rincian_skor,
         (SELECT array_agg(skor_pencapaian ORDER BY skor_pencapaian) FROM ujian_teknis WHERE kandidat_id = k.id) AS skor_tes
       FROM kandidat k WHERE k.id = $1`,
      [lamaran.id],
    );
    const k = rows[0];
    assert.equal(k.status_aplikasi, 'selesai');
    assert.deepEqual(k.skor_tes, [50, 100]);
    assert.equal(k.rincian_skor.status, 'lengkap');
    assert.equal(k.rincian_skor.sementara, true);
    assert.ok(k.skor_akhir > 0);

    const soalRekruter = await request(api.app).get(`/tes/${logika.id}/soal`).set(rekruter.auth);
    assert.ok(soalRekruter.body.data.every((s) => s.terkunci));
  });

  test('kirim dua kali → 409; kirim tanpa mulai → 409', async () => {
    const { kandidat, lamaran } = await lamaranBaru();
    const tesId = lowongan.tes[1].id;
    assert.equal((await kirim(kandidat, lamaran, tesId, { jawaban: [], integritas: integritasBersih })).status, 409);

    const soal = (await mulai(kandidat, lamaran, tesId)).body.data.soal;
    const body = { jawaban: [{ soalId: soal[0].id, opsiDipilih: 'a' }], integritas: integritasBersih };
    assert.equal((await kirim(kandidat, lamaran, tesId, body)).status, 200);
    assert.equal((await kirim(kandidat, lamaran, tesId, body)).status, 409);
    assert.equal((await mulai(kandidat, lamaran, tesId)).status, 409);
  });

  test('jawaban untuk soal di luar sesi, opsi asing, atau dobel → 400 dan tidak ada yang tersimpan', async () => {
    const { kandidat, lamaran } = await lamaranBaru();
    const [logika, coding] = lowongan.tes;
    const soalLogika = (await mulai(kandidat, lamaran, logika.id)).body.data.soal;
    const soalCoding = (await mulai(kandidat, lamaran, coding.id)).body.data.soal;

    const kasus = [
      [{ soalId: soalCoding[0].id, opsiDipilih: 'a' }],
      [{ soalId: soalLogika[0].id, opsiDipilih: 'z' }],
      [{ soalId: soalLogika[0].id, opsiDipilih: 'a' }, { soalId: soalLogika[0].id, opsiDipilih: 'b' }],
    ];
    for (const jawaban of kasus) {
      const res = await kirim(kandidat, lamaran, logika.id, { jawaban, integritas: integritasBersih });
      assert.equal(res.status, 400, JSON.stringify(res.body));
    }
    const { rows } = await api.pool.query('SELECT count(*)::int AS n FROM jawaban_kandidat WHERE kandidat_id = $1', [lamaran.id]);
    assert.equal(rows[0].n, 0);
  });

  test('soal yang tidak dijawab dihitung salah', async () => {
    const { kandidat, lamaran } = await lamaranBaru();
    const tesId = lowongan.tes[0].id;
    await mulai(kandidat, lamaran, tesId);
    await kirim(kandidat, lamaran, tesId, { jawaban: [], integritas: integritasBersih });
    const { rows } = await api.pool.query('SELECT skor_pencapaian FROM ujian_teknis WHERE kandidat_id = $1', [lamaran.id]);
    assert.equal(rows[0].skor_pencapaian, 0);
  });

  test('DoD 4.3/4.4: episode keluar fokus dan status kamera tersimpan; kamera tidak ada tidak memblokir', async () => {
    const { kandidat, lamaran } = await lamaranBaru();
    const [logika, coding] = lowongan.tes;
    await mulai(kandidat, lamaran, logika.id);
    await mulai(kandidat, lamaran, coding.id);
    await new Promise((r) => setTimeout(r, 1100));

    const r1 = await kirim(kandidat, lamaran, logika.id, {
      jawaban: [],
      integritas: { statusKamera: 'hardware_not_found', episodeKeluarFokus: [{ detik: 0.4 }, { detik: 0.3 }] },
    });
    assert.equal(r1.status, 200);
    await kirim(kandidat, lamaran, coding.id, {
      jawaban: [],
      integritas: { statusKamera: 'denied', episodeKeluarFokus: [{ detik: 0.2 }] },
    });

    const { rows } = await api.pool.query('SELECT * FROM integritas WHERE kandidat_id = $1', [lamaran.id]);
    const i = rows[0];
    assert.equal(i.jumlah_keluar_fokus, 3);
    assert.equal(i.status_kamera, 'denied');
    assert.deepEqual(
      i.log_pelanggaran.filter((l) => l.jenis === 'kamera').map((l) => l.statusKamera),
      ['hardware_not_found', 'denied'],
    );
  });

  test('total detik keluar fokus tidak bisa melebihi lama ujian (dipotong dan dicatat)', async () => {
    const { kandidat, lamaran } = await lamaranBaru();
    const tesId = lowongan.tes[0].id;
    await mulai(kandidat, lamaran, tesId);
    await kirim(kandidat, lamaran, tesId, {
      jawaban: [],
      integritas: { statusKamera: 'granted', episodeKeluarFokus: [{ detik: 5000 }] },
    });
    const { rows } = await api.pool.query(
      `SELECT i.total_detik_keluar_fokus, i.log_pelanggaran, u.durasi_pengerjaan_detik
       FROM integritas i JOIN ujian_teknis u ON u.kandidat_id = i.kandidat_id WHERE i.kandidat_id = $1`,
      [lamaran.id],
    );
    assert.ok(rows[0].total_detik_keluar_fokus <= rows[0].durasi_pengerjaan_detik);
    assert.ok(rows[0].log_pelanggaran.some((l) => l.jenis === 'dipotong' && l.dilaporkan === 5000));
  });

  test('integritas wajib dikirim dan divalidasi', async () => {
    const { kandidat, lamaran } = await lamaranBaru();
    const tesId = lowongan.tes[0].id;
    await mulai(kandidat, lamaran, tesId);
    for (const body of [
      { jawaban: [] },
      { jawaban: [], integritas: { statusKamera: 'mungkin', episodeKeluarFokus: [] } },
      { jawaban: [], integritas: { statusKamera: 'granted', episodeKeluarFokus: [{ detik: -1 }] } },
    ]) {
      assert.equal((await kirim(kandidat, lamaran, tesId, body)).status, 400, JSON.stringify(body));
    }
  });

  test('soal dinonaktifkan rekruter di tengah ujian tetap dinilai sesuai yang dilihat kandidat', async () => {
    const { kandidat, lamaran } = await lamaranBaru();
    const tesId = lowongan.tes[0].id;
    const soal = (await mulai(kandidat, lamaran, tesId)).body.data.soal;
    const l2 = soal.find((s) => s.pertanyaan === 'L2');
    const nonaktif = await request(api.app).patch(`/soal/${l2.id}/aktif`).set(rekruter.auth).send({ aktif: false });
    assert.equal(nonaktif.status, 200);

    const res = await kirim(kandidat, lamaran, tesId, {
      jawaban: soal.map((s) => ({ soalId: s.id, opsiDipilih: s.pertanyaan === 'L2' ? 'b' : 'a' })),
      integritas: integritasBersih,
    });
    assert.equal(res.status, 200);
    const { rows } = await api.pool.query('SELECT skor_pencapaian FROM ujian_teknis WHERE kandidat_id = $1', [lamaran.id]);
    assert.equal(rows[0].skor_pencapaian, 100);
    await request(api.app).patch(`/soal/${l2.id}/aktif`).set(rekruter.auth).send({ aktif: true });
  });

  test('lamaran orang lain / tes dari lowongan lain → 404', async () => {
    const a = await lamaranBaru();
    const b = await lamaranBaru();
    assert.equal((await mulai(b.kandidat, a.lamaran, lowongan.tes[0].id)).status, 404);
    const lain = await api.lowonganTerbuka(rekruter);
    assert.equal((await mulai(a.kandidat, a.lamaran, lain.tes[0].id)).status, 404);
  });

  test('lowongan ditutup: ujian baru tidak bisa dimulai, ujian yang sudah berjalan tetap bisa dikirim', async () => {
    const l = await api.lowonganTerbuka(rekruter);
    const k1 = await api.daftar('kandidat');
    const k2 = await api.daftar('kandidat');
    const lam1 = (await api.lamar(k1, l.id)).body.data;
    const lam2 = (await api.lamar(k2, l.id)).body.data;
    const soal = (await mulai(k1, lam1, l.tes[0].id)).body.data.soal;

    await request(api.app).patch(`/lowongan/${l.id}/status`).set(rekruter.auth).send({ status: 'tutup' });
    assert.equal((await mulai(k2, lam2, l.tes[0].id)).status, 409);
    const res = await kirim(k1, lam1, l.tes[0].id, {
      jawaban: [{ soalId: soal[0].id, opsiDipilih: 'a' }],
      integritas: integritasBersih,
    });
    assert.equal(res.status, 200);
  });
});
