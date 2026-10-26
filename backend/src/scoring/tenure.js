import { pastikan } from './errors.js';
import { FLAG, TENURE } from './constants.js';

const bilanganBulatNonNegatif = (n) => Number.isInteger(n) && n >= 0;

/**
 * Rata-rata bulan per perusahaan (hanya entri bertanggal) → skor 0 / 50 / 100.
 *
 * Tanpa satu pun entri bertanggal, skor = 50 (netral: tidak ada bukti ke arah
 * mana pun), dengan flag yang membedakan dua kasus:
 * - tanpa_riwayat_kerja: CV memang tidak menyebut tempat kerja (fresh graduate).
 * - lama_kerja_tidak_disebut: CV menyebut tempat kerja, tapi tanpa tanggal.
 *
 * Guard jumlahPerusahaan = 0 WAJIB di depan pembagian:
 * 0 / 0 = NaN, dan NaN gagal di semua perbandingan sehingga
 * tanpa guard akan jatuh ke cabang terakhir (skor 100).
 */
export function hitungSkorTenure({ totalBulan, jumlahPerusahaan, jumlahTanpaTanggal = 0 }) {
  pastikan(bilanganBulatNonNegatif(totalBulan), 'totalBulan harus bilangan bulat ≥ 0', 'totalBulan');
  pastikan(bilanganBulatNonNegatif(jumlahPerusahaan), 'jumlahPerusahaan harus bilangan bulat ≥ 0', 'jumlahPerusahaan');
  pastikan(
    bilanganBulatNonNegatif(jumlahTanpaTanggal),
    'jumlahTanpaTanggal harus bilangan bulat ≥ 0',
    'jumlahTanpaTanggal',
  );

  const flagTanpaTanggal = jumlahTanpaTanggal > 0 ? [FLAG.LAMA_KERJA_TIDAK_DISEBUT] : [];

  if (jumlahPerusahaan === 0) {
    return {
      skor: TENURE.skorTanpaRiwayat,
      rataRataBulan: null,
      flags: jumlahTanpaTanggal > 0 ? flagTanpaTanggal : [FLAG.TANPA_RIWAYAT_KERJA],
    };
  }

  const rataRataBulan = totalBulan / jumlahPerusahaan;

  let skor;
  if (rataRataBulan < TENURE.batasBawahBulan) skor = 0;
  else if (rataRataBulan <= TENURE.batasAtasBulan) skor = 50;
  else skor = 100;

  return { skor, rataRataBulan, flags: flagTanpaTanggal };
}
