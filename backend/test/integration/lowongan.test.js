import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { siapkan, request, contohLowongan, ALASAN_LEWATI } from './helper.js';

describe('1.5 CRUD lowongan & konfigurasi tes', { skip: ALASAN_LEWATI }, () => {
  let api;
  let rekruter;
  let rekruterLain;
  before(async () => {
    api = await siapkan();
    rekruter = await api.daftar('rekruter');
    rekruterLain = await api.daftar('rekruter');
  });
  after(() => api?.tutup());

  const kirim = (metode, url, akun, body) => request(api.app)[metode](url).set(akun.auth).send(body);

  test('buat lowongan → 201, status draf, tes tersimpan berurutan', async () => {
    const res = await kirim('post', '/lowongan', rekruter, contohLowongan());
    assert.equal(res.status, 201);
    assert.equal(res.body.data.status, 'draf');
    assert.deepEqual(
      res.body.data.tes.map((t) => [t.jenisTes, t.bobot, t.jumlahSoalAktif]),
      [
        ['logika', 0.4, 0],
        ['coding', 0.6, 0],
      ],
    );
  });

  test('DoD 1.5: tanpa skill wajib → 400 dengan pesan jelas', async () => {
    for (const skillWajib of [[], ['  ']]) {
      const res = await kirim('post', '/lowongan', rekruter, { ...contohLowongan(), skillWajib });
      assert.equal(res.status, 400, JSON.stringify(skillWajib));
      assert.equal(res.body.error.kode, 'VALIDASI');
    }
  });

  test('DoD 1.5: jumlah bobot tes bukan 1 → 400 dengan pesan jelas', async () => {
    const data = contohLowongan();
    data.tes[1].bobot = 0.5;
    const res = await kirim('post', '/lowongan', rekruter, data);
    assert.equal(res.status, 400);
    assert.match(res.body.error.pesan, /Jumlah bobot tes harus 1/);
  });

  test('target ≤ batas bawah, nama tes ganda, budget 0 → 400', async () => {
    const targetSalah = contohLowongan();
    targetSalah.tes[0].targetSkor = 40;
    const ganda = contohLowongan();
    ganda.tes[1].jenisTes = 'LOGIKA';
    for (const data of [targetSalah, ganda, { ...contohLowongan(), budgetMaksimal: 0 }]) {
      const res = await kirim('post', '/lowongan', rekruter, data);
      assert.equal(res.status, 400, JSON.stringify(res.body));
    }
  });

  test('lowongan rekruter lain → 404 (tidak bocor), id rusak → 404', async () => {
    const milikSaya = await api.buatLowongan(rekruter);
    assert.equal((await kirim('get', `/lowongan/${milikSaya.id}`, rekruterLain)).status, 404);
    assert.equal((await kirim('put', `/lowongan/${milikSaya.id}`, rekruterLain, contohLowongan())).status, 404);
    assert.equal((await kirim('delete', `/lowongan/${milikSaya.id}`, rekruterLain)).status, 404);
    assert.equal((await kirim('get', '/lowongan/bukan-uuid', rekruter)).status, 404);

    const daftarLain = await kirim('get', '/lowongan', rekruterLain);
    assert.ok(!daftarLain.body.data.some((l) => l.id === milikSaya.id));
  });

  test('ubah tes saat draf: ganti nama bertukar, tambah, hapus', async () => {
    const lowongan = await api.buatLowongan(rekruter);
    const [logika, coding] = lowongan.tes;
    const res = await kirim('put', `/lowongan/${lowongan.id}`, rekruter, {
      ...contohLowongan(),
      tes: [
        { ...logika, id: logika.id, jenisTes: 'coding', bobot: 0.5, jumlahSoal: undefined },
        { id: coding.id, jenisTes: 'logika', targetSkor: 90, batasBawah: 50, bobot: 0.3 },
        { jenisTes: 'bahasa inggris', targetSkor: 70, batasBawah: 30, bobot: 0.2 },
      ].map(({ id, jenisTes, targetSkor, batasBawah, bobot }) => ({ id, jenisTes, targetSkor, batasBawah, bobot })),
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(
      res.body.data.tes.map((t) => [t.id === logika.id, t.jenisTes]),
      [
        [true, 'coding'],
        [false, 'logika'],
        [false, 'bahasa inggris'],
      ],
    );
  });

  test('id tes milik lowongan lain → 400', async () => {
    const a = await api.buatLowongan(rekruter);
    const b = await api.buatLowongan(rekruter);
    const data = contohLowongan();
    data.tes[0].id = b.tes[0].id;
    const res = await kirim('put', `/lowongan/${a.id}`, rekruter, data);
    assert.equal(res.status, 400);
  });

  test('menghapus tes yang masih punya soal → 409', async () => {
    const lowongan = await api.buatLowongan(rekruter);
    await api.buatSoal(rekruter, lowongan.tes[0].id);
    const res = await kirim('put', `/lowongan/${lowongan.id}`, rekruter, {
      ...contohLowongan(),
      tes: [{ id: lowongan.tes[1].id, jenisTes: 'coding', targetSkor: 90, batasBawah: 50, bobot: 1 }],
    });
    assert.equal(res.status, 409);
    assert.match(res.body.error.pesan, /masih punya soal/);
  });

  test('membuka lowongan yang tesnya belum punya soal → 409', async () => {
    const lowongan = await api.buatLowongan(rekruter);
    await api.buatSoal(rekruter, lowongan.tes[0].id);
    const res = await kirim('patch', `/lowongan/${lowongan.id}/status`, rekruter, { status: 'buka' });
    assert.equal(res.status, 409);
    assert.match(res.body.error.pesan, /"coding"/);
  });

  test('alur status: draf → buka → tutup → buka', async () => {
    const lowongan = await api.lowonganTerbuka(rekruter);
    assert.equal(lowongan.status, 'buka');
    const tutup = await kirim('patch', `/lowongan/${lowongan.id}/status`, rekruter, { status: 'tutup' });
    assert.equal(tutup.body.data.status, 'tutup');
    const buka = await kirim('patch', `/lowongan/${lowongan.id}/status`, rekruter, { status: 'buka' });
    assert.equal(buka.body.data.status, 'buka');
  });

  test('menutup lowongan draf → 409', async () => {
    const lowongan = await api.buatLowongan(rekruter);
    const res = await kirim('patch', `/lowongan/${lowongan.id}/status`, rekruter, { status: 'tutup' });
    assert.equal(res.status, 409);
  });

  test('saat dibuka: data umum boleh diubah, konfigurasi tes tidak', async () => {
    const lowongan = await api.lowonganTerbuka(rekruter);
    const { tes, ...umum } = contohLowongan();

    const ubahUmum = await kirim('put', `/lowongan/${lowongan.id}`, rekruter, { ...umum, posisi: 'Senior FE' });
    assert.equal(ubahUmum.status, 200);
    assert.equal(ubahUmum.body.data.posisi, 'Senior FE');
    assert.equal(ubahUmum.body.data.tes.length, 2);

    const ubahTes = await kirim('put', `/lowongan/${lowongan.id}`, rekruter, { ...umum, tes });
    assert.equal(ubahTes.status, 409);
  });

  test('lowongan dengan pelamar: tidak bisa ke draf, tidak bisa dihapus', async () => {
    const lowongan = await api.lowonganTerbuka(rekruter);
    await api.lamarLangsung(lowongan.id);

    const detail = await kirim('get', `/lowongan/${lowongan.id}`, rekruter);
    assert.equal(detail.body.data.jumlahPelamar, 1);
    assert.equal((await kirim('patch', `/lowongan/${lowongan.id}/status`, rekruter, { status: 'draf' })).status, 409);
    assert.equal((await kirim('delete', `/lowongan/${lowongan.id}`, rekruter)).status, 409);
  });

  test('hapus lowongan tanpa pelamar → 204, soal ikut terhapus', async () => {
    const lowongan = await api.lowonganTerbuka(rekruter);
    assert.equal((await kirim('delete', `/lowongan/${lowongan.id}`, rekruter)).status, 204);
    assert.equal((await kirim('get', `/lowongan/${lowongan.id}`, rekruter)).status, 404);
    const { rows } = await api.pool.query(
      'SELECT count(*)::int AS n FROM soal WHERE lowongan_tes_id = ANY($1)',
      [lowongan.tes.map((t) => t.id)],
    );
    assert.equal(rows[0].n, 0);
  });

  test('constraint database aktif walau aplikasi dilewati (DoD 1.2)', async () => {
    const lowongan = await api.buatLowongan(rekruter);
    await assert.rejects(
      api.pool.query('UPDATE lowongan SET budget_maksimal = 0 WHERE id = $1', [lowongan.id]),
      { code: '23514' },
    );
    await assert.rejects(
      api.pool.query('UPDATE lowongan_tes SET target_skor = 10, batas_bawah = 20 WHERE id = $1', [lowongan.tes[0].id]),
      { code: '23514' },
    );
    const terbuka = await api.lowonganTerbuka(rekruter);
    const kandidatId = await api.lamarLangsung(terbuka.id);
    const { rows } = await api.pool.query('SELECT user_id FROM kandidat WHERE id = $1', [kandidatId]);
    await assert.rejects(
      api.pool.query(
        `INSERT INTO kandidat (user_id, lowongan_id, nama, email, nomor_kontak, ekspektasi_gaji,
           ketersediaan_waktu, persetujuan_data, persetujuan_pada)
         VALUES ($1, $2, 'X', 'x@x.id', '0', 1, 'penuh', true, now())`,
        [rows[0].user_id, terbuka.id],
      ),
      { code: '23505' },
    );
  });
});
