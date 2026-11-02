import { pastikan, angkaHingga } from './errors.js';
import { TOLERANSI_JUMLAH_BOBOT } from './constants.js';
import { normalisasiDaftarSkill } from './skills.js';

/**
 * Mengecek semua invariant lowongan dari RECRUITMENT_ARCHITECTURE.md.
 * Dipanggil saat lowongan dibuat/diubah DAN sebelum scoring,
 * supaya data lama yang rusak tidak diam-diam menghasilkan skor.
 */
export function validasiLowongan(lowongan) {
  pastikan(lowongan && typeof lowongan === 'object', 'Data lowongan wajib ada', 'lowongan');

  pastikan(
    angkaHingga(lowongan.budgetMaksimal) && lowongan.budgetMaksimal > 0,
    'budgetMaksimal harus angka > 0',
    'budgetMaksimal',
  );

  pastikan(Array.isArray(lowongan.skillWajib), 'skillWajib harus berupa array', 'skillWajib');
  pastikan(
    normalisasiDaftarSkill(lowongan.skillWajib).size >= 1,
    'Lowongan wajib punya minimal 1 skill wajib yang tidak kosong',
    'skillWajib',
  );

  pastikan(Array.isArray(lowongan.tes) && lowongan.tes.length > 0, 'Lowongan wajib punya minimal 1 tes', 'tes');

  const idTes = new Set();
  let jumlahBobot = 0;
  for (const tes of lowongan.tes) {
    pastikan(tes?.id !== undefined && tes?.id !== null, 'Setiap tes wajib punya id', 'tes');
    pastikan(!idTes.has(tes.id), `id tes ganda: ${tes.id}`, 'tes');
    idTes.add(tes.id);

    pastikan(
      angkaHingga(tes.targetSkor) && angkaHingga(tes.batasBawah) && tes.targetSkor > tes.batasBawah,
      `Tes ${tes.jenisTes ?? tes.id}: targetSkor harus lebih besar dari batasBawah`,
      'tes',
    );
    pastikan(angkaHingga(tes.bobot) && tes.bobot > 0, `Tes ${tes.jenisTes ?? tes.id}: bobot harus > 0`, 'tes');
    jumlahBobot += tes.bobot;
  }

  pastikan(
    Math.abs(jumlahBobot - 1) <= TOLERANSI_JUMLAH_BOBOT,
    `Jumlah bobot tes harus 1 (sekarang ${jumlahBobot})`,
    'tes',
  );
}
