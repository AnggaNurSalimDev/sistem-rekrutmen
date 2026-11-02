import rateLimit from 'express-rate-limit';
import { HttpError } from './errors.js';

/**
 * Pembatas laju untuk endpoint rawan brute-force (login) dan rawan spam akun
 * (pendaftaran). Dihitung per alamat IP pengunjung -- supaya IP yang dipakai
 * benar IP pengunjung dan bukan IP reverse proxy hosting, app.js WAJIB
 * mengatur 'trust proxy' dengan benar (lihat komentar di sana).
 *
 * Satu instance dipakai bersama oleh /auth/login dan /auth/register, jadi
 * jatahnya gabungan: percobaan login yang gagal berkali-kali dan percobaan
 * bikin akun berkali-kali sama-sama memotong jatah yang sama.
 */
export function buatBatasAuth() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    // 20/15menit per IP: longgar untuk pemakaian wajar (salah ketik password,
    // test otomatis yang memanggil /register & /login berkali-kali dalam satu
    // proses), tapi tetap jadi rem nyata untuk percobaan brute-force otomatis.
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next) => {
      next(new HttpError(429, 'TERLALU_SERING', 'Terlalu banyak percobaan dari alamat ini. Coba lagi dalam beberapa menit.'));
    },
  });
}
