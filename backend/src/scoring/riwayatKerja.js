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
 * Riwayat kerja mentah dari LLM → total bulan & jumlah perusahaan.
 *
 * Aturan:
 * - Durasi dihitung inklusif: 2024-01 s.d. 2024-06 = 6 bulan.
 * - selesai = null berarti masih bekerja; dihitung sampai bulan lamaran.
 * - Entri dibuang (flag riwayat_tidak_valid) jika: nama perusahaan kosong,
 *   tanggal tidak terbaca, selesai < mulai, atau mulai setelah bulan lamaran.
 * - Perusahaan yang sama (beda penulisan huruf/spasi) dihitung satu kali.
 *
 * @param {Array} riwayat
 * @param {string} tanggalLamaran format "YYYY-MM-DD"
 */
export function hitungRiwayatKerja(riwayat, tanggalLamaran) {
  pastikan(Array.isArray(riwayat), 'riwayatKerja harus berupa array', 'riwayatKerja');
  const bulanLamaran = indeksBulanDariTanggal(tanggalLamaran);
  pastikan(bulanLamaran !== null, 'tanggalLamaran harus berformat YYYY-MM-DD', 'tanggalLamaran');

  let totalBulan = 0;
  const perusahaan = new Set();
  const entriDibuang = [];

  riwayat.forEach((entri, indeks) => {
    const nama = normalisasiNamaPerusahaan(entri?.perusahaan);
    const mulai = keIndeksBulan(entri?.mulai);
    const selesai = entri?.selesai === null ? bulanLamaran : keIndeksBulan(entri?.selesai);

    let alasan = null;
    if (nama === null) alasan = 'nama perusahaan kosong';
    else if (mulai === null) alasan = 'tanggal mulai tidak terbaca';
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

  return {
    totalBulan,
    jumlahPerusahaan: perusahaan.size,
    entriDibuang,
    flags: entriDibuang.length > 0 ? [FLAG.RIWAYAT_TIDAK_VALID] : [],
  };
}
