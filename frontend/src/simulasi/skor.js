/*
 * Padanan backend/src/layanan/skor.js: muat satu lamaran dari toko,
 * jalankan scoring engine (fungsi murni, lihat mesin/scoring/index.js),
 * simpan hasilnya. Dipanggil setiap kali data yang memengaruhi skor
 * berubah — persis aturan yang sama dengan backend.
 */
import { hitungSkorKandidat } from './mesin/scoring/index.js';
import { cari, cariSemua, tandaiBerubah } from './toko.js';

export function hitungUlangSkor(kandidatId) {
  const k = cari('kandidat', (x) => x.id === kandidatId);
  if (!k) throw new Error(`Kandidat ${kandidatId} tidak ditemukan`);
  const lowonganRow = cari('lowongan', (l) => l.id === k.lowongan_id);
  const tes = cariSemua('lowonganTes', (t) => t.lowongan_id === k.lowongan_id);
  const cv = cari('cvData', (c) => c.kandidat_id === kandidatId);
  const ujian = cariSemua('ujianTeknis', (u) => u.kandidat_id === kandidatId);

  const lowongan = {
    budgetMaksimal: lowonganRow.budget_maksimal,
    skillWajib: lowonganRow.skill_wajib,
    tes: tes.map((t) => ({ id: t.id, jenisTes: t.jenis_tes, targetSkor: t.target_skor, batasBawah: t.batas_bawah, bobot: t.bobot })),
  };
  const kandidat = {
    tanggalLamaran: k.dikirim_pada.slice(0, 10),
    ekspektasiGaji: k.ekspektasi_gaji,
    ketersediaanWaktu: k.ketersediaan_waktu,
    cv: cv
      ? {
          statusEkstraksi: cv.status_ekstraksi,
          terverifikasi: cv.terverifikasi,
          skills: Array.isArray(cv.skills_mentah) ? cv.skills_mentah : [],
          riwayatKerja: Array.isArray(cv.riwayat_kerja) ? cv.riwayat_kerja : [],
        }
      : null,
    hasilUjian: ujian.map((u) => ({ lowonganTesId: u.lowongan_tes_id, skorPencapaian: u.skor_pencapaian })),
  };

  let hasil;
  try {
    hasil = hitungSkorKandidat(lowongan, kandidat);
  } catch (err) {
    if (err?.name !== 'ScoringInputError') throw err;
    hasil = { status: 'galat', skorAkhir: null, sementara: false, galat: err.message };
  }

  k.skor_akhir = hasil.skorAkhir;
  k.rincian_skor = hasil;
  k.skor_dihitung_pada = new Date().toISOString();
  tandaiBerubah();
  return hasil;
}
