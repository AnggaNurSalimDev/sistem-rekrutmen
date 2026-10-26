const BULAN = Object.freeze({
  jan: 1, januari: 1, january: 1,
  feb: 2, febr: 2, februari: 2, pebruari: 2, february: 2,
  mar: 3, maret: 3, march: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  agu: 8, agt: 8, agus: 8, agustus: 8, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10, oct: 10, october: 10,
  nov: 11, nop: 11, nopember: 11, november: 11,
  des: 12, desember: 12, dec: 12, december: 12,
});

const NAMA_BULAN = Object.keys(BULAN).sort((a, b) => b.length - a.length).join('|');

// Urutan = prioritas. Token yang tumpang tindih dengan token berprioritas
// lebih tinggi dibuang (contoh: "2022" di dalam "Januari 2022").
// "hingga kini" / "sampai sekarang" terbaca sebagai pemisah + kata "kini"/"sekarang".
const POLA = [
  { jenis: 'namaBulan', re: new RegExp(`(?<![\\p{L}])(?:\\d{1,2}\\s+)?(${NAMA_BULAN})\\.?\\s+(\\d{4})(?!\\d)`, 'giu') },
  { jenis: 'sekarang', re: /(?<![\p{L}])(saat ini|sekarang|kini|present|current(?:ly)?|now|ongoing)(?![\p{L}])/giu },
  { jenis: 'bulanAngka', re: /(?<![\d/.-])(\d{1,2})[/.-](\d{4})(?![\d/.-])/g },
  { jenis: 'iso', re: /(?<![\d/.-])(\d{4})-(\d{2})(?![\d/.-])/g },
  { jenis: 'tahun', re: /(?<!\d)((?:19|20)\d{2})(?!\d)/g },
];

const PEMISAH_RENTANG = /^\s*(?:-|–|—|~|s\/d|s\.d\.?|sd|sampai(?:\s+dengan)?|hingga|to|until)\s*$/i;

const TAHUN_MIN = 1950;

function keBulan(tahun, bulan) {
  return `${tahun}-${String(bulan).padStart(2, '0')}`;
}

/** Semua token tanggal di satu baris, tanpa tumpang tindih. */
export function cariTokenTanggal(baris, tahunMaks) {
  const token = [];
  const terpakai = [];
  const tumpangTindih = (a, b) => terpakai.some(([s, e]) => a < e && b > s);

  for (const { jenis, re } of POLA) {
    re.lastIndex = 0;
    for (const m of baris.matchAll(re)) {
      const awal = m.index;
      const akhir = m.index + m[0].length;
      if (tumpangTindih(awal, akhir)) continue;

      let nilai = null;
      if (jenis === 'namaBulan') nilai = { tahun: Number(m[2]), bulan: BULAN[m[1].toLowerCase()] };
      else if (jenis === 'bulanAngka') nilai = { tahun: Number(m[2]), bulan: Number(m[1]) };
      else if (jenis === 'iso') nilai = { tahun: Number(m[1]), bulan: Number(m[2]) };
      else if (jenis === 'tahun') nilai = { tahun: Number(m[1]), bulan: null };

      if (nilai) {
        const tahunValid = nilai.tahun >= TAHUN_MIN && nilai.tahun <= tahunMaks;
        const bulanValid = nilai.bulan === null || (nilai.bulan >= 1 && nilai.bulan <= 12);
        if (!tahunValid || !bulanValid) continue;
      }

      terpakai.push([awal, akhir]);
      token.push({ jenis, awal, akhir, ...nilai });
    }
  }
  return token.sort((a, b) => a.awal - b.awal);
}

/**
 * Rentang tanggal di satu baris: dua token yang dipisah tanda/kata rentang.
 * Tahun saja → bulan diasumsikan Januari (mulai) atau Desember (selesai),
 * dan ditandai tahunSaja supaya parser menurunkan keyakinan.
 *
 * @returns {Array<{mulai, selesai, tahunSaja, awal, akhir}>}
 */
export function cariRentangTanggal(baris, { tahunMaks }) {
  if (typeof baris !== 'string' || baris.length === 0) return [];
  if (!Number.isInteger(tahunMaks)) throw new Error('tahunMaks wajib bilangan bulat');

  const token = cariTokenTanggal(baris, tahunMaks);
  const hasil = [];

  for (let i = 0; i < token.length - 1; i++) {
    const a = token[i];
    const b = token[i + 1];
    if (a.jenis === 'sekarang') continue;
    if (!PEMISAH_RENTANG.test(baris.slice(a.akhir, b.awal))) continue;

    const mulai = keBulan(a.tahun, a.bulan ?? 1);
    const selesai = b.jenis === 'sekarang' ? null : keBulan(b.tahun, b.bulan ?? 12);
    hasil.push({
      mulai,
      selesai,
      tahunSaja: a.bulan === null || (b.jenis !== 'sekarang' && b.bulan === null),
      awal: a.awal,
      akhir: b.akhir,
    });
    i++;
  }
  return hasil;
}
