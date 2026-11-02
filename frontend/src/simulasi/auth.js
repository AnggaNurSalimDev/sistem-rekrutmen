/*
 * Autentikasi simulasi. Tidak ada JWT sungguhan — token hanya "sim.<userId>".
 * Ini aman secukupnya untuk tujuannya: semua data memang sudah ada di
 * localStorage browser yang sama, jadi tidak ada rahasia yang dilindungi.
 * Password juga tidak di-hash (tidak ada apa pun yang keluar dari browser ini).
 */
import { GalatSimulasi, dilarang, validasiGagal } from './galat.js';
import { cari, idBaru, sekarang, tabel, tandaiBerubah } from './toko.js';

const POLA_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const tampilkanUser = (u) => ({ id: u.id, email: u.email, nama: u.nama, role: u.role });

export function buatToken(user) {
  return `sim.${user.id}`;
}

/** @returns user atau null (dipakai middleware requireAuth di router.js) */
export function userDariToken(token) {
  if (typeof token !== 'string' || !token.startsWith('sim.')) return null;
  return cari('users', (u) => u.id === token.slice(4));
}

export function requireAuth(token) {
  const user = userDariToken(token);
  if (!user) throw new GalatSimulasi(401, 'TIDAK_TERAUTENTIKASI', 'Anda belum masuk, atau sesi sudah berakhir.');
  return user;
}

export function requireRole(user, role) {
  if (user.role !== role) throw dilarang(`Halaman ini khusus akun ${role}.`);
}

function validasiDaftar(body) {
  const d = {};
  const e = body?.email?.trim().toLowerCase();
  if (!e || !POLA_EMAIL.test(e) || e.length > 254) {
    throw validasiGagal('Data tidak valid', { detail: [{ field: 'email', pesan: 'Email tidak valid' }] });
  }
  d.email = e;
  if (typeof body?.password !== 'string' || body.password.length < 8 || body.password.length > 200) {
    throw validasiGagal('Data tidak valid', { detail: [{ field: 'password', pesan: 'Password minimal 8 karakter' }] });
  }
  d.password = body.password;
  const nama = body?.nama?.trim();
  if (!nama || nama.length > 120) {
    throw validasiGagal('Data tidak valid', { detail: [{ field: 'nama', pesan: 'Nama wajib diisi' }] });
  }
  d.nama = nama;
  if (!['kandidat', 'rekruter'].includes(body?.role)) {
    throw validasiGagal('Data tidak valid', { detail: [{ field: 'role', pesan: 'Peran tidak dikenal' }] });
  }
  d.role = body.role;
  return d;
}

export const rute = {
  register(body) {
    const d = validasiDaftar(body);
    if (cari('users', (u) => u.email === d.email)) {
      throw new GalatSimulasi(409, 'EMAIL_TERPAKAI', 'Email sudah terdaftar');
    }
    const user = { id: idBaru(), email: d.email, password: d.password, nama: d.nama, role: d.role, dibuat_pada: sekarang() };
    tabel('users').push(user);
    tandaiBerubah();
    return { status: 201, data: { user: tampilkanUser(user), token: buatToken(user) } };
  },

  login(body) {
    const email = body?.email?.trim().toLowerCase();
    const user = cari('users', (u) => u.email === email);
    if (!user || user.password !== body?.password) {
      throw new GalatSimulasi(401, 'LOGIN_GAGAL', 'Email atau password salah');
    }
    return { status: 200, data: { user: tampilkanUser(user), token: buatToken(user) } };
  },

  me(token) {
    const user = requireAuth(token);
    return { status: 200, data: { user: tampilkanUser(user) } };
  },
};
