import jwt from 'jsonwebtoken';
import { HttpError } from '../http/errors.js';

const tidakTerautentikasi = () => new HttpError(401, 'TIDAK_TERAUTENTIKASI', 'Silakan login terlebih dahulu');

export function buatToken(user, { secret, expiresIn }) {
  return jwt.sign({ role: user.role }, secret, { subject: user.id, expiresIn, algorithm: 'HS256' });
}

/**
 * Memverifikasi token lalu memuat ulang user dari database, supaya user
 * yang sudah dihapus atau diubah perannya tidak tetap bisa masuk dengan
 * token lama. Peran yang dipakai adalah peran di database, bukan di token.
 */
export function buatRequireAuth({ pool, secret }) {
  return async function requireAuth(req, _res, next) {
    const header = req.get('authorization') ?? '';
    const [skema, token] = header.split(' ');
    if (skema !== 'Bearer' || !token) throw tidakTerautentikasi();

    let payload;
    try {
      payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    } catch {
      throw tidakTerautentikasi();
    }

    const { rows } = await pool.query('SELECT id, email, nama, role FROM users WHERE id = $1', [payload.sub]);
    if (rows.length === 0) throw tidakTerautentikasi();

    req.user = rows[0];
    next();
  };
}

export function requireRole(...peran) {
  if (peran.length === 0) throw new Error('requireRole butuh minimal satu peran');
  return function cekPeran(req, _res, next) {
    if (!req.user) throw tidakTerautentikasi();
    if (!peran.includes(req.user.role)) {
      throw new HttpError(403, 'DILARANG', 'Akun Anda tidak punya akses ke fitur ini');
    }
    next();
  };
}
