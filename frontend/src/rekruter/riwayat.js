/** Form koreksi riwayat kerja oleh HR ↔ body PUT /kandidat/:id/cv. */

const POLA_BULAN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function bulanIni() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Baris form dari data CV: tanggal kosong = "tidak disebut", selesai kosong = masih bekerja. */
export function barisDariCv(riwayat) {
  return (riwayat ?? []).map((r) => ({
    perusahaan: r.perusahaan ?? '',
    mulai: r.mulai ?? '',
    selesai: r.selesai ?? '',
    tanpaTanggal: !r.mulai,
    masihBekerja: Boolean(r.mulai) && !r.selesai,
  }));
}

export function validasiRiwayat(baris, sekarang = bulanIni()) {
  const galat = {};
  const hasil = baris.map((r, i) => {
    const perusahaan = r.perusahaan.trim();
    if (!perusahaan) galat[i] = 'Isi nama tempat kerja.';
    if (r.tanpaTanggal) return { perusahaan, mulai: null, selesai: null };
    if (!POLA_BULAN.test(r.mulai)) galat[i] = 'Isi bulan mulai, atau centang "tanggal tidak disebut".';
    else if (r.mulai > sekarang) galat[i] = 'Bulan mulai tidak boleh di masa depan.';
    else if (!r.masihBekerja && !POLA_BULAN.test(r.selesai)) galat[i] = 'Isi bulan selesai, atau centang "masih bekerja".';
    else if (!r.masihBekerja && r.selesai < r.mulai) galat[i] = 'Bulan selesai sebelum bulan mulai.';
    return { perusahaan, mulai: r.mulai, selesai: r.masihBekerja ? null : r.selesai };
  });
  return { galat, hasil };
}
