import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
import request from 'supertest';

import { buatPool } from '../../src/db/pool.js';
import { jalankanMigrasi } from '../../src/db/migrate.js';
import { muatConfig } from '../../src/config.js';
import { buatStorageLokal } from '../../src/storage/local.js';
import { buatApp } from '../../src/app.js';

dotenv.config({ path: '.env.test', quiet: true });

export const URL_DB_TEST = process.env.TEST_DATABASE_URL;
export const ALASAN_LEWATI = URL_DB_TEST
  ? false
  : 'TEST_DATABASE_URL belum diisi (lihat backend/.env.test.example)';

const logSenyap = { error() {}, info() {} };

/**
 * Database test dikosongkan total di setiap file test. Guard: nama
 * database wajib mengandung "test", supaya database development atau
 * produksi tidak pernah terhapus karena salah isi variabel.
 */
export async function siapkan(overrideConfig = {}) {
  const namaDb = new URL(URL_DB_TEST).pathname.slice(1);
  if (!/test/i.test(namaDb)) {
    throw new Error(`Menolak menjalankan test: nama database "${namaDb}" tidak mengandung "test"`);
  }

  const pool = buatPool(URL_DB_TEST);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await jalankanMigrasi(pool, { log: logSenyap });

  const dirStorage = await mkdtemp(path.join(tmpdir(), 'rekrutmen-test-'));
  const config = muatConfig({
    NODE_ENV: 'test',
    DATABASE_URL: URL_DB_TEST,
    JWT_SECRET: 'j'.repeat(40),
    STORAGE_SIGNING_SECRET: 's'.repeat(40),
    STORAGE_DIR: dirStorage,
    PUBLIC_BASE_URL: 'http://localhost:3000',
    ...overrideConfig,
  });
  const storage = buatStorageLokal({
    dir: dirStorage,
    signingSecret: config.STORAGE_SIGNING_SECRET,
    publicBaseUrl: config.PUBLIC_BASE_URL,
    ttlDetik: config.SIGNED_URL_TTL_SECONDS,
  });
  const app = buatApp({ pool, config, storage, log: logSenyap });

  let nomor = 0;
  const api = {
    app,
    pool,
    storage,
    config,

    async daftar(role, email = `${role}${++nomor}@contoh.id`) {
      const res = await request(app)
        .post('/auth/register')
        .send({ email, password: 'rahasia123', nama: `User ${role}`, role });
      if (res.status !== 201) throw new Error(`Gagal daftar: ${JSON.stringify(res.body)}`);
      return { token: res.body.token, user: res.body.user, auth: { Authorization: `Bearer ${res.body.token}` } };
    },

    async buatLowongan(akun, ubah = {}) {
      const res = await request(app).post('/lowongan').set(akun.auth).send({ ...contohLowongan(), ...ubah });
      if (res.status !== 201) throw new Error(`Gagal buat lowongan: ${JSON.stringify(res.body)}`);
      return res.body.data;
    },

    async buatSoal(akun, tesId, ubah = {}) {
      const res = await request(app).post(`/tes/${tesId}/soal`).set(akun.auth).send({ ...contohSoal(), ...ubah });
      if (res.status !== 201) throw new Error(`Gagal buat soal: ${JSON.stringify(res.body)}`);
      return res.body.data;
    },

    /** Lowongan berstatus buka dengan satu soal per tes. */
    async lowonganTerbuka(akun) {
      const lowongan = await api.buatLowongan(akun);
      for (const tes of lowongan.tes) await api.buatSoal(akun, tes.id);
      const res = await request(app).patch(`/lowongan/${lowongan.id}/status`).set(akun.auth).send({ status: 'buka' });
      if (res.status !== 200) throw new Error(`Gagal buka lowongan: ${JSON.stringify(res.body)}`);
      return res.body.data;
    },

    /** Lamaran langsung ke database (endpoint lamaran dibuat di Tahap 4). */
    async lamarLangsung(lowonganId) {
      const kandidat = await api.daftar('kandidat');
      const { rows } = await pool.query(
        `INSERT INTO kandidat (user_id, lowongan_id, nama, email, nomor_kontak, ekspektasi_gaji,
           ketersediaan_waktu, persetujuan_data, persetujuan_pada)
         VALUES ($1, $2, 'Kandidat', $3, '0812', 5000000, 'penuh', true, now()) RETURNING id`,
        [kandidat.user.id, lowonganId, kandidat.user.email],
      );
      return rows[0].id;
    },

    async jawabLangsung(kandidatId, soalId, opsi = 'a') {
      await pool.query(
        'INSERT INTO jawaban_kandidat (kandidat_id, soal_id, opsi_dipilih, benar) VALUES ($1, $2, $3, true)',
        [kandidatId, soalId, opsi],
      );
    },

    async tutup() {
      await pool.end();
      await rm(dirStorage, { recursive: true, force: true });
    },
  };
  return api;
}

export function contohLowongan() {
  return {
    posisi: 'Frontend Developer',
    budgetMaksimal: 8_000_000,
    skillWajib: ['React', 'JavaScript'],
    skillOpsional: ['TypeScript'],
    kebutuhanWaktu: 'Senin–Jumat 09.00–17.00',
    tes: [
      { jenisTes: 'logika', targetSkor: 80, batasBawah: 40, bobot: 0.4 },
      { jenisTes: 'coding', targetSkor: 90, batasBawah: 50, bobot: 0.6 },
    ],
  };
}

export function contohSoal() {
  return {
    pertanyaan: 'Berapa hasil 2 + 2?',
    opsi: [
      { id: 'a', teks: '4' },
      { id: 'b', teks: '5' },
    ],
    kunciOpsiId: 'a',
  };
}

export { request };
