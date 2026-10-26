import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { siapkan, request, contohLowongan, ALASAN_LEWATI } from './helper.js';

describe('Paket kamus & pilihan paket di lowongan', { skip: ALASAN_LEWATI }, () => {
  let api;
  let rekruter;
  before(async () => {
    api = await siapkan();
    rekruter = await api.daftar('rekruter');
  });
  after(() => api?.tutup());

  const kirim = (metode, url, akun, body) => request(api.app)[metode](url).set(akun.auth).send(body);

  test('GET /paket-kamus → daftar paket termasuk kru-outlet', async () => {
    const res = await kirim('get', '/paket-kamus', rekruter);
    assert.equal(res.status, 200);
    const kru = res.body.data.find((p) => p.id === 'kru-outlet');
    assert.ok(kru);
    assert.ok(kru.jumlahSkill > 0);
  });

  test('GET /paket-kamus/:id → isi lengkap (transparan), tanpa pola regex mentah', async () => {
    const res = await kirim('get', '/paket-kamus/kru-outlet', rekruter);
    assert.equal(res.status, 200);
    const kasir = res.body.data.skill.find((s) => s.nama === 'Kasir');
    assert.ok(kasir.alias.includes('Cashier'));
    assert.ok(res.body.data.penandaPerusahaan.includes('Indomaret'));
    assert.ok(res.body.data.kataKunci.every((k) => k.label && k.kategori && !('pola' in k)));
    assert.equal((await kirim('get', '/paket-kamus/tidak-ada', rekruter)).status, 404);
  });

  test('kandidat tidak bisa melihat paket kamus → 403', async () => {
    const kandidat = await api.daftar('kandidat');
    assert.equal((await kirim('get', '/paket-kamus', kandidat)).status, 403);
  });

  test('lowongan menyimpan paket; default kosong', async () => {
    const tanpa = await api.buatLowongan(rekruter);
    assert.deepEqual(tanpa.paketKamus, []);
    const dengan = await api.buatLowongan(rekruter, { paketKamus: ['kru-outlet'] });
    assert.deepEqual(dengan.paketKamus, ['kru-outlet']);
  });

  test('paket tidak dikenal atau dobel → 400', async () => {
    for (const paketKamus of [['tidak-ada'], ['kru-outlet', 'kru-outlet']]) {
      const res = await kirim('post', '/lowongan', rekruter, { ...contohLowongan(), paketKamus });
      assert.equal(res.status, 400, JSON.stringify(paketKamus));
    }
  });

  test('PUT tanpa paketKamus mempertahankan pilihan lama; dengan paketKamus menggantinya', async () => {
    const l = await api.buatLowongan(rekruter, { paketKamus: ['kru-outlet'] });
    const { tes, ...umum } = contohLowongan();

    const tetap = await kirim('put', `/lowongan/${l.id}`, rekruter, umum);
    assert.equal(tetap.status, 200);
    assert.deepEqual(tetap.body.data.paketKamus, ['kru-outlet']);

    const ganti = await kirim('put', `/lowongan/${l.id}`, rekruter, { ...umum, paketKamus: ['teknologi-perkantoran'] });
    assert.deepEqual(ganti.body.data.paketKamus, ['teknologi-perkantoran']);
    assert.equal(tes.length, 2);
  });

  test('constraint database verifikasi CV konsisten (migrasi 003)', async () => {
    const l = await api.lowonganTerbuka(rekruter);
    const kandidatId = await api.lamarLangsung(l.id);
    await api.pool.query("INSERT INTO cv_data (kandidat_id, kunci_berkas) VALUES ($1, 'cv/x.pdf')", [kandidatId]);
    await assert.rejects(
      api.pool.query('UPDATE cv_data SET terverifikasi = true WHERE kandidat_id = $1', [kandidatId]),
      { code: '23514' },
    );
    await api.pool.query(
      'UPDATE cv_data SET terverifikasi = true, diverifikasi_pada = now() WHERE kandidat_id = $1',
      [kandidatId],
    );
  });
});
