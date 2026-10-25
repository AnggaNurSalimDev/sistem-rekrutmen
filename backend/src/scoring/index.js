import { pastikan } from './errors.js';
import { BOBOT_KOMPONEN, FLAG } from './constants.js';
import { bulatkan } from './util.js';
import { validasiLowongan } from './validasi.js';
import { hitungSkorCv } from './cv.js';
import { hitungRiwayatKerja } from './riwayatKerja.js';
import { hitungSkorTenure } from './tenure.js';
import { hitungSkorTes } from './tes.js';
import { hitungSkorAnggaran, hitungSkorWaktu } from './anggaranWaktu.js';

export { ScoringInputError } from './errors.js';
export { BOBOT_KOMPONEN, FLAG } from './constants.js';

/**
 * Fungsi murni: lowongan + kandidat → skor per komponen + skor akhir.
 *
 * Jika ada komponen yang datanya belum ada (CV gagal/belum diekstrak,
 * ujian belum lengkap), skorAkhir = null dan status = 'belum_lengkap'.
 * Komponen yang datanya ada tetap dihitung supaya rekruter bisa melihatnya.
 *
 * Pembulatan hanya dilakukan sekali, di output.
 *
 * @param {object} lowongan {budgetMaksimal, skillWajib, tes:[{id, jenisTes, targetSkor, batasBawah, bobot}]}
 * @param {object} kandidat {tanggalLamaran, ekspektasiGaji, ketersediaanWaktu,
 *                           cv: {statusEkstraksi, skills, riwayatKerja} | null,
 *                           hasilUjian: [{lowonganTesId, skorPencapaian}]}
 */
export function hitungSkorKandidat(lowongan, kandidat) {
  validasiLowongan(lowongan);
  pastikan(kandidat && typeof kandidat === 'object', 'Data kandidat wajib ada', 'kandidat');

  const flags = new Set();
  const dataKurang = [];
  const komponen = {
    cv: null,
    tenure: null,
    tes: null,
    anggaran: hitungSkorAnggaran(kandidat.ekspektasiGaji, lowongan.budgetMaksimal),
    waktu: hitungSkorWaktu(kandidat.ketersediaanWaktu),
  };
  const detail = {};

  const cv = kandidat.cv;
  if (cv && cv.statusEkstraksi === 'berhasil') {
    const hasilCv = hitungSkorCv(lowongan.skillWajib, cv.skills ?? []);
    komponen.cv = hasilCv.skor;
    detail.cv = { ditemukan: hasilCv.ditemukan, tidakDitemukan: hasilCv.tidakDitemukan };

    const riwayat = hitungRiwayatKerja(cv.riwayatKerja ?? [], kandidat.tanggalLamaran);
    const hasilTenure = hitungSkorTenure(riwayat);
    komponen.tenure = hasilTenure.skor;
    detail.tenure = {
      totalBulan: riwayat.totalBulan,
      jumlahPerusahaan: riwayat.jumlahPerusahaan,
      rataRataBulan: hasilTenure.rataRataBulan,
      entriDibuang: riwayat.entriDibuang,
    };
    [...riwayat.flags, ...hasilTenure.flags].forEach((f) => flags.add(f));
  } else {
    if (cv?.statusEkstraksi === 'gagal') flags.add(FLAG.EKSTRAKSI_GAGAL);
    dataKurang.push('cv');
  }

  const hasilTes = hitungSkorTes(lowongan.tes, kandidat.hasilUjian ?? []);
  komponen.tes = hasilTes.skor;
  detail.tes = { rincian: hasilTes.rincian, belumDikerjakan: hasilTes.belumDikerjakan };
  if (hasilTes.skor === null) dataKurang.push('tes');

  const lengkap = dataKurang.length === 0;
  const skorAkhir = lengkap
    ? Object.entries(BOBOT_KOMPONEN).reduce((total, [nama, bobot]) => total + komponen[nama] * bobot, 0)
    : null;

  return {
    status: lengkap ? 'lengkap' : 'belum_lengkap',
    skorAkhir: skorAkhir === null ? null : bulatkan(skorAkhir),
    komponen: Object.fromEntries(
      Object.entries(komponen).map(([nama, skor]) => [nama, skor === null ? null : bulatkan(skor)]),
    ),
    dataKurang,
    flags: [...flags],
    detail,
  };
}
