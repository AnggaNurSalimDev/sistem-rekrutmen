/* Padanan backend/src/routes/soal.js. */
import { validasiSoal, soalUntukKandidat } from './mesin/scoring/soal.js';
import { konflik, idParam, tidakDitemukan, validasiGagal } from './galat.js';
import { cari, cariSemua, hapusBaris, idBaru, sekarang, tabel, tandaiBerubah } from './toko.js';
import { ambilLowonganMilik } from './lowongan.js';

function terkunci(soalId) {
  return cariSemua('jawabanKandidat', (j) => j.soal_id === soalId).length > 0;
}

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
    terkunci: terkunci(s.id),
  };
}

function ambilTesMilik(tesId, userId) {
  idParam(tesId, 'Tes');
  const t = cari('lowonganTes', (x) => x.id === tesId);
  if (!t) throw tidakDitemukan('Tes');
  const l = ambilLowonganMilik(t.lowongan_id, userId); // 404 jika bukan milik rekruter ini
  return { ...t, status_lowongan: l.status };
}

function ambilSoalMilik(soalId, userId) {
  idParam(soalId, 'Soal');
  const soal = cari('soal', (s) => s.id === soalId);
  if (!soal) throw tidakDitemukan('Soal');
  const tes = ambilTesMilik(soal.lowongan_tes_id, userId);
  return { soal, tes };
}

function tolakJikaTerkunci(soal, aksi) {
  if (terkunci(soal.id)) {
    throw konflik(`Soal sudah dijawab kandidat sehingga tidak bisa ${aksi}. Nonaktifkan soal ini dan buat soal baru jika isinya perlu diganti.`);
  }
}

function pastikanBukanSoalAktifTerakhir(soal, tes) {
  if (!soal.aktif || tes.status_lowongan !== 'buka') return;
  const n = cariSemua('soal', (s) => s.lowongan_tes_id === tes.id && s.aktif && s.id !== soal.id).length;
  if (n === 0) throw konflik(`Ini soal aktif terakhir di tes "${tes.jenis_tes}" pada lowongan yang sedang dibuka`);
}

function parseSoal(body) {
  if (typeof body?.pertanyaan !== 'string' || !body.pertanyaan.trim()) {
    throw validasiGagal('Data tidak valid', { detail: [{ field: 'pertanyaan', pesan: 'wajib diisi' }] });
  }
  if (!Array.isArray(body?.opsi) || body.opsi.length < 2 || body.opsi.length > 6) {
    throw validasiGagal('Data tidak valid', { detail: [{ field: 'opsi', pesan: 'jumlah opsi harus 2–6' }] });
  }
  return {
    pertanyaan: body.pertanyaan.trim(),
    opsi: body.opsi.map((o) => ({ id: `${o.id}`, teks: `${o.teks}`.trim() })),
    kunciOpsiId: `${body.kunciOpsiId}`,
    poin: typeof body.poin === 'number' && body.poin > 0 ? body.poin : 1,
    urutan: body.urutan,
  };
}

export const ruteSoalPerTes = {
  daftar(user, tesId) {
    const tes = ambilTesMilik(tesId, user.id);
    const data = cariSemua('soal', (s) => s.lowongan_tes_id === tes.id)
      .sort((a, b) => a.urutan - b.urutan)
      .map(tampilkanSoal);
    return { status: 200, data: { data } };
  },

  pratinjau(user, tesId) {
    const tes = ambilTesMilik(tesId, user.id);
    const soal = cariSemua('soal', (s) => s.lowongan_tes_id === tes.id).map((s) => ({
      id: s.id,
      pertanyaan: s.pertanyaan,
      opsi: s.opsi,
      kunciOpsiId: s.kunci_opsi_id,
      urutan: s.urutan,
      aktif: s.aktif,
    }));
    return { status: 200, data: { data: soalUntukKandidat(soal) } };
  },

  buat(user, tesId, body) {
    const tes = ambilTesMilik(tesId, user.id);
    const data = parseSoal(body);
    validasiSoal({ id: 'baru', ...data });
    let urutan = data.urutan;
    if (urutan === undefined) {
      const semua = cariSemua('soal', (s) => s.lowongan_tes_id === tes.id);
      urutan = semua.length ? Math.max(...semua.map((s) => s.urutan)) + 1 : 0;
    }
    const soal = { id: idBaru(), lowongan_tes_id: tes.id, pertanyaan: data.pertanyaan, opsi: data.opsi, kunci_opsi_id: data.kunciOpsiId, poin: data.poin, urutan, aktif: true, dibuat_pada: sekarang() };
    tabel('soal').push(soal);
    tandaiBerubah();
    return { status: 201, data: { data: tampilkanSoal(soal) } };
  },

  urutan(user, tesId, body) {
    const tes = ambilTesMilik(tesId, user.id);
    const diminta = Array.isArray(body?.urutan) ? body.urutan : null;
    const ada = new Set(cariSemua('soal', (s) => s.lowongan_tes_id === tes.id).map((s) => s.id));
    const set = new Set(diminta ?? []);
    const samaPersis = diminta && set.size === diminta.length && set.size === ada.size && [...ada].every((id) => set.has(id));
    if (!samaPersis) {
      throw validasiGagal('Daftar urutan harus berisi semua soal di tes ini, masing-masing tepat satu kali', { field: 'urutan' });
    }
    diminta.forEach((id, i) => {
      cari('soal', (s) => s.id === id).urutan = i;
    });
    tandaiBerubah();
    return { status: 204, data: null };
  },
};

export const ruteSoal = {
  detail(user, id) {
    const { soal } = ambilSoalMilik(id, user.id);
    return { status: 200, data: { data: tampilkanSoal(soal) } };
  },

  ubah(user, id, body) {
    const { soal } = ambilSoalMilik(id, user.id);
    tolakJikaTerkunci(soal, 'diubah');
    const data = parseSoal(body);
    validasiSoal({ id: soal.id, ...data });
    Object.assign(soal, { pertanyaan: data.pertanyaan, opsi: data.opsi, kunci_opsi_id: data.kunciOpsiId, poin: data.poin, urutan: data.urutan ?? soal.urutan, diubah_pada: sekarang() });
    tandaiBerubah();
    return { status: 200, data: { data: tampilkanSoal(soal) } };
  },

  aktif(user, id, body) {
    const { soal, tes } = ambilSoalMilik(id, user.id);
    const aktif = Boolean(body?.aktif);
    if (!aktif) pastikanBukanSoalAktifTerakhir(soal, tes);
    soal.aktif = aktif;
    soal.diubah_pada = sekarang();
    tandaiBerubah();
    return { status: 200, data: { data: tampilkanSoal(soal) } };
  },

  hapus(user, id) {
    const { soal, tes } = ambilSoalMilik(id, user.id);
    tolakJikaTerkunci(soal, 'dihapus');
    pastikanBukanSoalAktifTerakhir(soal, tes);
    hapusBaris('soal', (s) => s.id === soal.id);
    return { status: 204, data: null };
  },
};
