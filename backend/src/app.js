import express from 'express';
import cors from 'cors';
import { buatRequireAuth } from './auth/middleware.js';
import { buatErrorHandler, notFoundHandler } from './http/errors.js';
import { ruteHealth } from './routes/health.js';
import { ruteAuth } from './routes/auth.js';
import { ruteLowongan } from './routes/lowongan.js';
import { ruteSoalPerTes, ruteSoal } from './routes/soal.js';
import { ruteFiles } from './routes/files.js';
import { ruteLowonganTerbuka } from './routes/lowonganTerbuka.js';
import { ruteLamaran } from './routes/lamaran.js';
import { ruteKandidat, ruteKandidatPerLowongan } from './routes/kandidat.js';

/**
 * Membuat aplikasi Express tanpa menyalakan server, supaya bisa diuji
 * dengan supertest memakai database dan storage apa pun.
 */
export function buatApp({ pool, config, storage, parserAi = null, log = console }) {
  if (!pool || !config || !storage) throw new Error('buatApp butuh pool, config, dan storage');
  if (parserAi !== null && typeof parserAi !== 'function') throw new Error('parserAi harus fungsi atau null');

  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: config.CORS_ORIGIN.split(',').map((o) => o.trim()) }));
  app.use(express.json({ limit: '100kb' }));

  const requireAuth = buatRequireAuth({ pool, secret: config.JWT_SECRET });
  const deps = { pool, config, storage, parserAi, requireAuth, log };

  app.use('/health', ruteHealth(deps));
  app.use('/auth', ruteAuth(deps));
  app.use('/lowongan/:lowonganId/kandidat', ruteKandidatPerLowongan(deps));
  app.use('/lowongan', ruteLowongan(deps));
  app.use('/tes/:tesId/soal', ruteSoalPerTes(deps));
  app.use('/soal', ruteSoal(deps));
  app.use('/files', ruteFiles(deps));
  app.use('/lowongan-terbuka', ruteLowonganTerbuka(deps));
  app.use('/lamaran', ruteLamaran(deps));
  app.use('/kandidat', ruteKandidat(deps));

  app.use(notFoundHandler);
  app.use(buatErrorHandler({ log }));
  return app;
}
