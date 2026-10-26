/**
 * Backend dengan parser AI PALSU, khusus untuk uji ujung ke ujung
 * (frontend/e2e/alur-rekruter.mjs). Tidak memanggil API mana pun.
 *
 * Parser palsu selalu "menemukan" data CV contoh di
 * test/fixtures/pdf/cv-dua-kolom.pdf. Untuk CV lain, kutipannya tidak ada
 * di teks, sehingga verifikasi membuangnya dan CV masuk status perlu_tinjau.
 * Jadi alur verifikasi kutipan tetap berjalan sungguhan.
 *
 *   PORT=3100 CORS_ORIGIN=http://localhost:4173 node scripts/server-ai-palsu.js
 */
import 'dotenv/config';
import { muatConfig } from '../src/config.js';
import { buatPool } from '../src/db/pool.js';
import { buatStorage } from '../src/storage/index.js';
import { buatApp } from '../src/app.js';

if (process.env.NODE_ENV === 'production') {
  console.error('server-ai-palsu hanya untuk pengujian. Jangan dijalankan di produksi.');
  process.exit(1);
}

const config = muatConfig();
const pool = buatPool(config.DATABASE_URL);
await pool.query('SELECT 1');

async function parserPalsu() {
  return {
    skills: [
      { nama: 'React', kutipan: 'React.js' },
      { nama: 'JavaScript', kutipan: 'JavaScript' },
      { nama: 'Git', kutipan: 'Git' },
    ],
    riwayatKerja: [
      {
        perusahaan: 'PT Solusi Digital Nusantara',
        jabatan: 'Frontend Developer',
        mulai: '2022-01',
        selesai: null,
        masihBekerja: true,
        hanyaTahun: false,
        kutipan: 'Frontend Developer Januari 2022 - Sekarang PT Solusi Digital Nusantara',
      },
      {
        perusahaan: 'CV Maju Bersama',
        jabatan: 'Staf IT',
        mulai: '2020-03',
        selesai: '2021-12',
        masihBekerja: false,
        hanyaTahun: false,
        kutipan: 'Staf IT Mar 2020 – Des 2021 CV Maju Bersama',
      },
    ],
    temuanLain: [],
  };
}

const app = buatApp({ pool, config, storage: buatStorage(config), parserAi: parserPalsu });
const server = app.listen(config.PORT, () => console.log(`Backend (AI palsu) di http://localhost:${config.PORT}`));
const berhenti = () => server.close(() => pool.end().finally(() => process.exit(0)));
process.on('SIGINT', berhenti);
process.on('SIGTERM', berhenti);
