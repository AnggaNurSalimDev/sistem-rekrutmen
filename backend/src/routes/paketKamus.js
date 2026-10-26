import { Router } from 'express';
import { tidakDitemukan } from '../http/errors.js';
import { requireRole } from '../auth/middleware.js';
import { daftarPaket } from '../cv/paket/index.js';

const ringkas = (p) => ({
  id: p.id,
  nama: p.nama,
  deskripsi: p.deskripsi ?? '',
  jumlahSkill: p.skill.length,
  jumlahKataKunci: (p.kataKunci ?? []).length,
});

/**
 * Paket kamus parser CV. Isi lengkap ditampilkan supaya HR tahu persis
 * apa yang dicari regex (transparansi: tidak ada aturan tersembunyi).
 */
export function rutePaketKamus({ requireAuth }) {
  const r = Router();
  r.use(requireAuth, requireRole('rekruter'));

  r.get('/', (_req, res) => {
    res.json({ data: daftarPaket().map(ringkas) });
  });

  r.get('/:id', (req, res) => {
    const paket = daftarPaket().find((p) => p.id === req.params.id);
    if (!paket) throw tidakDitemukan('Paket kamus');
    res.json({
      data: {
        ...ringkas(paket),
        skill: paket.skill.map((s) => ({ nama: s.nama, alias: s.alias ?? [], persis: s.persis ?? [] })),
        penandaPerusahaan: paket.penandaPerusahaan ?? [],
        kataKunci: (paket.kataKunci ?? []).map((k) => ({ label: k.label, kategori: k.kategori })),
      },
    });
  });

  return r;
}
