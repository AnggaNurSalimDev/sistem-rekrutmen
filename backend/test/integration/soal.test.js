import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { siapkan, request, contohSoal, ALASAN_LEWATI } from './helper.js';

describe('1.6 CRUD bank soal', { skip: ALASAN_LEWATI }, () => {
  let api;
  let rekruter;
  before(async () => {
    api = await siapkan();
    rekruter = await api.daftar('rekruter');
  });
  after(() => api?.tutup());

  const kirim = (metode, url, akun, body) => request(api.app)[metode](url).set(akun.auth).send(body);

  test('buat soal → 201, urutan otomatis bertambah', async () => {
    const lowongan = await api.buatLowongan(rekruter);
    const tesId = lowongan.tes[0].id;
    const s1 = await api.buatSoal(rekruter, tesId);
    const s2 = await api.buatSoal(rekruter, tesId, { poin: 2 });
    assert.equal(s1.urutan, 0);
    assert.equal(s2.urutan, 1);
    assert.equal(s2.poin, 2);
    assert.equal(s1.terkunci, false);
  });

  test('DoD 1.6: kunci bukan salah satu opsi → 400', async () => {
    const lowongan = await api.buatLowongan(rekruter);
    const res = await kirim('post', `/tes/${lowongan.tes[0].id}/soal`, rekruter, { ...contohSoal(), kunciOpsiId: 'z' });
    assert.equal(res.status, 400);
    assert.match(res.body.error.pesan, /kunci jawaban/);
  });

  test('opsi kurang dari 2, id opsi ganda, pertanyaan kosong → 400', async () => {
    const lowongan = await api.buatLowongan(rekruter);
    const url = `/tes/${lowongan.tes[0].id}/soal`;
    const salah = [
      { opsi: [{ id: 'a', teks: '4' }] },
      { opsi: [{ id: 'a', teks: '4' }, { id: 'a', teks: '5' }] },
      { pertanyaan: '   ' },
    ];
    for (const ubah of salah) {
      const res = await kirim('post', url, rekruter, { ...contohSoal(), ...ubah });
      assert.equal(res.status, 400, JSON.stringify(ubah));
    }
  });

  test('soal belum dijawab: boleh diubah dan dihapus', async () => {
    const lowongan = await api.buatLowongan(rekruter);
    const soal = await api.buatSoal(rekruter, lowongan.tes[0].id);
    const ubah = await kirim('put', `/soal/${soal.id}`, rekruter, { ...contohSoal(), pertanyaan: 'Diubah?' });
    assert.equal(ubah.status, 200);
    assert.equal(ubah.body.data.pertanyaan, 'Diubah?');
    assert.equal((await kirim('delete', `/soal/${soal.id}`, rekruter)).status, 204);
  });

  test('DoD 1.6: soal yang sudah dijawab terkunci (ubah/hapus 409, nonaktifkan boleh)', async () => {
    const lowongan = await api.lowonganTerbuka(rekruter);
    const tesId = lowongan.tes[0].id;
    const cadangan = await api.buatSoal(rekruter, tesId, { pertanyaan: 'Cadangan' });
    const daftar = await kirim('get', `/tes/${tesId}/soal`, rekruter);
    const soal = daftar.body.data.find((s) => s.id !== cadangan.id);

    const kandidatId = await api.lamarLangsung(lowongan.id);
    await api.jawabLangsung(kandidatId, soal.id);

    const terbaru = await kirim('get', `/soal/${soal.id}`, rekruter);
    assert.equal(terbaru.body.data.terkunci, true);

    const ubah = await kirim('put', `/soal/${soal.id}`, rekruter, { ...contohSoal(), kunciOpsiId: 'b' });
    assert.equal(ubah.status, 409);
    assert.match(ubah.body.error.pesan, /sudah dijawab kandidat/);
    assert.equal((await kirim('delete', `/soal/${soal.id}`, rekruter)).status, 409);

    const nonaktif = await kirim('patch', `/soal/${soal.id}/aktif`, rekruter, { aktif: false });
    assert.equal(nonaktif.status, 200);
    assert.equal(nonaktif.body.data.aktif, false);

    const tetap = await kirim('get', `/soal/${soal.id}`, rekruter);
    assert.equal(tetap.body.data.kunciOpsiId, 'a');
  });

  test('soal terkunci tidak bisa dihapus walau lewat query manual (FK RESTRICT)', async () => {
    const lowongan = await api.lowonganTerbuka(rekruter);
    const { body } = await kirim('get', `/tes/${lowongan.tes[0].id}/soal`, rekruter);
    const kandidatId = await api.lamarLangsung(lowongan.id);
    await api.jawabLangsung(kandidatId, body.data[0].id);
    await assert.rejects(api.pool.query('DELETE FROM soal WHERE id = $1', [body.data[0].id]), { code: '23503' });
  });

  test('DoD 1.6: soal aktif terakhir di lowongan terbuka tidak bisa dinonaktifkan/dihapus', async () => {
    const lowongan = await api.lowonganTerbuka(rekruter);
    const { body } = await kirim('get', `/tes/${lowongan.tes[0].id}/soal`, rekruter);
    const satuSatunya = body.data[0];

    assert.equal((await kirim('patch', `/soal/${satuSatunya.id}/aktif`, rekruter, { aktif: false })).status, 409);
    assert.equal((await kirim('delete', `/soal/${satuSatunya.id}`, rekruter)).status, 409);

    await kirim('patch', `/lowongan/${lowongan.id}/status`, rekruter, { status: 'tutup' });
    assert.equal((await kirim('patch', `/soal/${satuSatunya.id}/aktif`, rekruter, { aktif: false })).status, 200);
  });

  test('pratinjau: kunci, poin, dan soal nonaktif tidak ikut', async () => {
    const lowongan = await api.buatLowongan(rekruter);
    const tesId = lowongan.tes[0].id;
    await api.buatSoal(rekruter, tesId, { pertanyaan: 'Aktif' });
    const nonaktif = await api.buatSoal(rekruter, tesId, { pertanyaan: 'Nonaktif' });
    await kirim('patch', `/soal/${nonaktif.id}/aktif`, rekruter, { aktif: false });

    const res = await kirim('get', `/tes/${tesId}/soal/pratinjau`, rekruter);
    assert.equal(res.status, 200);
    assert.deepEqual(
      res.body.data.map((s) => s.pertanyaan),
      ['Aktif'],
    );
    const json = JSON.stringify(res.body);
    assert.ok(!json.includes('kunciOpsiId') && !json.includes('poin'));
  });

  test('urutkan ulang soal; daftar tidak lengkap → 400', async () => {
    const lowongan = await api.buatLowongan(rekruter);
    const tesId = lowongan.tes[0].id;
    const a = await api.buatSoal(rekruter, tesId, { pertanyaan: 'A' });
    const b = await api.buatSoal(rekruter, tesId, { pertanyaan: 'B' });
    const c = await api.buatSoal(rekruter, tesId, { pertanyaan: 'C' });

    assert.equal((await kirim('put', `/tes/${tesId}/soal/urutan`, rekruter, { urutan: [c.id, a.id, b.id] })).status, 204);
    const res = await kirim('get', `/tes/${tesId}/soal`, rekruter);
    assert.deepEqual(
      res.body.data.map((s) => s.pertanyaan),
      ['C', 'A', 'B'],
    );

    for (const urutan of [[c.id, a.id], [c.id, a.id, b.id, b.id]]) {
      assert.equal((await kirim('put', `/tes/${tesId}/soal/urutan`, rekruter, { urutan })).status, 400);
    }
  });

  test('soal dan tes milik rekruter lain → 404', async () => {
    const lain = await api.daftar('rekruter');
    const lowongan = await api.buatLowongan(rekruter);
    const soal = await api.buatSoal(rekruter, lowongan.tes[0].id);

    assert.equal((await kirim('get', `/tes/${lowongan.tes[0].id}/soal`, lain)).status, 404);
    assert.equal((await kirim('post', `/tes/${lowongan.tes[0].id}/soal`, lain, contohSoal())).status, 404);
    assert.equal((await kirim('get', `/soal/${soal.id}`, lain)).status, 404);
    assert.equal((await kirim('put', `/soal/${soal.id}`, lain, contohSoal())).status, 404);
    assert.equal((await kirim('delete', `/soal/${soal.id}`, lain)).status, 404);
  });
});
