import { normalisasiSkill } from '../../scoring/skills.js';
import teknologiPerkantoran from './teknologiPerkantoran.js';
import kruOutlet from './kruOutlet.js';

export const KATEGORI_KATA_KUNCI = Object.freeze(['sertifikat', 'ketersediaan', 'jabatan']);

const POLA_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function teksTerisi(v) {
  return typeof v === 'string' && v.trim() !== '';
}

/**
 * Cek bentuk satu paket. Dipanggil saat modul dimuat untuk paket bawaan
 * (gagal cepat saat server start), dan nanti untuk paket buatan klien.
 * Mengembalikan daftar masalah; kosong = valid.
 */
export function periksaPaket(paket) {
  const masalah = [];
  const tambah = (m) => masalah.push(`Paket ${paket?.id ?? '(tanpa id)'}: ${m}`);

  if (!paket || typeof paket !== 'object') return ['Paket harus berupa object'];
  if (!POLA_ID.test(paket.id ?? '')) tambah('id harus huruf kecil/angka dengan tanda hubung');
  if (!teksTerisi(paket.nama)) tambah('nama wajib diisi');
  if (!Array.isArray(paket.skill) || paket.skill.length === 0) tambah('skill minimal 1');

  const kunciTerpakai = new Map();
  for (const s of paket.skill ?? []) {
    if (!teksTerisi(s?.nama)) {
      tambah('setiap skill wajib punya nama');
      continue;
    }
    for (const teks of [s.nama, ...(s.alias ?? [])]) {
      const kunci = normalisasiSkill(teks);
      if (!kunci) {
        tambah(`"${teks}" kosong setelah dinormalisasi`);
        continue;
      }
      // Singkatan pendek harus lewat "persis", supaya aturan skill pendek
      // (wajib sama persis dengan nama tampilan) tidak membuatnya mati.
      if (kunci.length <= 2 && teks !== s.nama) tambah(`alias "${teks}" terlalu pendek; pindahkan ke "persis"`);
      const pemilik = kunciTerpakai.get(kunci);
      if (pemilik && pemilik !== s.nama) tambah(`"${teks}" dipakai oleh dua skill ("${pemilik}" dan "${s.nama}")`);
      kunciTerpakai.set(kunci, s.nama);
    }
    for (const p of s.persis ?? []) {
      if (!teksTerisi(p)) tambah(`persis pada "${s.nama}" tidak boleh kosong`);
    }
  }

  for (const p of paket.penandaPerusahaan ?? []) {
    if (!teksTerisi(p)) tambah('penandaPerusahaan tidak boleh berisi teks kosong');
  }

  for (const k of paket.kataKunci ?? []) {
    if (!teksTerisi(k?.label)) tambah('setiap kataKunci wajib punya label');
    if (!KATEGORI_KATA_KUNCI.includes(k?.kategori)) tambah(`kategori "${k?.kategori}" tidak dikenal`);
    if (!Array.isArray(k?.pola) || k.pola.length === 0) tambah(`kataKunci "${k?.label}" butuh minimal 1 pola`);
    for (const pola of k?.pola ?? []) {
      try {
        const re = new RegExp(pola, 'giu');
        if (re.test('')) tambah(`pola "${pola}" cocok dengan teks kosong`);
      } catch (err) {
        tambah(`pola "${pola}" bukan regex valid: ${err.message}`);
      }
    }
  }
  return masalah;
}

const BAWAAN = [teknologiPerkantoran, kruOutlet];

const masalahBawaan = BAWAAN.flatMap(periksaPaket);
const idGanda = BAWAAN.map((p) => p.id).filter((id, i, a) => a.indexOf(id) !== i);
if (idGanda.length > 0) masalahBawaan.push(`id paket ganda: ${idGanda.join(', ')}`);
if (masalahBawaan.length > 0) {
  throw new Error(`Paket kamus bawaan tidak valid:\n- ${masalahBawaan.join('\n- ')}`);
}

const PETA_PAKET = new Map(BAWAAN.map((p) => [p.id, Object.freeze(p)]));

export function daftarPaket() {
  return [...PETA_PAKET.values()];
}

export function paketAda(id) {
  return PETA_PAKET.has(id);
}

/** id → paket. id tidak dikenal → error (dicegah lebih awal oleh validasi lowongan). */
export function ambilPaket(daftarId) {
  if (!Array.isArray(daftarId)) throw new Error('daftar paket harus berupa array');
  return daftarId.map((id) => {
    const paket = PETA_PAKET.get(id);
    if (!paket) throw new Error(`Paket kamus tidak dikenal: ${id}`);
    return paket;
  });
}
