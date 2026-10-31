import { pastikan, angkaHingga } from './errors.js';
import { SKOR_KETERSEDIAAN, TOLERANSI_ANGGARAN } from './constants.js';
import { clamp } from './util.js';

/**
 * selisih = (ekspektasi - budget) / budget
 * ≤ 0 → 100; 0 < selisih ≤ 15% → turun linear ke 0; > 15% → 0.
 */
export function hitungSkorAnggaran(ekspektasiGaji, budgetMaksimal) {
  pastikan(angkaHingga(budgetMaksimal) && budgetMaksimal > 0, 'budgetMaksimal harus > 0', 'budgetMaksimal');
  pastikan(angkaHingga(ekspektasiGaji) && ekspektasiGaji >= 0, 'ekspektasiGaji harus ≥ 0', 'ekspektasiGaji');

  const selisih = (ekspektasiGaji - budgetMaksimal) / budgetMaksimal;

  if (selisih <= 0) return 100;
  if (selisih > TOLERANSI_ANGGARAN) return 0;
  return clamp(100 * (1 - selisih / TOLERANSI_ANGGARAN));
}

/** 'penuh' | 'sebagian' | 'tidak' → 100 | 50 | 0. Nilai lain ditolak. */
export function hitungSkorWaktu(ketersediaanWaktu) {
  pastikan(
    Object.hasOwn(SKOR_KETERSEDIAAN, ketersediaanWaktu),
    `ketersediaanWaktu harus salah satu dari: ${Object.keys(SKOR_KETERSEDIAAN).join(', ')}`,
    'ketersediaanWaktu',
  );
  return SKOR_KETERSEDIAAN[ketersediaanWaktu];
}
