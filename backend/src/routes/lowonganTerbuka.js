import { Router } from 'express';
import { tidakDitemukan } from '../http/errors.js';
import { idParam } from '../http/validate.js';

/**
 * Lowongan berstatus "buka" untuk calon pelamar. Publik (tanpa login) supaya
 * bisa dibagikan sebagai tautan. Sengaja TIDAK memuat budget, kata kunci
 * sorot, dan target/batas bawah tes: itu informasi internal rekruter.
 */
const SQL = `
  SELECT l.id, l.posisi, l.skill_wajib, l.skill_opsional, l.kebutuhan_waktu, l.dibuat_pada,
    COALESCE(json_agg(json_build_object(
      'id', t.id,
      'jenisTes', t.jenis_tes,
      'jumlahSoal', (SELECT count(*)::int FROM soal s WHERE s.lowongan_tes_id = t.id AND s.aktif)
    ) ORDER BY t.urutan) FILTER (WHERE t.id IS NOT NULL), '[]') AS tes
  FROM lowongan l
  LEFT JOIN lowongan_tes t ON t.lowongan_id = l.id
  WHERE l.status = 'buka'`;

const tampilkan = (l) => ({
  id: l.id,
  posisi: l.posisi,
  skillWajib: l.skill_wajib,
  skillOpsional: l.skill_opsional,
  kebutuhanWaktu: l.kebutuhan_waktu,
  dibuatPada: l.dibuat_pada,
  tes: l.tes,
});

export function ruteLowonganTerbuka({ pool }) {
  const r = Router();

  r.get('/', async (_req, res) => {
    const { rows } = await pool.query(`${SQL} GROUP BY l.id ORDER BY l.dibuat_pada DESC`);
    res.json({ data: rows.map(tampilkan) });
  });

  r.get('/:id', async (req, res) => {
    idParam(req.params.id, 'Lowongan');
    const { rows } = await pool.query(`${SQL} AND l.id = $1 GROUP BY l.id`, [req.params.id]);
    if (rows.length === 0) throw tidakDitemukan('Lowongan');
    res.json({ data: tampilkan(rows[0]) });
  });

  return r;
}
