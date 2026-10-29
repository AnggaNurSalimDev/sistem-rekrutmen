# Deploy Demo Portofolio (gratis)

```
 pengunjung
     │
     ▼
 Vercel (frontend, statis)          Render (backend, Node)            Neon (PostgreSQL)
 rekrut-demo.vercel.app  ──fetch──▶ rekrut-api.onrender.com ──SQL──▶ ep-xxx.neon.tech
 VITE_API_URL ─────────────────────┘  CORS_ORIGIN = alamat Vercel
                                      disk sementara: storage/ (PDF CV)
```

Kenapa tiga layanan:
- **Vercel**: frontend statis, selalu menyala, cepat.
- **Render free**: backend Express. Tidur setelah 15 menit tanpa kunjungan, bangun ±1 menit.
- **Neon free**: database permanen. Postgres gratis di Render kedaluwarsa setelah 30 hari, jadi tidak dipakai.

## Batasan yang perlu diketahui sebelum mulai

1. **Disk Render free tidak permanen.** Berkas PDF CV hilang setiap kali backend tidur atau deploy ulang.
   Data di database (termasuk teks CV dan skor) tetap ada.
   Solusi di panduan ini: data demo dibuat ulang setiap backend menyala (langkah 2), jadi PDF demo selalu ada.
   PDF yang diunggah pengunjung tetap akan hilang. Solusi permanen: driver storage Supabase/S3 (belum dibuat).
2. **Kunjungan pertama setelah backend tidur lambat** (±1 menit). Halaman tampil cepat, tapi daftar lowongan baru muncul setelah backend bangun.
3. **Belum ada pembatasan percobaan login.** Untuk demo berisi data fiktif ini bisa diterima; untuk situs klien harus ditambahkan dulu.
4. Parser AI dibiarkan mati (`ANTHROPIC_API_KEY` kosong) supaya pengunjung tidak memakan biaya API Anda.

## 1. Database — Neon

1. Daftar di neon.com → **New Project** → region terdekat (Singapore).
2. Salin **connection string** (bentuknya `postgresql://user:pass@ep-....neon.tech/neondb?sslmode=require`).
3. Simpan; ini `DATABASE_URL`.

## 2. Backend — Render

1. render.com → **New → Web Service** → hubungkan repo GitHub.
2. Isian:

| Isian | Nilai |
|---|---|
| Root Directory | `backend` |
| Runtime | Node |
| Build Command | `npm ci` |
| Start Command | `npm run migrate && npm run seed:demo && npm start` |
| Instance Type | Free |

3. Environment variables:

| Nama | Nilai |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | dari Neon |
| `JWT_SECRET` | 64 karakter acak (lihat bawah) |
| `STORAGE_SIGNING_SECRET` | 64 karakter acak, **berbeda** dari JWT_SECRET |
| `PUBLIC_BASE_URL` | alamat Render, contoh `https://rekrut-api.onrender.com` (isi setelah alamat muncul) |
| `CORS_ORIGIN` | alamat Vercel (isi setelah langkah 3) |
| `ALLOW_REKRUTER_SIGNUP` | `true` |
| `STORAGE_DRIVER` | `local` |

Membuat rahasia acak di komputer sendiri:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`seed:demo` di Start Command menghapus lalu membuat ulang **hanya** akun `@demo.rekrut.id` setiap backend menyala.
Akibatnya: demo selalu kembali bersih, dan PDF demo selalu tersedia. Akun yang didaftarkan pengunjung tidak disentuh.

4. Cek: buka `https://<alamat-render>/health` → `{"status":"ok","database":"ok",...}`.

## 3. Frontend — Vercel

1. vercel.com → **Add New → Project** → pilih repo.
2. **Root Directory**: `frontend`. Framework terdeteksi Vite. `frontend/vercel.json` sudah mengarahkan semua alamat ke `index.html`
   (tanpa ini, membuka `/rekruter` langsung atau menekan refresh menghasilkan 404).
3. Environment variables:

| Nama | Nilai |
|---|---|
| `VITE_API_URL` | alamat Render, tanpa `/` di akhir |
| `VITE_MODE_DEMO` | `true` |
| `VITE_PROFIL` | `rekrut` (profil yang tampil pertama kali) |

4. Deploy. Salin alamat Vercel → kembali ke Render → isi `CORS_ORIGIN` → Render deploy ulang otomatis.

Variabel `VITE_*` dibaca saat **build**. Mengubahnya di Vercel butuh **Redeploy**.

## 4. Uji setelah deploy

- [ ] `/health` di Render menjawab `ok`.
- [ ] Beranda Vercel menampilkan "Kepala Toko" dan "Kasir Outlet".
- [ ] Buka `/rekruter` langsung (bukan lewat klik) → halaman masuk, bukan 404.
- [ ] Masuk `hr@demo.rekrut.id` / `demo12345` → tabel kandidat, grafik, tombol "Buka PDF asli" membuka PDF.
- [ ] Ganti profil di bawah halaman → warna, huruf, logo, judul tab berubah; refresh tetap di profil itu.
- [ ] "Buat tampilan untuk perusahaan Anda" → isi nama + logo → **Pakai di demo ini** → beranda memakai merek baru.
- [ ] Coba dari HP.
- [ ] Console browser tanpa galat CORS.

## Situs untuk klien (nanti)

Untuk klien sungguhan, ubah tiga hal dari demo:
- `VITE_MODE_DEMO=false`, `VITE_PROFIL=<id-klien>` (lihat [PROFIL_PERUSAHAAN.md](PROFIL_PERUSAHAAN.md)).
- `ALLOW_REKRUTER_SIGNUP=false`, dan Start Command **tanpa** `seed:demo`.
- Instance berbayar (tidak tidur) + storage permanen untuk PDF, dan rate limit login.
