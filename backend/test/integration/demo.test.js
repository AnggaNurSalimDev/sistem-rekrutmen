import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { siapkan, ALASAN_LEWATI } from './helper.js';
import { isiDataDemo, periksaDataDemo } from '../../src/demo/seed.js';
import { LOWONGAN, PASSWORD_DEMO, PELAMAR, PELAMAR_CERITA, REKRUTER } from '../../src/demo/data.js';
import { buatPelamarAcak } from '../../src/demo/generator.js';

/**
 * Tahap 6: data demo harus menghasilkan skenario yang dijanjikan di roadmap,
 * dihitung oleh scoring engine yang sama dengan pengguna asli.
 */
describe('Tahap 6: data demo', { skip: ALASAN_LEWATI }, () => {
  let api;
  let lainnya;
  let kandidat; // nama → baris dari GET /lowongan/:id/kandidat
  let lowonganDemo;
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
    lowonganDemo = body.data;
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
    assert.deepEqual(body.data.map((l) => l.posisi).sort(), LOWONGAN.map((l) => l.body.posisi).sort());
    assert.equal(Object.keys(kandidat).length, PELAMAR.length);
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
    for (const p of PELAMAR) {
      const k = kandidat[p.nama];
      // CV scan: tidak ada hasil baca; kalau HR sudah mengetik datanya, sumbernya manual.
      if (!p.contohHasil) assert.equal(k.cv.sumber, p.isiManual ? 'manual' : null, p.nama);
      else assert.equal(k.cv.sumber, 'contoh', p.nama);
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

  // ---------------------------------------------------------------- data tambahan (generator.js)

  test('jumlah data cukup untuk demo: ≥ 60 pelamar di ≥ 4 lowongan terbuka', () => {
    assert.ok(PELAMAR.length >= 60, `hanya ${PELAMAR.length} pelamar`);
    assert.ok(lowonganDemo.filter((l) => l.status === 'buka').length >= 4);
  });

  test('status lowongan: buka, tutup, dan draf ada; draf tanpa pelamar', () => {
    const status = new Map(lowonganDemo.map((l) => [l.posisi, l]));
    for (const l of LOWONGAN) assert.equal(status.get(l.body.posisi).status, l.status, l.body.posisi);
    assert.ok(lowonganDemo.some((l) => l.status === 'draf' && l.jumlahPelamar === 0));
  });

  test('generator deterministik: dijalankan ulang menghasilkan pelamar yang sama persis', () => {
    const namaCerita = () => new Set(PELAMAR_CERITA.map((p) => p.nama));
    const a = buatPelamarAcak(LOWONGAN, { namaTerpakai: namaCerita() });
    const b = buatPelamarAcak(LOWONGAN, { namaTerpakai: namaCerita() });
    assert.deepEqual(a, b);
  });

  test('semua CV yang dibuat generator terbaca (tidak ada yang gagal karena PDF buatan seeder)', () => {
    for (const p of PELAMAR.filter((x) => x.cvBaris)) {
      const k = kandidat[p.nama];
      assert.notEqual(k.cv.statusEkstraksi, 'gagal', p.nama);
      assert.notEqual(k.cv.statusEkstraksi, 'menunggu', p.nama);
    }
  });

  test('temuan AI yang dikarang dibuang oleh verifikasi kutipan, CV ditandai perlu ditinjau', async () => {
    const dikarang = PELAMAR.filter((p) => p.kutipanDikarang?.length);
    assert.ok(dikarang.length >= 3);
    for (const p of dikarang) {
      const { body } = await request(api.app).get(`/kandidat/${kandidat[p.nama].id}`).set(tokenHr);
      assert.equal(body.data.cv.statusEkstraksi, 'perlu_tinjau', p.nama);
      assert.ok(body.data.cv.riwayatKerja.every((r) => r.perusahaan !== 'PT Sentosa Raya Abadi'), p.nama);
      assert.ok(body.data.cv.alasanTinjau.some((a) => a.includes('dibuang')), p.nama);
    }
  });

  test('CV dengan perintah tersembunyi untuk AI ditandai untuk HR', async () => {
    const p = PELAMAR.find((x) => x.cvBaris?.some((b) => b.teks.includes('abaikan semua instruksi')));
    assert.ok(p, 'kasus perintah AI harus ada');
    const { body } = await request(api.app).get(`/kandidat/${kandidat[p.nama].id}`).set(tokenHr);
    assert.equal(body.data.cv.statusEkstraksi, 'perlu_tinjau');
    assert.ok(body.data.cv.alasanTinjau.some((a) => a.includes('perintah untuk AI')));
  });

  test('CV scan yang diisi manual oleh HR: sumber manual, terverifikasi, skor lengkap', () => {
    const manual = PELAMAR.filter((p) => p.isiManual);
    assert.ok(manual.length >= 1);
    for (const p of manual) {
      const k = kandidat[p.nama];
      assert.equal(k.cv.sumber, 'manual', p.nama);
      assert.equal(k.cv.terverifikasi, true, p.nama);
      assert.equal(k.skor.sementara, false, p.nama);
    }
  });

  test('lowongan ditutup: semua sudah diputuskan, 2 skor tertinggi diterima', () => {
    const l = LOWONGAN.find((x) => x.status === 'tutup');
    const daftar = Object.values(kandidat).filter((k) => k.posisi === l.body.posisi);
    assert.ok(daftar.length > 0);
    assert.ok(daftar.every((k) => k.statusAplikasi === 'diterima' || k.statusAplikasi === 'ditolak'));
    const diterima = daftar.filter((k) => k.statusAplikasi === 'diterima');
    assert.equal(diterima.length, l.keputusan.diterima);
    const minDiterima = Math.min(...diterima.map((k) => k.skorAkhir));
    assert.ok(daftar.filter((k) => k.statusAplikasi === 'ditolak').every((k) => k.skorAkhir <= minDiterima));
  });

  test('keputusan mengikuti peringkat skor: yang diterima tidak pernah berskor di bawah yang ditolak', () => {
    for (const l of LOWONGAN) {
      const daftar = Object.values(kandidat).filter((k) => k.posisi === l.body.posisi);
      const diterima = daftar.filter((k) => k.statusAplikasi === 'diterima').map((k) => k.skorAkhir);
      const ditolak = daftar.filter((k) => k.statusAplikasi === 'ditolak' && PELAMAR.find((p) => p.nama === k.nama)?.cvBaris !== undefined && !PELAMAR_CERITA.some((p) => p.nama === k.nama)).map((k) => k.skorAkhir);
      if (diterima.length && ditolak.length) assert.ok(Math.min(...diterima) >= Math.max(...ditolak), l.body.posisi);
    }
  });

  test('keputusan hanya pada CV yang sudah dicek HR', () => {
    for (const k of Object.values(kandidat)) {
      if (k.statusAplikasi === 'diterima' || k.statusAplikasi === 'ditolak') assert.equal(k.cv.terverifikasi, true, k.nama);
    }
  });

  test('tanggal lamaran tersebar (bukan semuanya hari ini) dan tidak di masa depan', () => {
    const hari = new Set(Object.values(kandidat).map((k) => k.dikirimPada.slice(0, 10)));
    assert.ok(hari.size >= 10, `hanya ${hari.size} tanggal berbeda`);
    assert.ok(Object.values(kandidat).every((k) => new Date(k.dikirimPada) <= new Date()));
  });

  test('variasi tahap: ada yang belum tes, sebagian tes, selesai, diterima, ditolak', () => {
    const status = new Set(Object.values(kandidat).map((k) => k.statusAplikasi));
    for (const s of ['dilamar', 'ujian', 'selesai', 'diterima', 'ditolak']) assert.ok(status.has(s), s);
    const kamera = new Set(Object.values(kandidat).map((k) => k.integritas?.statusKamera).filter(Boolean));
    assert.ok(kamera.size >= 3, `status kamera: ${[...kamera]}`);
  });

  test('skor tes semua pelamar konsisten dengan jawaban per soal', async () => {
    for (const k of Object.values(kandidat).filter((x) => x.ujian.length > 0)) {
      const { body } = await request(api.app).get(`/kandidat/${k.id}`).set(tokenHr);
      for (const t of body.data.tes.filter((x) => x.hasil)) {
        const benar = t.jawaban.filter((j) => j.benar).length;
        assert.equal(Math.round(t.hasil.skor), Math.round((benar / t.jawaban.length) * 100), `${k.nama} ${t.jenisTes}`);
      }
    }
  });
});
