import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';

import { buatBatasAuth } from '../src/http/rateLimit.js';
import { buatErrorHandler } from '../src/http/errors.js';

/** Aplikasi mini: cuma limiter + satu rute kosong, tanpa DB sama sekali. */
function appUji() {
  const app = express();
  app.set('trust proxy', 1); // supaya header X-Forwarded-For di test ini dipercaya, sama seperti app.js
  app.use('/auth', buatBatasAuth());
  app.get('/auth/x', (_req, res) => res.json({ ok: true }));
  app.use(buatErrorHandler({ log: { error() {} } }));
  return app;
}

describe('Pembatas laju endpoint auth', () => {
  test('mengizinkan sampai batas, lalu menolak dengan 429 dan bentuk error yang konsisten', async () => {
    const app = appUji();

    for (let i = 0; i < 20; i++) {
      const res = await request(app).get('/auth/x');
      assert.equal(res.status, 200, `percobaan ke-${i + 1} semestinya masih diizinkan`);
    }

    const res = await request(app).get('/auth/x');
    assert.equal(res.status, 429);
    assert.equal(res.body.error.kode, 'TERLALU_SERING');
    assert.ok(res.body.error.pesan.length > 0);
  });

  test('IP berbeda punya jatah sendiri-sendiri (tidak saling memotong)', async () => {
    const app = appUji();

    for (let i = 0; i < 20; i++) {
      await request(app).get('/auth/x').set('X-Forwarded-For', '1.1.1.1');
    }
    // IP pertama sudah habis jatahnya...
    const habis = await request(app).get('/auth/x').set('X-Forwarded-For', '1.1.1.1');
    assert.equal(habis.status, 429);

    // ...tapi IP lain masih punya jatah penuh.
    const lain = await request(app).get('/auth/x').set('X-Forwarded-For', '2.2.2.2');
    assert.equal(lain.status, 200);
  });
});
