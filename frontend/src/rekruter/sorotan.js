/**
 * Membagi teks CV menjadi potongan untuk ditampilkan dengan sorotan.
 *
 * Dua sumber sorotan:
 * 1. Sorotan dari server (hasil parser AI yang kutipannya sudah diverifikasi):
 *    [{ awal, akhir, kategori, label }], posisi karakter di `teks`.
 * 2. Kata kunci yang dicari rekruter (dari lowongan + kotak cari). Dicari di
 *    browser, tanpa membedakan huruf besar, dan hanya cocok sebagai kata utuh
 *    ("SIM" tidak cocok di dalam "SIMPAN").
 *
 * Keduanya boleh tumpang tindih. Hasilnya potongan berurutan yang menutup
 * seluruh teks tanpa celah: [{ teks, awal, akhir, ai: {kategori,label}|null, kata: string[] }].
 * Fungsi murni, supaya bisa diuji tanpa browser.
 */

const HURUF = /[\p{L}\p{N}]/u;

/** Daftar kata kunci yang rapi: trim, tanpa kosong, tanpa dobel (tanpa beda huruf besar). */
export function rapikanKataKunci(daftar) {
  if (!Array.isArray(daftar)) return [];
  const unik = new Map();
  for (const k of daftar) {
    if (typeof k !== 'string') continue;
    const bersih = k.trim().replace(/\s+/g, ' ');
    if (bersih.length === 0 || bersih.length > 100) continue;
    if (!unik.has(bersih.toLowerCase())) unik.set(bersih.toLowerCase(), bersih);
  }
  return [...unik.values()];
}

/**
 * Semua posisi kata kunci di teks. Spasi di kata kunci cocok dengan spasi
 * apa pun di teks (CV hasil ekstrak PDF sering memecah baris di tengah frasa).
 */
export function cariKataKunci(teks, kataKunci) {
  if (typeof teks !== 'string') throw new Error('teks harus string');
  const hasil = [];
  for (const kata of rapikanKataKunci(kataKunci)) {
    const pola = kata
      .split(' ')
      .map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s+');
    const re = new RegExp(pola, 'giu');
    let m;
    while ((m = re.exec(teks)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      const awal = m.index;
      const akhir = awal + m[0].length;
      const sebelum = awal > 0 ? teks[awal - 1] : '';
      const sesudah = akhir < teks.length ? teks[akhir] : '';
      // Batas kata hanya diperiksa jika ujung kata kunci sendiri berupa huruf/angka.
      const batasKiri = !HURUF.test(kata[0]) || !HURUF.test(sebelum);
      const batasKanan = !HURUF.test(kata.at(-1)) || !HURUF.test(sesudah);
      if (batasKiri && batasKanan) hasil.push({ awal, akhir, kata });
    }
  }
  return hasil;
}

/** Jumlah kemunculan setiap kata kunci (yang tidak ditemukan bernilai 0). */
export function hitungKataKunci(teks, kataKunci) {
  const jumlah = Object.fromEntries(rapikanKataKunci(kataKunci).map((k) => [k, 0]));
  for (const t of cariKataKunci(teks, kataKunci)) jumlah[t.kata]++;
  return jumlah;
}

function sorotanAiSah(sorotan, panjang) {
  if (!Array.isArray(sorotan)) return [];
  return sorotan.filter(
    (s) =>
      s &&
      Number.isInteger(s.awal) &&
      Number.isInteger(s.akhir) &&
      s.awal >= 0 &&
      s.akhir <= panjang &&
      s.akhir > s.awal,
  );
}

export function bagiSegmen(teks, sorotanAi = [], kataKunci = []) {
  if (typeof teks !== 'string') throw new Error('teks harus string');
  if (teks.length === 0) return [];

  const ai = sorotanAiSah(sorotanAi, teks.length);
  const kata = cariKataKunci(teks, kataKunci);

  const titik = new Set([0, teks.length]);
  for (const s of [...ai, ...kata]) {
    titik.add(s.awal);
    titik.add(s.akhir);
  }
  const urut = [...titik].sort((a, b) => a - b);

  const segmen = [];
  for (let i = 0; i < urut.length - 1; i++) {
    const awal = urut[i];
    const akhir = urut[i + 1];
    // Sorotan server sudah dirapikan tanpa tumpang tindih; jika ternyata ada, yang pertama dipakai.
    const s = ai.find((x) => x.awal <= awal && x.akhir >= akhir);
    const k = [...new Set(kata.filter((x) => x.awal <= awal && x.akhir >= akhir).map((x) => x.kata))];
    const baru = { teks: teks.slice(awal, akhir), awal, akhir, ai: s ? { kategori: s.kategori, label: s.label } : null, kata: k };
    const sebelum = segmen.at(-1);
    // Gabungkan potongan bersebelahan yang tandanya sama supaya DOM tidak terlalu pecah.
    if (sebelum && sebelum.ai === null && baru.ai === null && sebelum.kata.length === 0 && baru.kata.length === 0) {
      sebelum.teks += baru.teks;
      sebelum.akhir = akhir;
    } else {
      segmen.push(baru);
    }
  }
  return segmen;
}
