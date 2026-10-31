/**
 * Pengecekan hasil AI terhadap teks CV asli.
 *
 * AI bisa mengarang. Penangkalnya: setiap temuan wajib membawa kutipan,
 * dan kutipan itu harus benar-benar ada di teks CV. Pencocokan memakai
 * bentuk ternormalisasi (huruf kecil, tanda baca dan baris baru dianggap
 * spasi) supaya beda penulisan kecil tidak menggagalkan kutipan yang jujur,
 * tetapi kalimat yang diparafrasekan atau dikarang tetap ditolak.
 */

const KUTIPAN_MINIMAL = 3;

/** Teks → bentuk ternormalisasi + peta indeks ke posisi asli. */
export function normalisasiDenganPeta(teks) {
  const keluaran = [];
  const peta = [];
  let terakhirSpasi = true;
  for (let i = 0; i < teks.length; i++) {
    const huruf = teks[i];
    if (/[\p{L}\p{N}]/u.test(huruf)) {
      for (const h of huruf.toLowerCase()) {
        keluaran.push(h);
        peta.push(i);
      }
      terakhirSpasi = false;
    } else if (!terakhirSpasi) {
      keluaran.push(' ');
      peta.push(i);
      terakhirSpasi = true;
    }
  }
  if (keluaran[keluaran.length - 1] === ' ') {
    keluaran.pop();
    peta.pop();
  }
  return { teks: keluaran.join(''), peta };
}

const normalisasi = (teks) => normalisasiDenganPeta(teks).teks;

/** Posisi kutipan di teks asli ({awal, akhir}) atau null jika tidak ada / terlalu pendek. */
export function cariKutipan(indeks, kutipan) {
  if (typeof kutipan !== 'string') return null;
  const dicari = normalisasi(kutipan);
  if (dicari.length < KUTIPAN_MINIMAL) return null;
  // Batas kata di kedua sisi: "art" tidak boleh cocok dengan "smart".
  let dari = 0;
  while (dari <= indeks.teks.length - dicari.length) {
    const i = indeks.teks.indexOf(dicari, dari);
    if (i < 0) return null;
    const sebelum = i === 0 || indeks.teks[i - 1] === ' ';
    const sesudah = i + dicari.length === indeks.teks.length || indeks.teks[i + dicari.length] === ' ';
    if (sebelum && sesudah) {
      return { awal: indeks.peta[i], akhir: indeks.peta[i + dicari.length - 1] + 1 };
    }
    dari = i + 1;
  }
  return null;
}

// Kalimat yang tampak ditujukan ke AI, bukan ke manusia. Tidak menolak CV,
// hanya meminta HR melihat.
const POLA_INJEKSI =
  /(abaikan|lupakan)\s+(semua\s+|seluruh\s+)?(instruksi|perintah|aturan)|ignore\s+(all\s+|any\s+|previous\s+|the\s+above\s+)*(instructions|rules)|system\s+prompt|beri(kan)?\s+(saya\s+)?(skor|nilai)\s+(100|tertinggi|maksimal)|(you\s+are|kamu\s+adalah)\s+(now\s+)?(an?\s+)?(ai|assistant|asisten)/i;

const PRIORITAS = Object.freeze({ perusahaan: 4, sertifikat: 3, ketersediaan: 3, skill: 2, lainnya: 1 });

/** Sorotan tanpa tumpang tindih, urut posisi; yang lebih penting dipertahankan. */
export function rapikanSorotan(daftar) {
  const terpilih = [];
  const urut = [...daftar].sort(
    (a, b) =>
      (PRIORITAS[b.kategori] ?? 0) - (PRIORITAS[a.kategori] ?? 0) ||
      b.akhir - b.awal - (a.akhir - a.awal) ||
      a.awal - b.awal,
  );
  for (const s of urut) {
    if (s.akhir <= s.awal) continue;
    if (terpilih.some((t) => s.awal < t.akhir && s.akhir > t.awal)) continue;
    terpilih.push(s);
  }
  return terpilih.sort((a, b) => a.awal - b.awal);
}

const tahunDari = (bulan) => (typeof bulan === 'string' ? bulan.slice(0, 4) : null);

