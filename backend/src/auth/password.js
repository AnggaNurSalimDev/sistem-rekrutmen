import { scrypt as scryptCb, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

// scrypt bawaan Node: tidak butuh modul native (bcrypt sering gagal
// di-install di Windows/Linux tanpa build tools).
const scrypt = promisify(scryptCb);
const PARAM = Object.freeze({ N: 16384, r: 8, p: 1, panjang: 64 });

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length === 0) throw new Error('Password kosong');
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, PARAM.panjang, { N: PARAM.N, r: PARAM.r, p: PARAM.p });
  return ['scrypt', PARAM.N, PARAM.r, PARAM.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function cocokPassword(password, tersimpan) {
  if (typeof password !== 'string' || typeof tersimpan !== 'string') return false;
  const bagian = tersimpan.split('$');
  if (bagian.length !== 6 || bagian[0] !== 'scrypt') return false;

  const [, N, r, p, saltB64, hashB64] = bagian;
  const harapan = Buffer.from(hashB64, 'base64');
  const hasil = await scrypt(password, Buffer.from(saltB64, 'base64'), harapan.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  return harapan.length === hasil.length && timingSafeEqual(harapan, hasil);
}

// Dipakai saat email tidak ditemukan, supaya waktu respons login sama
// dengan saat password salah (tidak membocorkan email mana yang terdaftar).
export const HASH_PALSU = await hashPassword(randomBytes(16).toString('hex'));
