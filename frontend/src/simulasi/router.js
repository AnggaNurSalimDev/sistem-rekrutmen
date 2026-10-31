/*
 * Jalur satu pintu mode simulasi: method+path (sama persis dengan yang dipanggil
 * api/klien.js) → handler → { status, data }. Dipanggil dari api/klien.js
 * sebagai pengganti fetch() sungguhan ketika VITE_SIMULASI=true.
 *
 *   "/lowongan/abc-123/status" ──cocokkan pola──▶ { nama: 'ubahStatus', params: { id: 'abc-123' } }
 */
import { GalatSimulasi } from './galat.js';
import { requireAuth, requireRole, userDariToken } from './auth.js';
import * as auth from './auth.js';
import * as lowonganTerbuka from './lowonganTerbuka.js';
import * as lowongan from './lowongan.js';
import { ruteSoalPerTes, ruteSoal } from './soal.js';
import * as lamaran from './lamaran.js';
import { rutePerLowongan, rute as kandidat } from './kandidat.js';

// [method, pola, peran|null (null = publik), handler(params, ctx)]
// ctx = { user, body, form, token }
const RUTE = [
  ['POST', '/auth/register', null, (p, c) => auth.rute.register(c.body)],
  ['POST', '/auth/login', null, (p, c) => auth.rute.login(c.body)],
  ['GET', '/auth/me', 'apa saja', (p, c) => auth.rute.me(c.token)],

  ['GET', '/lowongan-terbuka', null, () => lowonganTerbuka.rute.daftar()],
  ['GET', '/lowongan-terbuka/:id', null, (p) => lowonganTerbuka.rute.detail(p.id)],

  ['GET', '/lowongan', 'rekruter', (p, c) => lowongan.rute.daftar(c.user)],
  ['POST', '/lowongan', 'rekruter', (p, c) => lowongan.rute.buat(c.user, c.body)],
  ['GET', '/lowongan/:id', 'rekruter', (p, c) => lowongan.rute.detail(c.user, p.id)],
  ['PUT', '/lowongan/:id', 'rekruter', (p, c) => lowongan.rute.ubah(c.user, p.id, c.body)],
  ['PATCH', '/lowongan/:id/status', 'rekruter', (p, c) => lowongan.rute.ubahStatus(c.user, p.id, c.body)],
  ['DELETE', '/lowongan/:id', 'rekruter', (p, c) => lowongan.rute.hapus(c.user, p.id)],
  ['GET', '/lowongan/:id/kandidat', 'rekruter', (p, c) => rutePerLowongan.daftar(c.user, p.id)],

  ['GET', '/tes/:tesId/soal', 'rekruter', (p, c) => ruteSoalPerTes.daftar(c.user, p.tesId)],
  ['GET', '/tes/:tesId/soal/pratinjau', 'rekruter', (p, c) => ruteSoalPerTes.pratinjau(c.user, p.tesId)],
  ['POST', '/tes/:tesId/soal', 'rekruter', (p, c) => ruteSoalPerTes.buat(c.user, p.tesId, c.body)],
  ['PUT', '/tes/:tesId/soal/urutan', 'rekruter', (p, c) => ruteSoalPerTes.urutan(c.user, p.tesId, c.body)],
  ['GET', '/soal/:id', 'rekruter', (p, c) => ruteSoal.detail(c.user, p.id)],
  ['PUT', '/soal/:id', 'rekruter', (p, c) => ruteSoal.ubah(c.user, p.id, c.body)],
  ['PATCH', '/soal/:id/aktif', 'rekruter', (p, c) => ruteSoal.aktif(c.user, p.id, c.body)],
  ['DELETE', '/soal/:id', 'rekruter', (p, c) => ruteSoal.hapus(c.user, p.id)],

  ['POST', '/lamaran', 'kandidat', (p, c) => lamaran.rute.buat(c.user, c.form)],
  ['GET', '/lamaran', 'kandidat', (p, c) => lamaran.rute.daftar(c.user)],
  ['GET', '/lamaran/:id', 'kandidat', (p, c) => lamaran.rute.detail(c.user, p.id)],
  ['POST', '/lamaran/:id/ujian/:tesId/mulai', 'kandidat', (p, c) => lamaran.rute.mulai(c.user, p.id, p.tesId)],
  ['POST', '/lamaran/:id/ujian/:tesId/kirim', 'kandidat', (p, c) => lamaran.rute.kirim(c.user, p.id, p.tesId, c.body)],

  ['GET', '/kandidat/:id', 'rekruter', (p, c) => kandidat.detail(c.user, p.id)],
  ['PUT', '/kandidat/:id/cv', 'rekruter', (p, c) => kandidat.koreksiCv(c.user, p.id, c.body)],
  ['POST', '/kandidat/:id/cv/konfirmasi', 'rekruter', (p, c) => kandidat.konfirmasi(c.user, p.id)],
  ['PATCH', '/kandidat/:id/status', 'rekruter', (p, c) => kandidat.ubahStatus(c.user, p.id, c.body)],
];

function cocokkan(pola, path) {
  const namaParam = [];
  const regex = new RegExp(
    '^' +
      pola
        .split('/')
        .map((bagian) => {
          if (bagian.startsWith(':')) {
            namaParam.push(bagian.slice(1));
            return '([^/]+)';
          }
          return bagian.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        })
        .join('/') +
      '$',
  );
  const cocok = regex.exec(path);
  if (!cocok) return null;
  return Object.fromEntries(namaParam.map((nama, i) => [nama, decodeURIComponent(cocok[i + 1])]));
}

/**
 * @returns {Promise<{status: number, data: object|null}>} data sudah berbentuk objek JS
 *   (bukan string), konsisten dengan `await res.json()` pada fetch sungguhan.
 */
export async function routeSimulasi(path, method, { body, form, token } = {}) {
  for (const [m, pola, peran, handler] of RUTE) {
    if (m !== method) continue;
    const params = cocokkan(pola, path);
    if (!params) continue;

    try {
      let user = null;
      if (peran !== null) {
        user = requireAuth(token);
        if (peran !== 'apa saja') requireRole(user, peran);
      } else if (token) {
        user = userDariToken(token); // token opsional, misalnya tidak dipakai di sini tapi tidak dilarang
      }
      const hasil = await handler(params, { user, body, form, token });
      return hasil;
    } catch (err) {
      if (err instanceof GalatSimulasi) {
        return { status: err.status, data: { error: { kode: err.kode, pesan: err.message, ...err.extra } } };
      }
      // Bug di lapisan simulasi: jangan sampai menjatuhkan seluruh halaman tanpa pesan.
      console.error('[simulasi] galat tak terduga', err);
      return { status: 500, data: { error: { kode: 'INTERNAL', pesan: 'Terjadi kesalahan di mode simulasi.' } } };
    }
  }
  return { status: 404, data: { error: { kode: 'RUTE_TIDAK_ADA', pesan: 'Endpoint tidak ditemukan' } } };
}
