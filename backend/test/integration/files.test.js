import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { siapkan, request, ALASAN_LEWATI } from './helper.js';

describe('1.3 Storage privat & signed URL', { skip: ALASAN_LEWATI }, () => {
  let api;
  let kunci;
  const isi = Buffer.from('%PDF-1.4 contoh');

  before(async () => {
    api = await siapkan();
    kunci = await api.storage.simpan('cv', isi, 'pdf');
  });
  after(() => api?.tutup());

  const jalur = (url) => new URL(url).pathname + new URL(url).search;

  test('DoD 1.3: URL bertanda tangan → 200 dengan isi berkas', async () => {
    const res = await request(api.app).get(jalur(api.storage.buatUrlBertanda(kunci)));
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-type'], 'application/pdf');
    assert.equal(res.headers['cache-control'], 'private, no-store');
    assert.deepEqual(Buffer.from(res.body), isi);
  });

  test('DoD 1.3: tanpa tanda tangan → 404', async () => {
    assert.equal((await request(api.app).get(`/files/${kunci}`)).status, 404);
  });

  test('tanda tangan diubah, kunci ditukar, atau exp diperpanjang → 404', async () => {
    const url = new URL(api.storage.buatUrlBertanda(kunci));
    const sig = url.searchParams.get('sig');
    const exp = url.searchParams.get('exp');

    const sigSalah = sig.slice(0, -1) + (sig.endsWith('0') ? '1' : '0');
    const kunciLain = await api.storage.simpan('cv', Buffer.from('lain'), 'pdf');

    for (const q of [
      `/files/${kunci}?exp=${exp}&sig=${sigSalah}`,
      `/files/${kunciLain}?exp=${exp}&sig=${sig}`,
      `/files/${kunci}?exp=${Number(exp) + 3600}&sig=${sig}`,
      `/files/${kunci}?exp=${exp}&sig=pendek`,
    ]) {
      assert.equal((await request(api.app).get(q)).status, 404, q);
    }
  });

  test('URL kedaluwarsa → 404', async () => {
    const url = api.storage.buatUrlBertanda(kunci, -1);
    assert.equal((await request(api.app).get(jalur(url))).status, 404);
  });

  test('path traversal ditolak', async () => {
    for (const q of ['/files/../package.json', '/files/cv/..%2F..%2Fpackage.json', '/files/%2e%2e/package.json']) {
      const res = await request(api.app).get(`${q}?exp=9999999999&sig=${'0'.repeat(64)}`);
      assert.equal(res.status, 404, q);
    }
    assert.throws(() => api.storage.buatUrlBertanda('../rahasia.pdf'));
  });
});
