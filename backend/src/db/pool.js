import pg from 'pg';

// NUMERIC dan BIGINT dikembalikan pg sebagai string. Diubah ke number
// supaya bisa langsung dipakai scoring engine. Aman karena nilai di skema
// dibatasi jauh di bawah Number.MAX_SAFE_INTEGER (lihat CHECK di migrasi).
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number.parseFloat(v)));
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

export function buatPool(databaseUrl) {
  if (!databaseUrl) throw new Error('databaseUrl wajib diisi');
  return new pg.Pool({ connectionString: databaseUrl, max: 10 });
}

/**
 * Menjalankan fn di dalam satu transaksi. Rollback otomatis jika fn
 * melempar error; error tetap diteruskan ke pemanggil.
 */
export async function denganTransaksi(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hasil = await fn(client);
    await client.query('COMMIT');
    return hasil;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
