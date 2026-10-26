import { Router } from 'express';
import { denganTransaksi } from '../db/pool.js';
import { konflik, tidakDitemukan, validasiGagal } from '../http/errors.js';
import { parse, idParam, z } from '../http/validate.js';
import { requireRole } from '../auth/middleware.js';
import { validasiSoal, soalUntukKandidat } from '../scoring/soal.js';

const skemaOpsi = z.strictObject({
  id: z.string().trim().min(1).max(20),
  teks: z.string().trim().min(1).max(500),
});

const skemaSoal = z.strictObject({
  pertanyaan: z.string().trim().min(1).max(2000),
  opsi: z.array(skemaOpsi).min(2).max(6),
  kunciOpsiId: z.string().trim().min(1).max(20),
  poin: z.number().gt(0).max(100).default(1),
  urutan: z.int().min(0).max(10_000).optional(),
});

const skemaAktif = z.strictObject({ aktif: z.boolean() });
const skemaUrutan = z.strictObject({ urutan: z.array(z.uuid()).max(500) });

const SQL_SOAL = `
  SELECT s.*, EXISTS (SELECT 1 FROM jawaban_kandidat j WHERE j.soal_id = s.id) AS terkunci
  FROM soal s`;

function tampilkanSoal(s) {
  return {
    id: s.id,
    tesId: s.lowongan_tes_id,
    pertanyaan: s.pertanyaan,
    opsi: s.opsi,
    kunciOpsiId: s.kunci_opsi_id,
    poin: s.poin,
    urutan: s.urutan,
    aktif: s.aktif,
    terkunci: s.terkunci,
  };
}

const keDomain = (s) => ({
  id: s.id,
  pertanyaan: s.pertanyaan,
  opsi: s.opsi,
  kunciOpsiId: s.kunci_opsi_id,
  poin: s.poin,
  urutan: s.urutan,
  aktif: s.aktif,
});

/**
 * Tes milik rekruter ini, beserta status lowongannya.
 * kunci = true mengunci baris lowongan supaya pengecekan
 * "soal aktif terakhir" tidak balapan dengan perubahan status.
 */
async function ambilTesMilik(db, tesId, userId, { kunci = false } = {}) {
  idParam(tesId, 'Tes');
  const { rows } = await db.query(
    `SELECT t.id, t.jenis_tes, l.id AS lowongan_id, l.status AS status_lowongan
     FROM lowongan_tes t JOIN lowongan l ON l.id = t.lowongan_id
     WHERE t.id = $1 AND l.dibuat_oleh = $2
     ${kunci ? 'FOR UPDATE OF l' : ''}`,
    [tesId, userId],
  );
  if (rows.length === 0) throw tidakDitemukan('Tes');
  return rows[0];
}

async function ambilSoalMilik(db, soalId, userId, { kunci = false } = {}) {
  idParam(soalId, 'Soal');
  const { rows } = await db.query('SELECT lowongan_tes_id FROM soal WHERE id = $1', [soalId]);
  if (rows.length === 0) throw tidakDitemukan('Soal');

  const tes = await ambilTesMilik(db, rows[0].lowongan_tes_id, userId, { kunci });
  const { rows: soal } = await db.query(`${SQL_SOAL} WHERE s.id = $1 ${kunci ? 'FOR UPDATE OF s' : ''}`, [soalId]);
  if (soal.length === 0) throw tidakDitemukan('Soal');
  return { soal: soal[0], tes };
}

function validasiIsi(data) {
  validasiSoal({ id: 'baru', ...data });
}

function tolakJikaTerkunci(soal, aksi) {
  if (soal.terkunci) {
    throw konflik(
      `Soal sudah dijawab kandidat sehingga tidak bisa ${aksi}. Nonaktifkan soal ini dan buat soal baru jika isinya perlu diganti.`,
      { field: 'terkunci' },
    );
  }
}

/** Lowongan yang sedang dibuka wajib tetap punya minimal satu soal aktif per tes. */
async function pastikanBukanSoalAktifTerakhir(db, soal, tes) {
  if (!soal.aktif || tes.status_lowongan !== 'buka') return;
  const { rows } = await db.query(
    'SELECT count(*)::int AS n FROM soal WHERE lowongan_tes_id = $1 AND aktif AND id <> $2',
    [tes.id, soal.id],
  );
  if (rows[0].n === 0) {
    throw konflik(`Ini soal aktif terakhir di tes "${tes.jenis_tes}" pada lowongan yang sedang dibuka`);
  }
}

