import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { siapkan, ALASAN_LEWATI } from './helper.js';
import { isiDataDemo, periksaDataDemo } from '../../src/demo/seed.js';
import { PASSWORD_DEMO, REKRUTER } from '../../src/demo/data.js';

/**
 * Tahap 6: data demo harus menghasilkan skenario yang dijanjikan di roadmap,
 * dihitung oleh scoring engine yang sama dengan pengguna asli.
 */
describe('Tahap 6: data demo', { skip: ALASAN_LEWATI }, () => {
  let api;
  let lainnya;
  let kandidat; // nama → baris dari GET /lowongan/:id/kandidat
  let tokenHr;

  const diam = { info() {}, error() {} };

  before(async () => {
    api = await siapkan();
    // Data milik pengguna non-demo tidak boleh tersentuh seeder.
    lainnya = await api.daftar('rekruter', 'hr-asli@contoh.id');
    await api.buatLowongan(lainnya);

    await isiDataDemo({ pool: api.pool, config: api.config, storage: api.storage, log: diam });
    // Dijalankan dua kali: tidak boleh dobel.
    await isiDataDemo({ pool: api.pool, config: api.config, storage: api.storage, log: diam });

    const masuk = await request(api.app).post('/auth/login').send({ email: REKRUTER.email, password: PASSWORD_DEMO });
    assert.equal(masuk.status, 200);
    tokenHr = { Authorization: `Bearer ${masuk.body.token}` };
    const { body } = await request(api.app).get('/lowongan').set(tokenHr);
    kandidat = {};
    for (const l of body.data) {
      const r = await request(api.app).get(`/lowongan/${l.id}/kandidat`).set(tokenHr);
      for (const k of r.body.data) kandidat[k.nama] = { ...k, posisi: l.posisi };
    }
  });
  after(() => api?.tutup());

  test('data demo lolos pemeriksaan invariant', () => {
    assert.doesNotThrow(periksaDataDemo);
  });

  test('menjalankan dua kali tidak menggandakan data, dan data lain tetap utuh', async () => {
    const { body } = await request(api.app).get('/lowongan').set(tokenHr);
    assert.deepEqual(body.data.map((l) => l.posisi).sort(), ['Kasir Outlet', 'Kepala Toko']);
    assert.ok(body.data.every((l) => l.status === 'buka'));
    assert.equal(Object.keys(kandidat).length, 7);
    const milikLain = await request(api.app).get('/lowongan').set(lainnya.auth);
    assert.equal(milikLain.body.data.length, 1);
  });

  test('A: skor tertinggi tapi sering keluar halaman, masih sementara', () => {
    const a = kandidat['Dimas Prasetyo'];
    const lainKepalaToko = Object.values(kandidat).filter((k) => k.posisi === 'Kepala Toko' && k.nama !== a.nama);
    assert.ok(lainKepalaToko.every((k) => k.skorAkhir === null || k.skorAkhir < a.skorAkhir));
    assert.equal(a.skor.sementara, true);
    assert.equal(a.integritas.jumlahKeluarFokus, 9);
    assert.ok(a.integritas.totalDetikKeluarFokus > 100);
    assert.equal(a.integritas.dibukaUlang, 1);
  });

  test('B: sedang, bersih, sudah dicek HR', () => {
    const b = kandidat['Rina Marlina'];
    assert.equal(b.skor.sementara, false);
    assert.equal(b.cv.terverifikasi, true);
    assert.equal(b.integritas.jumlahKeluarFokus, 0);
  });

  test('C: fresh graduate → lama kerja netral 50 + flag', () => {
    const c = kandidat['Putri Ananda'];
    assert.equal(c.skor.komponen.tenure, 50);
    assert.ok(c.skor.flags.includes('tanpa_riwayat_kerja'));
    assert.equal(c.integritas.statusKamera, 'denied');
  });

  test('D: CV scan gagal dibaca → belum lengkap, menunggu isi manual', () => {
    const d = kandidat['Bayu Saputra'];
    assert.equal(d.cv.statusEkstraksi, 'gagal');
    assert.equal(d.skorAkhir, null);
    assert.ok(d.skor.flags.includes('ekstraksi_gagal'));
  });

  test('E: kerja tanpa tanggal → lama kerja 50 + flag, gaji di atas budget', () => {
    const e = kandidat['Sari Wulandari'];
    assert.equal(e.skor.komponen.tenure, 50);
    assert.ok(e.skor.flags.includes('lama_kerja_tidak_disebut'));
    assert.equal(e.skor.komponen.anggaran, 0);
  });

  test('hasil baca CV demo diberi label contoh, bukan AI', () => {
    for (const k of Object.values(kandidat)) {
      if (k.nama === 'Bayu Saputra') assert.equal(k.cv.sumber, null);
      else assert.equal(k.cv.sumber, 'contoh', k.nama);
    }
  });

  test('skor tes konsisten dengan jawaban per soal yang dilihat HR', async () => {
    const a = kandidat['Dimas Prasetyo'];
    const { body } = await request(api.app).get(`/kandidat/${a.id}`).set(tokenHr);
    for (const t of body.data.tes) {
      const benar = t.jawaban.filter((j) => j.benar).length;
      assert.equal(Math.round(t.hasil.skor), Math.round((benar / t.jawaban.length) * 100), t.jenisTes);
    }
    // Sorotan dari kutipan contoh ikut terbentuk.
    assert.ok(body.data.cv.sorotan.some((s) => s.kategori === 'perusahaan'));
  });

  test('lowongan kasir: satu belum tes, satu ditolak', () => {
    assert.equal(kandidat['Fajar Nugroho'].statusAplikasi, 'dilamar');
    assert.equal(kandidat['Fajar Nugroho'].integritas, null);
    assert.equal(kandidat['Lestari Dewi'].statusAplikasi, 'ditolak');
  });
});
