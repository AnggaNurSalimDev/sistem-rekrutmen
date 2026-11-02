/* Padanan backend/src/routes/lowongan.js. */
import { validasiLowongan } from './mesin/scoring/validasi.js';
import { validasiSoal } from './mesin/scoring/soal.js';
import { idParam, konflik, tidakDitemukan, validasiGagal } from './galat.js';
import { hitungUlangSkor } from './skor.js';
import { cari, cariSemua, hapusBaris, idBaru, sekarang, tabel, tandaiBerubah } from './toko.js';

function teksWajib(nilai, field, maks) {
  const t = typeof nilai === 'string' ? nilai.trim() : '';
  if (!t || t.length > maks) throw validasiGagal('Data tidak valid', { detail: [{ field, pesan: `${field} tidak valid` }] });
  return t;
}

function parseLowongan(body, { tesWajib }) {
  const d = {
    posisi: teksWajib(body?.posisi, 'posisi', 120),
    budgetMaksimal: body?.budgetMaksimal,
    skillWajib: Array.isArray(body?.skillWajib) ? body.skillWajib.map((s) => `${s}`.trim()).filter(Boolean) : [],
    skillOpsional: Array.isArray(body?.skillOpsional) ? body.skillOpsional.map((s) => `${s}`.trim()).filter(Boolean) : [],
    kebutuhanWaktu: teksWajib(body?.kebutuhanWaktu, 'kebutuhanWaktu', 300),
    kataKunciSorot: body?.kataKunciSorot === undefined ? undefined : Array.isArray(body.kataKunciSorot) ? body.kataKunciSorot.map((s) => `${s}`.trim()).filter(Boolean) : [],
  };
  if (!Number.isInteger(d.budgetMaksimal) || d.budgetMaksimal <= 0) {
    throw validasiGagal('Data tidak valid', { detail: [{ field: 'budgetMaksimal', pesan: 'budgetMaksimal harus bilangan bulat positif' }] });
  }
  if (d.skillWajib.length === 0) {
    throw validasiGagal('Data tidak valid', { detail: [{ field: 'skillWajib', pesan: 'minimal 1 skill wajib' }] });
  }
  if (body?.tes !== undefined) {
    if (!Array.isArray(body.tes) || body.tes.length === 0) {
      throw validasiGagal('Data tidak valid', { detail: [{ field: 'tes', pesan: 'minimal 1 tes' }] });
    }
    d.tes = body.tes.map((t) => ({
      id: t.id,
      jenisTes: teksWajib(t.jenisTes, 'tes.jenisTes', 60),
      targetSkor: t.targetSkor,
      batasBawah: t.batasBawah,
      bobot: t.bobot,
    }));
  } else if (tesWajib) {
    throw validasiGagal('Data tidak valid', { detail: [{ field: 'tes', pesan: 'wajib diisi' }] });
  }
  return d;
}

function validasiDomain(data) {
  const nama = data.tes.map((t) => t.jenisTes.toLowerCase());
  const ganda = nama.find((n, i) => nama.indexOf(n) !== i);
  if (ganda) throw validasiGagal(`Nama tes "${ganda}" dipakai lebih dari sekali`, { field: 'tes' });
  validasiLowongan({
    budgetMaksimal: data.budgetMaksimal,
    skillWajib: data.skillWajib,
    tes: data.tes.map((t, i) => ({ ...t, id: t.id ?? `baru-${i}` })),
  });
}

function tampilkanTes(t) {
  return {
    id: t.id,
    jenisTes: t.jenis_tes,
    targetSkor: t.target_skor,
    batasBawah: t.batas_bawah,
    bobot: t.bobot,
    urutan: t.urutan,
    jumlahSoal: cariSemua('soal', (s) => s.lowongan_tes_id === t.id).length,
    jumlahSoalAktif: cariSemua('soal', (s) => s.lowongan_tes_id === t.id && s.aktif).length,
  };
}

