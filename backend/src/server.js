import 'dotenv/config';
import { muatConfig } from './config.js';
import { buatPool } from './db/pool.js';
import { buatStorage } from './storage/index.js';
import { buatApp } from './app.js';

let config;
try {
  config = muatConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const pool = buatPool(config.DATABASE_URL);
try {
  await pool.query('SELECT 1');
} catch (err) {
  console.error(`Tidak bisa terhubung ke database: ${err.message}`);
  console.error('Cek DATABASE_URL di backend/.env dan pastikan PostgreSQL berjalan.');
  process.exit(1);
}

const app = buatApp({ pool, config, storage: buatStorage(config) });
const server = app.listen(config.PORT, () => {
  console.log(`Backend berjalan di http://localhost:${config.PORT}`);
});

function berhenti() {
  server.close(() => pool.end().finally(() => process.exit(0)));
}
process.on('SIGINT', berhenti);
process.on('SIGTERM', berhenti);
