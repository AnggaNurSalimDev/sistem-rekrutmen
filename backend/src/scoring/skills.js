import { pastikan } from './errors.js';

/**
 * Kamus alias: bentuk ternormalisasi (tanpa tanda baca) → nama kanonik.
 * Tambahkan entri di sini, bukan di logika pencocokan.
 */
export const KAMUS_ALIAS = Object.freeze({
  reactjs: 'react',
  reactjavascript: 'react',
  nodejs: 'node',
  node: 'node',
  expressjs: 'express',
  js: 'javascript',
  ecmascript: 'javascript',
  ts: 'typescript',
  postgres: 'postgresql',
  postgre: 'postgresql',
  psql: 'postgresql',
  mongo: 'mongodb',
  vuejs: 'vue',
  nextjs: 'next',
  tailwindcss: 'tailwind',
  golang: 'go',
  msexcel: 'excel',
  microsoftexcel: 'excel',
});

/**
 * "  React.JS " → "reactjs" → "react"
 * Mengembalikan null untuk input kosong/bukan string, supaya pemanggil
 * bisa membuangnya tanpa crash.
 */
export function normalisasiSkill(skill) {
  if (typeof skill !== 'string') return null;

  const bersih = skill
    .toLowerCase()
    .trim()
    .replace(/\+/g, 'plus')
    .replace(/#/g, 'sharp')
    .replace(/[^\p{L}\p{N}]/gu, '');

  if (bersih === '') return null;
  return KAMUS_ALIAS[bersih] ?? bersih;
}

/** Array skill mentah → Set skill kanonik (duplikat dan entri kosong dibuang). */
export function normalisasiDaftarSkill(daftar) {
  pastikan(Array.isArray(daftar), 'Daftar skill harus berupa array', 'skills');

  const hasil = new Set();
  for (const skill of daftar) {
    const normal = normalisasiSkill(skill);
    if (normal !== null) hasil.add(normal);
  }
  return hasil;
}