function tampilkanLowongan(l, { denganTes = false } = {}) {
  const out = {
    id: l.id,
    posisi: l.posisi,
    budgetMaksimal: l.budget_maksimal,
    skillWajib: l.skill_wajib,
    skillOpsional: l.skill_opsional,
    kebutuhanWaktu: l.kebutuhan_waktu,
    kataKunciSorot: l.kata_kunci_sorot,
    status: l.status,
    jumlahPelamar: cariSemua('kandidat', (k) => k.lowongan_id === l.id).length,
    dibuatPada: l.dibuat_pada,
    diubahPada: l.diubah_pada,
  };
  if (denganTes) {
    out.tes = cariSemua('lowonganTes', (t) => t.lowongan_id === l.id)
      .sort((a, b) => a.urutan - b.urutan || a.jenis_tes.localeCompare(b.jenis_tes))
      .map(tampilkanTes);
  }
  return out;
}

export function ambilLowonganMilik(id, userId) {
  idParam(id, 'Lowongan');
  const l = cari('lowongan', (x) => x.id === id && x.dibuat_oleh === userId);
  if (!l) throw tidakDitemukan('Lowongan');
  return l;
}

function simpanTes(lowonganId, daftarTes) {
  const lama = cariSemua('lowonganTes', (t) => t.lowongan_id === lowonganId);
  const lamaPerId = new Map(lama.map((t) => [t.id, t]));
  for (const t of daftarTes) {
    if (t.id && !lamaPerId.has(t.id)) throw validasiGagal(`Tes ${t.id} bukan bagian dari lowongan ini`, { field: 'tes' });
  }
  const dipertahankan = new Set(daftarTes.filter((t) => t.id).map((t) => t.id));
  const dihapus = lama.filter((t) => !dipertahankan.has(t.id));
  const masihPunyaSoal = dihapus.filter((t) => cariSemua('soal', (s) => s.lowongan_tes_id === t.id).length > 0);
  if (masihPunyaSoal.length > 0) {
    throw konflik(`Tes ${masihPunyaSoal.map((t) => `"${t.jenis_tes}"`).join(', ')} masih punya soal. Hapus soalnya dulu.`);
  }
  for (const t of dihapus) hapusBaris('lowonganTes', (x) => x.id === t.id);

  daftarTes.forEach((t, urutan) => {
    if (t.id) {
      const baris = lamaPerId.get(t.id);
      Object.assign(baris, { jenis_tes: t.jenisTes, target_skor: t.targetSkor, batas_bawah: t.batasBawah, bobot: t.bobot, urutan });
    } else {
      tabel('lowonganTes').push({
        id: idBaru(),
        lowongan_id: lowonganId,
        jenis_tes: t.jenisTes,
        target_skor: t.targetSkor,
        batas_bawah: t.batasBawah,
        bobot: t.bobot,
        urutan,
      });
    }
  });
  tandaiBerubah();
}

function pastikanBisaDibuka(l) {
  const tes = cariSemua('lowonganTes', (t) => t.lowongan_id === l.id);
  validasiLowongan({
    budgetMaksimal: l.budget_maksimal,
    skillWajib: l.skill_wajib,
    tes: tes.map((t) => ({ id: t.id, jenisTes: t.jenis_tes, targetSkor: t.target_skor, batasBawah: t.batas_bawah, bobot: t.bobot })),
  });
  const tanpaSoal = tes.filter((t) => cariSemua('soal', (s) => s.lowongan_tes_id === t.id && s.aktif).length === 0);
  if (tanpaSoal.length > 0) {
    throw konflik(`Lowongan belum bisa dibuka. Tes tanpa soal aktif: ${tanpaSoal.map((t) => `"${t.jenis_tes}"`).join(', ')}`);
  }
  for (const s of cariSemua('soal', (s) => tes.some((t) => t.id === s.lowongan_tes_id) && s.aktif)) {
    validasiSoal({ id: s.id, pertanyaan: s.pertanyaan, opsi: s.opsi, kunciOpsiId: s.kunci_opsi_id, poin: s.poin });
  }
}

