import { z } from 'zod';

const BULAN = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Bentuk data mentah dari parser mana pun (regex, AI, koreksi manual).
 * Satu skema untuk semua sumber, supaya scoring engine tidak perlu tahu
 * dari mana datanya berasal.
 */
export const skemaHasilParser = z.object({
  skills: z.array(z.string().trim().min(1).max(60)).max(100),
  riwayatKerja: z
    .array(
      z.object({
        perusahaan: z.string().trim().min(1).max(200),
        mulai: z.string().regex(BULAN, 'format harus YYYY-MM'),
        selesai: z.string().regex(BULAN, 'format harus YYYY-MM').nullable(),
      }),
    )
    .max(30),
});
