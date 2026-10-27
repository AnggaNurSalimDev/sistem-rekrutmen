/**
 * Isi database dengan data demo (akun, lowongan, soal, pelamar, hasil tes).
 * Hanya menyentuh akun berdomain demo.rekrut.id; data lain tidak diubah.
 * Aman dijalankan berulang (data demo lama dihapus lalu dibuat ulang).
 *
 *   npm run seed:demo
 */
import 'dotenv/config';
import { muatConfig } from '../src/config.js';
import { buatPool } from '../src/db/pool.js';
import { buatStorage } from '../src/storage/index.js';
import { isiDataDemo } from '../src/demo/seed.js';
import { PASSWORD_DEMO } from '../src/demo/data.js';

let config;
try {
  config = muatConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const pool = buatPool(config.DATABASE_URL);
try {
  const hasil = await isiDataDemo({ pool, config, storage: buatStorage(config) });
  console.log('Data demo siap.\n');
  console.log(`Rekruter : ${hasil.rekruter}`);
  console.log(`Pelamar  : ${hasil.pelamar.join(', ')}`);
  console.log(`Password semua akun demo: ${PASSWORD_DEMO}`);
  console.log(`Lowongan : ${hasil.lowongan.map((l) => l.posisi).join(', ')}`);
} catch (err) {
  console.error(`Gagal mengisi data demo: ${err.message}`);
  console.error('Pastikan migrasi sudah dijalankan (npm run migrate).');
  process.exitCode = 1;
} finally {
  await pool.end();
}