export const rute = {
  daftar(user) {
    const data = cariSemua('lowongan', (l) => l.dibuat_oleh === user.id)
      .sort((a, b) => new Date(b.dibuat_pada) - new Date(a.dibuat_pada))
      .map((l) => tampilkanLowongan(l));
    return { status: 200, data: { data } };
  },

  buat(user, body) {
    const data = parseLowongan(body, { tesWajib: true });
    validasiDomain(data);
    const l = {
      id: idBaru(),
      dibuat_oleh: user.id,
      posisi: data.posisi,
      budget_maksimal: data.budgetMaksimal,
      skill_wajib: data.skillWajib,
      skill_opsional: data.skillOpsional,
      kebutuhan_waktu: data.kebutuhanWaktu,
      kata_kunci_sorot: data.kataKunciSorot ?? [],
      status: 'draf',
      dibuat_pada: sekarang(),
      diubah_pada: sekarang(),
    };
    tabel('lowongan').push(l);
    tandaiBerubah();
    simpanTes(l.id, data.tes);
    return { status: 201, data: { data: tampilkanLowongan(l, { denganTes: true }) } };
  },

  detail(user, id) {
    return { status: 200, data: { data: tampilkanLowongan(ambilLowonganMilik(id, user.id), { denganTes: true }) } };
  },

  ubah(user, id, body) {
    const l = ambilLowonganMilik(id, user.id);
    const data = parseLowongan(body, { tesWajib: false });
    if (data.tes) {
      if (l.status !== 'draf') throw konflik('Konfigurasi tes hanya bisa diubah saat lowongan berstatus draf');
      validasiDomain(data);
    } else {
      const tes = cariSemua('lowonganTes', (t) => t.lowongan_id === l.id);
      validasiDomain({ ...data, tes: tes.map((t) => ({ id: t.id, jenisTes: t.jenis_tes, targetSkor: t.target_skor, batasBawah: t.batas_bawah, bobot: t.bobot })) });
    }
    Object.assign(l, {
      posisi: data.posisi,
      budget_maksimal: data.budgetMaksimal,
      skill_wajib: data.skillWajib,
      skill_opsional: data.skillOpsional,
      kebutuhan_waktu: data.kebutuhanWaktu,
      kata_kunci_sorot: data.kataKunciSorot ?? l.kata_kunci_sorot,
      diubah_pada: sekarang(),
    });
    if (data.tes) simpanTes(l.id, data.tes);
    tandaiBerubah();
    for (const k of cariSemua('kandidat', (k) => k.lowongan_id === l.id)) hitungUlangSkor(k.id);
    return { status: 200, data: { data: tampilkanLowongan(l, { denganTes: true }) } };
  },

  ubahStatus(user, id, body) {
    const l = ambilLowonganMilik(id, user.id);
    const status = body?.status;
    if (!['draf', 'buka', 'tutup'].includes(status)) {
      throw validasiGagal('Data tidak valid', { detail: [{ field: 'status', pesan: 'status tidak dikenal' }] });
    }
    if (status !== l.status) {
      if (status === 'buka') pastikanBisaDibuka(l);
      if (status === 'tutup' && l.status !== 'buka') throw konflik('Hanya lowongan yang sedang dibuka yang bisa ditutup');
      const jumlahPelamar = cariSemua('kandidat', (k) => k.lowongan_id === l.id).length;
      if (status === 'draf' && jumlahPelamar > 0) throw konflik('Lowongan yang sudah punya pelamar tidak bisa dikembalikan ke draf');
      l.status = status;
      l.diubah_pada = sekarang();
      tandaiBerubah();
    }
    return { status: 200, data: { data: tampilkanLowongan(l, { denganTes: true }) } };
  },

  hapus(user, id) {
    const l = ambilLowonganMilik(id, user.id);
    if (cariSemua('kandidat', (k) => k.lowongan_id === l.id).length > 0) {
      throw konflik('Lowongan yang sudah punya pelamar tidak bisa dihapus. Tutup lowongan sebagai gantinya.');
    }
    for (const t of cariSemua('lowonganTes', (t) => t.lowongan_id === l.id)) {
      hapusBaris('soal', (s) => s.lowongan_tes_id === t.id);
    }
    hapusBaris('lowonganTes', (t) => t.lowongan_id === l.id);
    hapusBaris('lowongan', (x) => x.id === l.id);
    return { status: 204, data: null };
  },
};

export { tampilkanLowongan };
