import { pastikan } from './errors.js';
import { FLAG } from './constants.js';

const POLA_BULAN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const POLA_TANGGAL = /^(\d{4})-(0[1-9]|1[0-2])-\d{2}$/;

/** "2024-03" → 2024*12 + 2. Mengembalikan null jika format tidak valid. */
export function keIndeksBulan(teks) {
  if (typeof teks !== 'string') return null;
  const cocok = POLA_BULAN.exec(teks.trim());
  if (!cocok) return null;
  return Number(cocok[1]) * 12 + (Number(cocok[2]) - 1);
}

function indeksBulanDariTanggal(tanggal) {
  const cocok = POLA_TANGGAL.exec(tanggal);
  if (!cocok) return null;
  return Number(cocok[1]) * 12 + (Number(cocok[2]) - 1);
}

function normalisasiNamaPerusahaan(nama) {
  if (typeof nama !== 'string') return null;
  const bersih = nama.toLowerCase().replace(/\s+/g, ' ').trim();
  return bersih === '' ? null : bersih;
}

/**
 * Riwayat kerja → total bulan & jumlah perusahaan.
 *
 * Tiga jenis entri:
 * - Bertanggal: mulai "YYYY-MM", selesai "YYYY-MM" atau null (masih bekerja,
 *   dihitung sampai bulan lamaran). Durasi inklusif: 2024-01 s.d. 2024-06 = 6 bulan.
 * - Tanpa tanggal: mulai === null. CV menyebut tempat kerja tetapi tidak
 *   menyebut kapan. Tidak dibuang dan tidak ditebak; dihitung terpisah
 *   (jumlahTanpaTanggal) dan diberi flag lama_kerja_tidak_disebut.
 * - Tidak valid (dibuang + flag riwayat_tidak_valid): nama perusahaan kosong,
 *   tanggal berformat salah, selesai < mulai, atau mulai setelah bulan lamaran.
 *
 * Perusahaan yang sama (beda penulisan huruf/spasi) dihitung satu kali.
 *
 * @param {Array} riwayat [{perusahaan, mulai: string|null, selesai: string|null}]
 * @param {string} tanggalLamaran format "YYYY-MM-DD"
 */
export function hitungRiwayatKerja(riwayat, tanggalLamaran) {
  pastikan(Array.isArray(riwayat), 'riwayatKerja harus berupa array', 'riwayatKerja');
  const bulanLamaran = indeksBulanDariTanggal(tanggalLamaran);
  pastikan(bulanLamaran !== null, 'tanggalLamaran harus berformat YYYY-MM-DD', 'tanggalLamaran');

  let totalBulan = 0;
  const perusahaan = new Set();
  const perusahaanTanpaTanggal = new Set();
  const entriDibuang = [];

  riwayat.forEach((entri, indeks) => {
    const nama = normalisasiNamaPerusahaan(entri?.perusahaan);
    if (nama === null) {
      entriDibuang.push({ indeks, alasan: 'nama perusahaan kosong' });
      return;
    }

    if (entri.mulai === null) {
      perusahaanTanpaTanggal.add(nama);
      return;
    }

    const mulai = keIndeksBulan(entri.mulai);
    const selesai = entri.selesai === null ? bulanLamaran : keIndeksBulan(entri.selesai);

    let alasan = null;
    if (mulai === null) alasan = 'tanggal mulai tidak terbaca';
    else if (selesai === null) alasan = 'tanggal selesai tidak terbaca';
    else if (mulai > bulanLamaran) alasan = 'tanggal mulai setelah tanggal lamaran';
    else if (selesai < mulai) alasan = 'tanggal selesai sebelum tanggal mulai';

    if (alasan) {
      entriDibuang.push({ indeks, alasan });
      return;
    }

    totalBulan += selesai - mulai + 1;
    perusahaan.add(nama);
  });

  // Perusahaan yang punya entri bertanggal tidak dihitung lagi sebagai "tanpa tanggal".
  for (const nama of perusahaan) perusahaanTanpaTanggal.delete(nama);

  const flags = [];
  if (entriDibuang.length > 0) flags.push(FLAG.RIWAYAT_TIDAK_VALID);
  if (perusahaanTanpaTanggal.size > 0) flags.push(FLAG.LAMA_KERJA_TIDAK_DISEBUT);

  return {
    totalBulan,
    jumlahPerusahaan: perusahaan.size,
    jumlahTanpaTanggal: perusahaanTanpaTanggal.size,
    entriDibuang,
    flags,
  };
}