/** Rute /tes/:tesId/soal */
export function ruteSoalPerTes({ pool, requireAuth }) {
  const r = Router({ mergeParams: true });
  r.use(requireAuth, requireRole('rekruter'));

  r.get('/', async (req, res) => {
    const tes = await ambilTesMilik(pool, req.params.tesId, req.user.id);
    const { rows } = await pool.query(`${SQL_SOAL} WHERE s.lowongan_tes_id = $1 ORDER BY s.urutan, s.dibuat_pada`, [
      tes.id,
    ]);
    res.json({ data: rows.map(tampilkanSoal) });
  });

  // Apa yang akan dilihat kandidat: tanpa kunci, tanpa poin, tanpa soal nonaktif.
  r.get('/pratinjau', async (req, res) => {
    const tes = await ambilTesMilik(pool, req.params.tesId, req.user.id);
    const { rows } = await pool.query(`${SQL_SOAL} WHERE s.lowongan_tes_id = $1`, [tes.id]);
    res.json({ data: soalUntukKandidat(rows.map(keDomain)) });
  });

  r.post('/', async (req, res) => {
    const data = parse(skemaSoal, req.body);
    validasiIsi(data);

    const hasil = await denganTransaksi(pool, async (db) => {
      const tes = await ambilTesMilik(db, req.params.tesId, req.user.id, { kunci: true });
      let urutan = data.urutan;
      if (urutan === undefined) {
        const { rows } = await db.query(
          'SELECT COALESCE(max(urutan) + 1, 0)::int AS n FROM soal WHERE lowongan_tes_id = $1',
          [tes.id],
        );
        urutan = rows[0].n;
      }
      const { rows } = await db.query(
        `INSERT INTO soal (lowongan_tes_id, pertanyaan, opsi, kunci_opsi_id, poin, urutan)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [tes.id, data.pertanyaan, JSON.stringify(data.opsi), data.kunciOpsiId, data.poin, urutan],
      );
      return (await db.query(`${SQL_SOAL} WHERE s.id = $1`, [rows[0].id])).rows[0];
    });
    res.status(201).json({ data: tampilkanSoal(hasil) });
  });

  r.put('/urutan', async (req, res) => {
    const { urutan } = parse(skemaUrutan, req.body);

    await denganTransaksi(pool, async (db) => {
      const tes = await ambilTesMilik(db, req.params.tesId, req.user.id, { kunci: true });
      const { rows } = await db.query('SELECT id FROM soal WHERE lowongan_tes_id = $1', [tes.id]);
      const ada = new Set(rows.map((s) => s.id));
      const diminta = new Set(urutan);

      const samaPersis = diminta.size === urutan.length && diminta.size === ada.size && [...ada].every((id) => diminta.has(id));
      if (!samaPersis) {
        throw validasiGagal('Daftar urutan harus berisi semua soal di tes ini, masing-masing tepat satu kali', {
          field: 'urutan',
        });
      }
      for (const [i, id] of urutan.entries()) {
        await db.query('UPDATE soal SET urutan = $1 WHERE id = $2', [i, id]);
      }
    });
    res.status(204).end();
  });

  return r;
}

/** Rute /soal/:id */
export function ruteSoal({ pool, requireAuth }) {
  const r = Router();
  r.use(requireAuth, requireRole('rekruter'));

  r.get('/:id', async (req, res) => {
    const { soal } = await ambilSoalMilik(pool, req.params.id, req.user.id);
    res.json({ data: tampilkanSoal(soal) });
  });

  r.put('/:id', async (req, res) => {
    const data = parse(skemaSoal, req.body);
    validasiIsi(data);

    const hasil = await denganTransaksi(pool, async (db) => {
      const { soal } = await ambilSoalMilik(db, req.params.id, req.user.id, { kunci: true });
      tolakJikaTerkunci(soal, 'diubah');
      await db.query(
        `UPDATE soal SET pertanyaan = $1, opsi = $2, kunci_opsi_id = $3, poin = $4,
           urutan = COALESCE($5, urutan), diubah_pada = now()
         WHERE id = $6`,
        [data.pertanyaan, JSON.stringify(data.opsi), data.kunciOpsiId, data.poin, data.urutan ?? null, soal.id],
      );
      return (await db.query(`${SQL_SOAL} WHERE s.id = $1`, [soal.id])).rows[0];
    });
    res.json({ data: tampilkanSoal(hasil) });
  });

  // Mengaktifkan/menonaktifkan selalu boleh, termasuk soal terkunci.
  r.patch('/:id/aktif', async (req, res) => {
    const { aktif } = parse(skemaAktif, req.body);

    const hasil = await denganTransaksi(pool, async (db) => {
      const { soal, tes } = await ambilSoalMilik(db, req.params.id, req.user.id, { kunci: true });
      if (!aktif) await pastikanBukanSoalAktifTerakhir(db, soal, tes);
      await db.query('UPDATE soal SET aktif = $1, diubah_pada = now() WHERE id = $2', [aktif, soal.id]);
      return (await db.query(`${SQL_SOAL} WHERE s.id = $1`, [soal.id])).rows[0];
    });
    res.json({ data: tampilkanSoal(hasil) });
  });

  r.delete('/:id', async (req, res) => {
    await denganTransaksi(pool, async (db) => {
      const { soal, tes } = await ambilSoalMilik(db, req.params.id, req.user.id, { kunci: true });
      tolakJikaTerkunci(soal, 'dihapus');
      await pastikanBukanSoalAktifTerakhir(db, soal, tes);
      await db.query('DELETE FROM soal WHERE id = $1', [soal.id]);
    });
    res.status(204).end();
  });

  return r;
}
