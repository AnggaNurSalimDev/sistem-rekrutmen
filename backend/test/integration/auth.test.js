import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { siapkan, request, ALASAN_LEWATI } from './helper.js';

describe('1.1 Health & 1.4 Autentikasi', { skip: ALASAN_LEWATI }, () => {
  let api;
  before(async () => {
    api = await siapkan();
  });
  after(() => api?.tutup());

  test('GET /health → 200', async () => {
    const res = await request(api.app).get('/health');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: 'ok', database: 'ok', fitur: { parserAi: false } });
  });

  test('registrasi berhasil dan password tidak ikut dikembalikan', async () => {
    const res = await request(api.app)
      .post('/auth/register')
      .send({ email: '  Angga@Contoh.ID ', password: 'rahasia123', nama: 'Angga', role: 'rekruter' });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.email, 'angga@contoh.id');
    assert.ok(res.body.token);
    assert.ok(!JSON.stringify(res.body).includes('password'));
  });

  test('email yang sama (beda huruf besar) → 409', async () => {
    const res = await request(api.app)
      .post('/auth/register')
      .send({ email: 'ANGGA@contoh.id', password: 'rahasia123', nama: 'Lain', role: 'kandidat' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.kode, 'EMAIL_TERPAKAI');
  });

  test('password < 8 karakter, peran tidak dikenal, atau field asing → 400', async () => {
    const dasar = { email: 'baru@contoh.id', password: 'rahasia123', nama: 'Baru', role: 'kandidat' };
    for (const salah of [{ password: 'pendek' }, { role: 'admin' }, { isAdmin: true }]) {
      const res = await request(api.app).post('/auth/register').send({ ...dasar, ...salah });
      assert.equal(res.status, 400, JSON.stringify(salah));
      assert.equal(res.body.error.kode, 'VALIDASI');
    }
  });

  test('body bukan JSON valid → 400, bukan 500', async () => {
    const res = await request(api.app).post('/auth/login').set('Content-Type', 'application/json').send('{rusak');
    assert.equal(res.status, 400);
  });

  test('login benar → token; password salah dan email tak dikenal → pesan sama', async () => {
    const ok = await request(api.app).post('/auth/login').send({ email: 'angga@contoh.id', password: 'rahasia123' });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.token);

    const salah = await request(api.app).post('/auth/login').send({ email: 'angga@contoh.id', password: 'salah12345' });
    const takAda = await request(api.app).post('/auth/login').send({ email: 'siapa@contoh.id', password: 'rahasia123' });
    assert.equal(salah.status, 401);
    assert.equal(takAda.status, 401);
    assert.deepEqual(salah.body, takAda.body);
  });

  test('/auth/me: tanpa token, token rusak, token palsu → 401', async () => {
    const akun = await api.daftar('kandidat');
    assert.equal((await request(api.app).get('/auth/me').set(akun.auth)).status, 200);

    assert.equal((await request(api.app).get('/auth/me')).status, 401);
    assert.equal((await request(api.app).get('/auth/me').set('Authorization', 'Bearer abc.def.ghi')).status, 401);

    const palsu = jwt.sign({ role: 'rekruter' }, 'kunci-lain'.repeat(5), { subject: akun.user.id });
    assert.equal((await request(api.app).get('/auth/me').set('Authorization', `Bearer ${palsu}`)).status, 401);

    const tanpaAlg = jwt.sign({ role: 'rekruter', sub: akun.user.id }, '', { algorithm: 'none' });
    assert.equal((await request(api.app).get('/auth/me').set('Authorization', `Bearer ${tanpaAlg}`)).status, 401);
  });

  test('token milik user yang sudah dihapus → 401', async () => {
    const akun = await api.daftar('kandidat');
    await api.pool.query('DELETE FROM users WHERE id = $1', [akun.user.id]);
    assert.equal((await request(api.app).get('/auth/me').set(akun.auth)).status, 401);
  });

  test('peran diambil dari database, bukan dari isi token', async () => {
    const akun = await api.daftar('kandidat');
    const tokenNaikPangkat = jwt.sign({ role: 'rekruter' }, api.config.JWT_SECRET, { subject: akun.user.id });
    const res = await request(api.app).get('/lowongan').set('Authorization', `Bearer ${tokenNaikPangkat}`);
    assert.equal(res.status, 403);
  });

  test('DoD 1.4: kandidat mengakses endpoint rekruter → 403', async () => {
    const kandidat = await api.daftar('kandidat');
    for (const [metode, url] of [
      ['get', '/lowongan'],
      ['post', '/lowongan'],
      ['get', '/tes/00000000-0000-0000-0000-000000000000/soal'],
      ['put', '/soal/00000000-0000-0000-0000-000000000000'],
    ]) {
      const res = await request(api.app)[metode](url).set(kandidat.auth).send({});
      assert.equal(res.status, 403, `${metode} ${url}`);
      assert.equal(res.body.error.kode, 'DILARANG');
    }
  });
});

describe('Pendaftaran rekruter ditutup', { skip: ALASAN_LEWATI }, () => {
  let api;
  before(async () => {
    api = await siapkan({ ALLOW_REKRUTER_SIGNUP: 'false' });
  });
  after(() => api?.tutup());

  test('ALLOW_REKRUTER_SIGNUP=false → rekruter 403, kandidat tetap bisa', async () => {
    const data = { password: 'rahasia123', nama: 'X' };
    const rekruter = await request(api.app).post('/auth/register').send({ ...data, email: 'r@c.id', role: 'rekruter' });
    const kandidat = await request(api.app).post('/auth/register').send({ ...data, email: 'k@c.id', role: 'kandidat' });
    assert.equal(rekruter.status, 403);
    assert.equal(kandidat.status, 201);
  });
});
