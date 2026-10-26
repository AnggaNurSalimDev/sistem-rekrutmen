import { hitungSkorKandidat, ScoringInputError } from '../scoring/index.js';

/**
 * Memuat semua data satu lamaran dari database, menjalankan scoring engine
 * (fungsi murni), lalu menyimpan hasilnya. Dipanggil setiap kali data yang
 * memengaruhi skor berubah: lamaran dibuat, ujian dikirim, CV diverifikasi.
 *
 * skor_akhir disimpan walau masih sementara; tanda sementara ada di
 * rincian_skor.sementara dan wajib ditampilkan dashboard.
 *
 * @param {import('pg').PoolClient | import('pg').Pool} db sebaiknya client di dalam transaksi
 */
export async function hitungUlangSkor(db, kandidatId) {
  const { rows: kandidatRows } = await db.query(
    `SELECT k.id, k.lowongan_id, k.ekspektasi_gaji, k.ketersediaan_waktu,
            to_char(k.dikirim_pada AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') AS tanggal_lamaran,
            l.budget_maksimal, l.skill_wajib
     FROM kandidat k JOIN lowongan l ON l.id = k.lowongan_id
     WHERE k.id = $1`,
    [kandidatId],
  );
  if (kandidatRows.length === 0) throw new Error(`Kandidat ${kandidatId} tidak ditemukan`);
  const k = kandidatRows[0];

  const [{ rows: tes }, { rows: cvRows }, { rows: ujian }] = await Promise.all([
    db.query('SELECT id, jenis_tes, target_skor, batas_bawah, bobot FROM lowongan_tes WHERE lowongan_id = $1', [
      k.lowongan_id,
    ]),
    db.query('SELECT status_ekstraksi, terverifikasi, skills_mentah, riwayat_kerja FROM cv_data WHERE kandidat_id = $1', [
      kandidatId,
    ]),
    db.query('SELECT lowongan_tes_id, skor_pencapaian FROM ujian_teknis WHERE kandidat_id = $1', [kandidatId]),
  ]);

  const cv = cvRows[0];
  const lowongan = {
    budgetMaksimal: k.budget_maksimal,
    skillWajib: k.skill_wajib,
    tes: tes.map((t) => ({
      id: t.id,
      jenisTes: t.jenis_tes,
      targetSkor: t.target_skor,
      batasBawah: t.batas_bawah,
      bobot: t.bobot,
    })),
  };
  const kandidat = {
    tanggalLamaran: k.tanggal_lamaran,
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
    // Data lama yang melanggar invariant tidak boleh menghasilkan skor diam-diam.
    if (!(err instanceof ScoringInputError)) throw err;
    hasil = { status: 'galat', skorAkhir: null, sementara: false, galat: err.message };
  }

  await db.query('UPDATE kandidat SET skor_akhir = $1, rincian_skor = $2, skor_dihitung_pada = now() WHERE id = $3', [
    hasil.skorAkhir,
    JSON.stringify(hasil),
    kandidatId,
  ]);
  return hasil;
}
