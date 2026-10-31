import { pastikan } from './errors.js';
import { normalisasiDaftarSkill, normalisasiSkill } from './skills.js';
import { clamp } from './util.js';

/**
 * Skor CV = (skill wajib ditemukan / total skill wajib) × 100.
 * Pembagi dijamin > 0 oleh guard di bawah (invariant skill_wajib ≥ 1).
 */
export function hitungSkorCv(skillWajib, skillKandidat) {
  const wajib = normalisasiDaftarSkill(skillWajib);
  pastikan(wajib.size >= 1, 'Lowongan wajib punya minimal 1 skill wajib', 'skillWajib');

  const dimiliki = normalisasiDaftarSkill(skillKandidat);
  // Pencocokan memakai bentuk ternormalisasi ("manajemenstok"), tapi yang
  // dilaporkan ejaan lowongan ("Manajemen Stok") supaya bisa dibaca HR.
  const ejaan = new Map();
  for (const s of skillWajib) {
    const n = normalisasiSkill(s);
    if (n !== null && !ejaan.has(n)) ejaan.set(n, s.trim());
  }

  const ditemukan = [];
  const tidakDitemukan = [];
  for (const skill of wajib) {
    (dimiliki.has(skill) ? ditemukan : tidakDitemukan).push(ejaan.get(skill) ?? skill);
  }

  return {
    skor: clamp((ditemukan.length / wajib.size) * 100),
    ditemukan,
    tidakDitemukan,
  };
}
