import { Router } from 'express';

export function ruteHealth({ pool }) {
  const r = Router();
  r.get('/', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', database: 'ok' });
    } catch {
      res.status(503).json({ status: 'gangguan', database: 'tidak terhubung' });
    }
  });
  return r;
}
