import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const FOLDER_MIGRASI = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const KUNCI_ADVISORY = 727001; // mencegah dua proses migrasi berjalan bersamaan
const POLA_NAMA = /^\d{3}_[a-z0-9_]+\.sql$/;

/**
 * Menjalankan file migrasi .sql yang belum pernah dijalankan, berurutan
 * menurut nama. Setiap file dijalankan dalam transaksinya sendiri.
 * @returns {Promise<string[]>} nama file yang baru dijalankan
 */
export async function jalankanMigrasi(pool, { log = console } = {}) {
  const semua = (await readdir(FOLDER_MIGRASI)).filter((f) => f.endsWith('.sql')).sort();
  const salahNama = semua.filter((f) => !POLA_NAMA.test(f));
  if (salahNama.length > 0) throw new Error(`Nama file migrasi tidak sesuai pola 000_nama.sql: ${salahNama}`);

  const client = await pool.connect();
  const dijalankan = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [KUNCI_ADVISORY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        nama TEXT PRIMARY KEY,
        dijalankan_pada TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    const { rows } = await client.query('SELECT nama FROM schema_migrations');
    const sudah = new Set(rows.map((r) => r.nama));

    for (const file of semua) {
      if (sudah.has(file)) continue;
      const sql = await readFile(path.join(FOLDER_MIGRASI, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (nama) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migrasi ${file} gagal: ${err.message}`, { cause: err });
      }
      dijalankan.push(file);
      log.info?.(`migrasi: ${file}`);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [KUNCI_ADVISORY]).catch(() => {});
    client.release();
  }
  return dijalankan;
}
