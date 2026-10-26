export const BOBOT_KOMPONEN = Object.freeze({
  cv: 0.3,
  tenure: 0.2,
  tes: 0.3,
  anggaran: 0.1,
  waktu: 0.1,
});

export const TENURE = Object.freeze({
  batasBawahBulan: 6,
  batasAtasBulan: 12,
  skorTanpaRiwayat: 50,
});

export const TOLERANSI_ANGGARAN = 0.15;

export const SKOR_KETERSEDIAAN = Object.freeze({
  penuh: 100,
  sebagian: 50,
  tidak: 0,
});

export const TOLERANSI_JUMLAH_BOBOT = 0.001;

export const FLAG = Object.freeze({
  TANPA_RIWAYAT_KERJA: 'tanpa_riwayat_kerja',
  RIWAYAT_TIDAK_VALID: 'riwayat_tidak_valid',
  EKSTRAKSI_GAGAL: 'ekstraksi_gagal',
  CV_PERLU_TINJAU: 'cv_perlu_tinjau',
});

/** Status ekstraksi yang datanya boleh dipakai untuk skor (sementara jika belum diverifikasi). */
export const STATUS_CV_BERDATA = Object.freeze(['berhasil', 'perlu_tinjau']);
