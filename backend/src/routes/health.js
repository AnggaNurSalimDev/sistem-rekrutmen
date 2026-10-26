import { Router } from 'express';

export function ruteHealth({ pool, parserAi }) {
  // Frontend memakai ini untuk menampilkan "Parser AI tidak aktif di demo".
  const fitur = { parserAi: parserAi !== null };
  const r = Router();
  r.get('/', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', database: 'ok', fitur });
    } catch {
      res.status(503).json({ status: 'gangguan', database: 'tidak terhubung', fitur });
    }
  });
  return r;
}
