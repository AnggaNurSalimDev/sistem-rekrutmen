import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { siapkan, request, contohLowongan, ALASAN_LEWATI } from './helper.js';

describe('Kata kunci sorot per lowongan', { skip: ALASAN_LEWATI }, () => {
  let api;
  let rekruter;
  before(async () => {
    api = await siapkan();
    rekruter = await api.daftar('rekruter');
  });
  after(() => api?.tutup());

  const kirim = (metode, url, body) => request(api.app)[metode](url).set(rekruter.auth).send(body);

  test('default kosong; bisa diisi kata maupun kalimat', async () => {
    const tanpa = await api.buatLowongan(rekruter);
    assert.deepEqual(tanpa.kataKunciSorot, []);
    const dengan = await api.buatLowongan(rekruter, { kataKunciSorot: ['kasir', 'bersedia kerja shift'] });
    assert.deepEqual(dengan.kataKunciSorot, ['kasir', 'bersedia kerja shift']);
  });

  test('dobel (beda huruf besar), kosong, atau terlalu banyak → 400', async () => {
    const kasus = [['Kasir', 'kasir'], ['  '], Array.from({ length: 51 }, (_, i) => `kata ${i}`)];
    for (const kataKunciSorot of kasus) {
      const res = await kirim('post', '/lowongan', { ...contohLowongan(), kataKunciSorot });
      assert.equal(res.status, 400, JSON.stringify(kataKunciSorot).slice(0, 60));
    }
  });

  test('PUT tanpa kataKunciSorot mempertahankan daftar lama; dengan daftar menggantinya', async () => {
    const l = await api.buatLowongan(rekruter, { kataKunciSorot: ['kasir'] });
    const { tes: _tes, ...umum } = contohLowongan();

    const tetap = await kirim('put', `/lowongan/${l.id}`, umum);
    assert.equal(tetap.status, 200);
    assert.deepEqual(tetap.body.data.kataKunciSorot, ['kasir']);

    const ganti = await kirim('put', `/lowongan/${l.id}`, { ...umum, kataKunciSorot: ['barista'] });
    assert.deepEqual(ganti.body.data.kataKunciSorot, ['barista']);
  });

  test('kata kunci boleh diubah walau lowongan sedang dibuka', async () => {
    const l = await api.lowonganTerbuka(rekruter);
    const { tes: _tes, ...umum } = contohLowongan();
    const res = await kirim('put', `/lowongan/${l.id}`, { ...umum, kataKunciSorot: ['SIM C'] });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.kataKunciSorot, ['SIM C']);
  });

  test('endpoint paket kamus lama sudah tidak ada', async () => {
    assert.equal((await kirim('get', '/paket-kamus')).status, 404);
  });

  test('constraint sumber_ekstraksi hanya ai/manual (migrasi 004)', async () => {
    const l = await api.lowonganTerbuka(rekruter);
    const kandidatId = await api.lamarLangsung(l.id);
    await assert.rejects(
      api.pool.query("INSERT INTO cv_data (kandidat_id, kunci_berkas, sumber_ekstraksi) VALUES ($1, 'cv/x.pdf', 'regex')", [kandidatId]),
      { code: '23514' },
    );
    await api.pool.query("INSERT INTO cv_data (kandidat_id, kunci_berkas, sumber_ekstraksi) VALUES ($1, 'cv/x.pdf', 'ai')", [kandidatId]);
  });
});
