import { Router } from 'express';
import { HttpError } from '../http/errors.js';
import { parse, z } from '../http/validate.js';
import { hashPassword, cocokPassword, HASH_PALSU } from '../auth/password.js';
import { buatToken } from '../auth/middleware.js';

const email = z.string().trim().toLowerCase().pipe(z.email()).pipe(z.string().max(254));

const skemaDaftar = z.strictObject({
  email,
  password: z.string().min(8).max(200),
  nama: z.string().trim().min(1).max(120),
  role: z.enum(['kandidat', 'rekruter']),
});

const skemaLogin = z.strictObject({
  email,
  password: z.string().min(1).max(200),
});

const tampilkanUser = (u) => ({ id: u.id, email: u.email, nama: u.nama, role: u.role });

export function ruteAuth({ pool, config, requireAuth }) {
  const r = Router();
  const opsiToken = { secret: config.JWT_SECRET, expiresIn: config.JWT_EXPIRES_IN };

  r.post('/register', async (req, res) => {
    const data = parse(skemaDaftar, req.body);
    if (data.role === 'rekruter' && !config.ALLOW_REKRUTER_SIGNUP) {
      throw new HttpError(403, 'DILARANG', 'Pendaftaran rekruter sedang ditutup');
    }

    const passwordHash = await hashPassword(data.password);
    try {
      const { rows } = await pool.query(
        `INSERT INTO users (email, password_hash, nama, role)
         VALUES ($1, $2, $3, $4) RETURNING id, email, nama, role`,
        [data.email, passwordHash, data.nama, data.role],
      );
      const user = rows[0];
      res.status(201).json({ user: tampilkanUser(user), token: buatToken(user, opsiToken) });
    } catch (err) {
      if (err.code === '23505') throw new HttpError(409, 'EMAIL_TERPAKAI', 'Email sudah terdaftar');
      throw err;
    }
  });

  r.post('/login', async (req, res) => {
    const data = parse(skemaLogin, req.body);
    const { rows } = await pool.query(
      'SELECT id, email, nama, role, password_hash FROM users WHERE email = $1',
      [data.email],
    );
    const user = rows[0];

    // Selalu jalankan pengecekan hash, walau email tidak ada.
    const cocok = await cocokPassword(data.password, user?.password_hash ?? HASH_PALSU);
    if (!user || !cocok) {
      throw new HttpError(401, 'LOGIN_GAGAL', 'Email atau password salah');
    }

    res.json({ user: tampilkanUser(user), token: buatToken(user, opsiToken) });
  });

  r.get('/me', requireAuth, (req, res) => {
    res.json({ user: tampilkanUser(req.user) });
  });

  return r;
}
