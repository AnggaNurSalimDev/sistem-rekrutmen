import { z } from 'zod';

const boolDariEnv = z
  .enum(['true', 'false'])
  .default('true')
  .transform((v) => v === 'true');

const skema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL wajib diisi'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET minimal 32 karakter'),
  JWT_EXPIRES_IN: z.string().min(1).default('8h'),
  STORAGE_DRIVER: z.enum(['local']).default('local'),
  STORAGE_DIR: z.string().min(1).default('./storage'),
  STORAGE_SIGNING_SECRET: z.string().min(32, 'STORAGE_SIGNING_SECRET minimal 32 karakter'),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(10).max(3600).default(300),
  PUBLIC_BASE_URL: z.url().default('http://localhost:3000'),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  ALLOW_REKRUTER_SIGNUP: boolDariEnv,
});

/**
 * Membaca dan memvalidasi environment. Gagal cepat saat start
 * (bukan saat request pertama) jika konfigurasi kurang atau lemah.
 */
export function muatConfig(env = process.env) {
  const hasil = skema.safeParse(env);
  if (!hasil.success) {
    const daftar = hasil.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Konfigurasi tidak valid:\n${daftar}\nLihat backend/.env.example`);
  }
  const c = hasil.data;
  if (c.JWT_SECRET === c.STORAGE_SIGNING_SECRET) {
    throw new Error('JWT_SECRET dan STORAGE_SIGNING_SECRET harus berbeda');
  }
  return Object.freeze(c);
}
