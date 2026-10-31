/* Padanan backend/src/routes/lowonganTerbuka.js — publik, tanpa login. */
import { idParam, tidakDitemukan } from './galat.js';
import { cari, cariSemua } from './toko.js';

function tampilkan(l) {
  const tes = cariSemua('lowonganTes', (t) => t.lowongan_id === l.id)
    .sort((a, b) => a.urutan - b.urutan)
    .map((t) => ({
      id: t.id,
      jenisTes: t.jenis_tes,
      jumlahSoal: cariSemua('soal', (s) => s.lowongan_tes_id === t.id && s.aktif).length,
    }));
  return {
    id: l.id,
    posisi: l.posisi,
    skillWajib: l.skill_wajib,
    skillOpsional: l.skill_opsional,
    kebutuhanWaktu: l.kebutuhan_waktu,
    dibuatPada: l.dibuat_pada,
    tes,
  };
}

export const rute = {
  daftar() {
    const data = cariSemua('lowongan', (l) => l.status === 'buka')
      .sort((a, b) => new Date(b.dibuat_pada) - new Date(a.dibuat_pada))
      .map(tampilkan);
    return { status: 200, data: { data } };
  },

  detail(id) {
    idParam(id, 'Lowongan');
    const l = cari('lowongan', (x) => x.id === id && x.status === 'buka');
    if (!l) throw tidakDitemukan('Lowongan');
    return { status: 200, data: { data: tampilkan(l) } };
  },
};