/**
 * Hasil AI (sudah lolos skema) + teks CV → hanya temuan yang terbukti.
 *
 * Aturan:
 * - Skill / temuan lain tanpa kutipan yang ada di CV → dibuang.
 * - Riwayat kerja: kutipan harus ada, dan nama perusahaan harus tertulis di CV.
 * - Tanggal hanya dipercaya jika tahunnya terlihat di kutipan. Jika tidak,
 *   tanggal dikosongkan (entri menjadi "tanpa tanggal"), bukan ditebak.
 * - Tanggal mulai ada tapi selesai tidak disebut dan tidak "masih bekerja"
 *   → lama kerja tidak bisa dihitung → dikosongkan.
 */
export function verifikasiHasilAi(teks, hasil) {
  if (typeof teks !== 'string') throw new Error('teks CV harus berupa string');
  if (!hasil || typeof hasil !== 'object') throw new Error('hasil AI wajib ada');

  const indeks = normalisasiDenganPeta(teks);
  const alasan = [];
  const sorotan = [];
  const dibuang = [];

  const skills = [];
  for (const s of hasil.skills) {
    const posisi = cariKutipan(indeks, s.kutipan);
    if (!posisi) {
      dibuang.push(`skill "${s.nama}"`);
      continue;
    }
    skills.push({ nama: s.nama, kutipan: s.kutipan });
    sorotan.push({ ...posisi, kategori: 'skill', label: s.nama });
  }

  const temuanLain = [];
  for (const t of hasil.temuanLain) {
    const posisi = cariKutipan(indeks, t.kutipan);
    if (!posisi) {
      dibuang.push(`temuan "${t.label}"`);
      continue;
    }
    temuanLain.push({ kategori: t.kategori, label: t.label, kutipan: t.kutipan });
    sorotan.push({ ...posisi, kategori: t.kategori, label: t.label });
  }

  const riwayatKerja = [];
  let jumlahTahunSaja = 0;
  for (const r of hasil.riwayatKerja) {
    const posisiKutipan = cariKutipan(indeks, r.kutipan);
    const posisiNama = cariKutipan(indeks, r.perusahaan);
    if (!posisiKutipan || !posisiNama) {
      dibuang.push(`riwayat kerja "${r.perusahaan}"`);
      continue;
    }

    let { mulai, selesai } = r;
    const masihBekerja = r.masihBekerja === true;
    if (masihBekerja) selesai = null;

    const teksKutipan = normalisasi(r.kutipan);
    const tahunTerlihat = (bulan) => bulan === null || teksKutipan.includes(tahunDari(bulan));
    if (mulai !== null && (!tahunTerlihat(mulai) || !tahunTerlihat(selesai))) {
      alasan.push(`Tanggal kerja di "${r.perusahaan}" tidak terlihat di kutipan CV; tanggal dikosongkan.`);
      mulai = null;
      selesai = null;
    } else if (mulai !== null && selesai === null && !masihBekerja) {
      alasan.push(`Tanggal selesai di "${r.perusahaan}" tidak disebut; lama kerja tidak dihitung.`);
      mulai = null;
    } else if (mulai === null) {
      selesai = null;
    }
    if (mulai !== null && r.hanyaTahun) jumlahTahunSaja++;

    // Sorot nama perusahaan di dalam kutipannya jika ada di sana.
    const potongan = teks.slice(posisiKutipan.awal, posisiKutipan.akhir);
    const diKutipan = cariKutipan(normalisasiDenganPeta(potongan), r.perusahaan);
    const posisi = diKutipan
      ? { awal: posisiKutipan.awal + diKutipan.awal, akhir: posisiKutipan.awal + diKutipan.akhir }
      : posisiNama;
    sorotan.push({ ...posisi, kategori: 'perusahaan', label: r.perusahaan });

    riwayatKerja.push({
      perusahaan: r.perusahaan,
      jabatan: r.jabatan,
      mulai,
      selesai,
      masihBekerja,
      kutipan: r.kutipan,
    });
  }

  if (dibuang.length > 0) {
    alasan.push(`${dibuang.length} temuan AI dibuang karena kutipannya tidak ada di CV: ${dibuang.join(', ')}.`);
  }
  if (jumlahTahunSaja > 0) {
    alasan.push(`${jumlahTahunSaja} rentang kerja hanya menyebut tahun; bulan diasumsikan Januari–Desember.`);
  }
  if (POLA_INJEKSI.test(teks)) {
    alasan.push('CV memuat kalimat yang tampak seperti perintah untuk AI. Periksa CV secara manual.');
  }

  return { skills, riwayatKerja, temuanLain, sorotan: rapikanSorotan(sorotan), alasanTinjau: alasan };
}
