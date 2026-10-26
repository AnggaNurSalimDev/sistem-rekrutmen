/**
 * Isian form soal pilihan ganda ↔ body API.
 * id opsi dibuat frontend (a, b, c, …). Saat mengubah soal, id lama
 * dipertahankan supaya kunci jawaban tidak tertukar.
 */

export const OPSI_MIN = 2;
export const OPSI_MAKS = 6;

const HURUF = 'abcdefghijklmnopqrstuvwxyz';

/** id baru yang belum dipakai: a, b, … lalu o7, o8 jika huruf habis. */
export function idOpsiBaru(dipakai) {
  const set = new Set(dipakai);
  for (const h of HURUF) if (!set.has(h)) return h;
  let i = set.size + 1;
  while (set.has(`o${i}`)) i++;
  return `o${i}`;
}

export function soalKosong() {
  return {
    pertanyaan: '',
    opsi: [
      { id: 'a', teks: '' },
      { id: 'b', teks: '' },
      { id: 'c', teks: '' },
    ],
    kunciOpsiId: '',
    poin: '1',
  };
}

export function dariSoal(s) {
  return {
    pertanyaan: s.pertanyaan,
    opsi: s.opsi.map((o) => ({ id: o.id, teks: o.teks })),
    kunciOpsiId: s.kunciOpsiId,
    poin: String(s.poin),
  };
}

export function tambahOpsi(isian) {
  if (isian.opsi.length >= OPSI_MAKS) return isian;
  return { ...isian, opsi: [...isian.opsi, { id: idOpsiBaru(isian.opsi.map((o) => o.id)), teks: '' }] };
}

export function hapusOpsi(isian, id) {
  if (isian.opsi.length <= OPSI_MIN) return isian;
  return {
    ...isian,
    opsi: isian.opsi.filter((o) => o.id !== id),
    kunciOpsiId: isian.kunciOpsiId === id ? '' : isian.kunciOpsiId,
  };
}

export function keBodySoal(isian) {
  const galat = {};
  const pertanyaan = isian.pertanyaan.trim();
  if (!pertanyaan) galat.pertanyaan = 'Tulis pertanyaannya.';
  if (pertanyaan.length > 2000) galat.pertanyaan = 'Pertanyaan maksimal 2000 karakter.';
  const opsi = isian.opsi.map((o) => ({ id: o.id, teks: o.teks.trim() }));
  if (opsi.length < OPSI_MIN || opsi.length > OPSI_MAKS) galat.opsi = `Jumlah pilihan ${OPSI_MIN}–${OPSI_MAKS}.`;
  else if (opsi.some((o) => !o.teks)) galat.opsi = 'Semua pilihan jawaban harus diisi, atau hapus yang tidak dipakai.';
  else if (new Set(opsi.map((o) => o.teks.toLowerCase())).size !== opsi.length) galat.opsi = 'Ada pilihan jawaban yang sama persis.';
  if (!opsi.some((o) => o.id === isian.kunciOpsiId)) galat.kunciOpsiId = 'Tandai satu jawaban yang benar.';
  const poin = Number(String(isian.poin).replace(',', '.'));
  if (!(poin > 0 && poin <= 100)) galat.poin = 'Poin lebih dari 0 sampai 100.';
  if (Object.keys(galat).length) return { galat, body: null };
  return { galat, body: { pertanyaan, opsi, kunciOpsiId: isian.kunciOpsiId, poin } };
}

/** Tukar posisi soal di indeks i dengan tetangganya (arah -1 naik, +1 turun). */
export function geser(daftar, i, arah) {
  const j = i + arah;
  if (i < 0 || i >= daftar.length || j < 0 || j >= daftar.length) return daftar;
  const baru = [...daftar];
  [baru[i], baru[j]] = [baru[j], baru[i]];
  return baru;
}
