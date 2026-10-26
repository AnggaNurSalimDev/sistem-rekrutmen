import { Router } from 'express';
import { tidakDitemukan } from '../http/errors.js';

const TIPE_KONTEN = { pdf: 'application/pdf' };

/** GET /files/<kunci>?exp=..&sig=.. — satu-satunya jalan membaca berkas. */
export function ruteFiles({ storage }) {
  const r = Router();

  r.get(/^\/(.+)$/, async (req, res) => {
    const kunci = req.params[0];
    const isi = await storage.bacaJikaSah(kunci, req.query.exp, req.query.sig);
    if (!isi) throw tidakDitemukan('Berkas');

    const ekstensi = kunci.split('.').pop();
    res.set({
      'Content-Type': TIPE_KONTEN[ekstensi] ?? 'application/octet-stream',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    });
    res.send(isi);
  });

  return r;
}
