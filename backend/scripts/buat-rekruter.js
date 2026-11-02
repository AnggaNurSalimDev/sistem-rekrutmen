/**
 * Membuat satu akun rekruter langsung di database, untuk deploy klien sungguhan.
 *
 * Produk ini dipasang per perusahaan (satu pemberi kerja, bukan bursa kerja
 * terbuka seperti Glints) — jadi akun rekruter TIDAK dibuat lewat pendaftaran
 * publik di situs. Pemilik lowongan (atau Anda, pengembangnya) membuat akun
 * pertama lewat skrip ini sekali di awal; rekruter itu lalu masuk dengan email
 * dan password yang sama.
 *
 * Pakai (dari folder backend/):
 *   node scripts/buat-rekruter.js --email=hr@perusahaan.id --password=rahasia123 --nama="Nama HR"
 *
 * Password tidak boleh diketik di perintah yang tersimpan di riwayat shell untuk
 * akun produksi sungguhan — kosongkan --password untuk diminta secara tersembunyi.
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { muatConfig } from '../src/config.js';
import { buatPool } from '../src/db/pool.js';
import { hashPassword } from '../src/auth/password.js';

function ambilArg(nama) {
  const prefix = `--${nama}=`;
  const butir = process.argv.find((a) => a.startsWith(prefix));
  return butir ? butir.slice(prefix.length) : undefined;
}

async function tanyaTersembunyi(pertanyaan) {
  const rl = createInterface({ input: stdin, output: stdout });
  // readline tidak punya mode "sembunyikan input" bawaan; ini cukup untuk
  // skrip sekali pakai (bukan dipakai berulang oleh banyak orang).
  stdout.write(pertanyaan);
  return new Promise((resolve) => {
    stdin.on('data', (d) => resolve(d.toString().trim()));
  }).finally(() => rl.close());
}

async function main() {
  const email = ambilArg('email')?.trim().toLowerCase();
  const nama = ambilArg('nama')?.trim();
  let password = ambilArg('password');

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Isi --email=<email valid>');
    process.exitCode = 1;
    return;
  }
  if (!nama) {
    console.error('Isi --nama="Nama Rekruter"');
    process.exitCode = 1;
    return;
  }
  if (!password) password = await tanyaTersembunyi('Password (minimal 8 karakter): ');
  if (password.length < 8) {
    console.error('Password minimal 8 karakter');
    process.exitCode = 1;
    return;
  }

  let config;
  try {
    config = muatConfig();
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  }

  const pool = buatPool(config.DATABASE_URL);
  try {
    const hash = await hashPassword(password);
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, nama, role) VALUES ($1, $2, $3, 'rekruter')
       RETURNING id, email, nama`,
      [email, hash, nama],
    );
    console.log(`Akun rekruter dibuat: ${rows[0].email} (${rows[0].nama})`);
  } catch (err) {
    if (err.code === '23505') console.error(`Email ${email} sudah terdaftar.`);
    else console.error(`Gagal membuat akun: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
