import 'dotenv/config';
import { buatPool } from './pool.js';
import { jalankanMigrasi } from './migrate.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL belum diisi. Salin backend/.env.example menjadi backend/.env.');
  process.exit(1);
}

const pool = buatPool(url);
try {
  const baru = await jalankanMigrasi(pool);
  console.log(baru.length === 0 ? 'Database sudah terbaru.' : `${baru.length} migrasi dijalankan.`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
