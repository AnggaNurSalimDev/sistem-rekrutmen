import { pastikan } from './errors.js';
import { FLAG, TENURE } from './constants.js';

/**
 * Rata-rata bulan per perusahaan → skor 0 / 50 / 100.
 *
 * Guard jumlahPerusahaan = 0 WAJIB di depan pembagian:
 * 0 / 0 = NaN, dan NaN gagal di semua perbandingan sehingga
 * tanpa guard akan jatuh ke cabang terakhir (skor 100).
 */
export function hitungSkorTenure({ totalBulan, jumlahPerusahaan }) {
  pastikan(Number.isInteger(totalBulan) && totalBulan >= 0, 'totalBulan harus bilangan bulat ≥ 0', 'totalBulan');
  pastikan(
    Number.isInteger(jumlahPerusahaan) && jumlahPerusahaan >= 0,
    'jumlahPerusahaan harus bilangan bulat ≥ 0',
    'jumlahPerusahaan',
  );

  if (jumlahPerusahaan === 0) {
    return {
      skor: TENURE.skorTanpaRiwayat,
      rataRataBulan: null,
      flags: [FLAG.TANPA_RIWAYAT_KERJA],
    };
  }

  const rataRataBulan = totalBulan / jumlahPerusahaan;

  let skor;
  if (rataRataBulan < TENURE.batasBawahBulan) skor = 0;
  else if (rataRataBulan <= TENURE.batasAtasBulan) skor = 50;
  else skor = 100;

  return { skor, rataRataBulan, flags: [] };
}
