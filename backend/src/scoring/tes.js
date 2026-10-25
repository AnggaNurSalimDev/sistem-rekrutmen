import { pastikan, angkaHingga } from './errors.js';
import { clamp } from './util.js';

/**
 * Normalisasi satu tes dengan batas bawah.
 * Pembagi (target - batasBawah) dijamin > 0 oleh guard.
 */
export function normalisasiSkorTes(aktual, targetSkor, batasBawah) {
  pastikan(angkaHingga(aktual), 'Skor aktual harus angka', 'skorPencapaian');
  pastikan(angkaHingga(targetSkor) && angkaHingga(batasBawah), 'Target dan batas bawah harus angka', 'tes');
  pastikan(targetSkor > batasBawah, 'targetSkor harus lebih besar dari batasBawah', 'tes');

  if (aktual <= batasBawah) return 0;
  if (aktual >= targetSkor) return 100;
  return clamp(((aktual - batasBawah) / (targetSkor - batasBawah)) * 100);
}

/**
 * Rata-rata tertimbang skor semua tes lowongan.
 * Jika ada tes yang belum dikerjakan → skor null (bukan 0),
 * dan daftar tes yang kurang dikembalikan.
 *
 * @param {Array} konfigurasiTes [{id, jenisTes, targetSkor, batasBawah, bobot}]
 * @param {Array} hasilUjian [{lowonganTesId, skorPencapaian}]
 */
export function hitungSkorTes(konfigurasiTes, hasilUjian) {
  pastikan(Array.isArray(konfigurasiTes) && konfigurasiTes.length > 0, 'Lowongan wajib punya minimal 1 tes', 'tes');
  pastikan(Array.isArray(hasilUjian), 'hasilUjian harus berupa array', 'hasilUjian');

  const idValid = new Set(konfigurasiTes.map((tes) => tes.id));
  const hasilPerTes = new Map();
  for (const hasil of hasilUjian) {
    pastikan(
      idValid.has(hasil?.lowonganTesId),
      `Hasil ujian untuk tes ${hasil?.lowonganTesId} tidak ada di konfigurasi lowongan`,
      'hasilUjian',
    );
    pastikan(
      !hasilPerTes.has(hasil?.lowonganTesId),
      `Hasil ujian ganda untuk tes ${hasil?.lowonganTesId}`,
      'hasilUjian',
    );
    hasilPerTes.set(hasil?.lowonganTesId, hasil?.skorPencapaian);
  }

  const belumDikerjakan = [];
  const rincian = [];
  let total = 0;

  for (const tes of konfigurasiTes) {
    if (!hasilPerTes.has(tes.id)) {
      belumDikerjakan.push(tes.jenisTes ?? tes.id);
      continue;
    }
    const skor = normalisasiSkorTes(hasilPerTes.get(tes.id), tes.targetSkor, tes.batasBawah);
    rincian.push({ jenisTes: tes.jenisTes, skor, bobot: tes.bobot });
    total += skor * tes.bobot;
  }

  if (belumDikerjakan.length > 0) {
    return { skor: null, rincian, belumDikerjakan };
  }

  return { skor: clamp(total), rincian, belumDikerjakan };
}
