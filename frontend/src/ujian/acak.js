/**
 * Pengacak berbenih: urutan opsi berbeda untuk setiap kandidat, tetapi tetap
 * sama saat halaman dimuat ulang (benihnya id lamaran + id soal), tanpa
 * perlu menyimpan apa pun di browser.
 *
 * Jawaban disimpan sebagai id opsi, jadi pengacakan tidak memengaruhi penilaian.
 */

function hashTeks(teks) {
  let h = 2166136261;
  for (let i = 0; i < teks.length; i++) {
    h ^= teks.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(benih) {
  let a = benih;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates dengan benih teks. Tidak mengubah array asli. */
export function acakBerbenih(daftar, benih) {
  if (!Array.isArray(daftar)) throw new Error('daftar harus array');
  if (typeof benih !== 'string' || benih === '') throw new Error('benih harus teks tidak kosong');
  const hasil = [...daftar];
  const acak = mulberry32(hashTeks(benih));
  for (let i = hasil.length - 1; i > 0; i--) {
    const j = Math.floor(acak() * (i + 1));
    [hasil[i], hasil[j]] = [hasil[j], hasil[i]];
  }
  return hasil;
}
