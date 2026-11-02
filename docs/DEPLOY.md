# Deploy Demo Portofolio

Ada dua versi demo. Pakai **Versi A** untuk tautan yang dibagikan ke media sosial —
itu yang orang klik tanpa Anda di sana untuk menyalakan apa pun.

```
Versi A — tautan publik, dibagikan bebas                 Versi B — demo lengkap (opsional, lihat bagian 2)
(mode simulasi, lihat frontend/src/simulasi/README.md)    backend & database sungguhan

 pengunjung                                                pengunjung
     │                                                         │
     ▼                                                         ▼
 Vercel (statis) — seluruh "server" jalan                  Vercel (statis)  ──fetch──▶ Render (backend) ──SQL──▶ Neon
 di browser pengunjung sendiri, data di                                                  tidur 15 menit tanpa
 localStorage, tidak pernah dikirim ke mana pun                                          kunjungan, bangun ±1 menit
```

## Versi A — selalu menyala, gratis, tanpa kartu (dipakai untuk link publik)

Tidak ada backend sama sekali untuk versi ini. Cukup satu layanan: Vercel.
Karena tidak ada server yang bisa tidur, pengunjung yang membuka tautan dari
media sosial — kapan pun, tanpa Anda tahu — selalu mendapat situs yang hidup.

1. vercel.com → daftar pakai GitHub → **Add New → Project** → pilih repo `sistem-rekrutmen`.
2. **Root Directory**: `frontend` (tekan Edit untuk mengubahnya). Framework otomatis terbaca Vite.
   `frontend/vercel.json` sudah mengarahkan semua alamat ke `index.html` (tanpa ini, membuka
   `/rekruter` langsung atau menekan refresh menghasilkan 404).
3. Environment Variables:

| Nama | Nilai |
|---|---|
| `VITE_SIMULASI` | `true` |
| `VITE_MODE_DEMO` | `true` |
| `VITE_PROFIL` | `rekrut` |

   `VITE_API_URL` tidak perlu diisi — mode simulasi tidak memanggilnya sama sekali.
4. Tekan **Deploy**. Selesai.

Yang didapat: 6 lowongan dan 70 pelamar langsung terlihat (dibuat sekali lewat skrip Node, lihat
README simulasi), pengunjung bisa melamar dan mengerjakan tes sungguhan, bisa masuk sebagai
`hr@demo.rekrut.id` / `demo12345` dan melihat dashboard lengkap — semuanya berjalan di
browser pengunjung sendiri, bukan di server Anda. Batasannya satu: hasil "pembacaan AI" untuk
CV yang diunggah pengunjung disimulasikan (diberi label jujur), karena memanggil Claude API
sungguhan butuh server. Rincian lengkap ada di `frontend/src/simulasi/README.md`.

### Uji setelah deploy

- [ ] Beranda menampilkan 4 lowongan terbuka (Kepala Toko, Kasir Outlet, Staf Gudang, Admin Penjualan).
- [ ] Buka `/rekruter` langsung di alamat (bukan lewat klik) → halaman masuk, bukan 404.
- [ ] Daftar sebagai pelamar baru → lamar salah satu lowongan → kerjakan tes → kirim.
- [ ] Masuk `hr@demo.rekrut.id` / `demo12345` → pelamar yang baru saja melamar muncul di dashboard.
- [ ] Tombol "Buka PDF asli" di kandidat data demo membuka PDF sungguhan (bukan 404).
- [ ] Ganti profil di bawah halaman, dan coba "Buat tampilan untuk perusahaan Anda".
- [ ] Coba semuanya sekali lagi dari HP.
- [ ] Buka tautan di jendela penyamaran (incognito) — ini yang akan dilihat orang asing dari media sosial, pastikan tidak ada bekas sesi Anda sendiri yang ikut terbawa.

## Versi B — demo lengkap dengan backend sungguhan (opsional)

Pakai ini kalau Anda ingin menunjukkan langsung ke calon klien bahwa ada backend,
database, dan AI sungguhan di baliknya — bukan untuk dibagikan bebas, karena backend
gratis tidur setelah 15 menit tanpa kunjungan.

### Batasan yang perlu diketahui sebelum mulai

1. **Disk Render free tidak permanen.** Berkas PDF CV hilang setiap kali backend tidur atau deploy ulang.
   Data di database (termasuk teks CV dan skor) tetap ada.
   Solusi di panduan ini: data demo dibuat ulang setiap backend menyala, jadi PDF demo selalu ada.
   PDF yang diunggah pengunjung tetap akan hilang. Solusi permanen: driver storage Supabase/S3 (belum dibuat).
2. **Kunjungan pertama setelah backend tidur lambat** (±1 menit).
3. **Belum ada pembatasan percobaan login.** Untuk demo berisi data fiktif ini bisa diterima; untuk situs klien harus ditambahkan dulu.
4. Parser AI dibiarkan mati (`ANTHROPIC_API_KEY` kosong) supaya pengunjung tidak memakan biaya API Anda.
5. **Render minta verifikasi kartu untuk membuat Web Service**, bahkan di paket gratis — ini bukan kejadian langka, dan tidak selalu bisa dihindari. Kalau Anda tidak punya kartu, lewati Versi B; Versi A sudah cukup untuk portofolio.

### 1. Database — Neon

1. Daftar di neon.com → **New Project** → region terdekat (Singapore).
2. Salin **connection string** (bentuknya `postgresql://user:pass@ep-....neon.tech/neondb?sslmode=require`).
3. Simpan; ini `DATABASE_URL`.

### 2. Backend — Render

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
| `CORS_ORIGIN` | alamat Vercel versi B (isi setelah langkah 3) |
| `ALLOW_REKRUTER_SIGNUP` | `true` |
| `STORAGE_DRIVER` | `local` |

Membuat rahasia acak di komputer sendiri:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`seed:demo` di Start Command menghapus lalu membuat ulang **hanya** akun `@demo.rekrut.id` setiap backend menyala.
Seeding 70 pelamar memakan ±10 detik (diukur di laptop; di Render free yang CPU-nya kecil bisa lebih lama), ditambahkan ke waktu bangun backend.

4. Cek: buka `https://<alamat-render>/health` → `{"status":"ok","database":"ok",...}`.

### 3. Frontend — Vercel (proyek Vercel terpisah dari Versi A)

Sama seperti Versi A, tapi:

| Nama | Nilai |
|---|---|
| `VITE_SIMULASI` | `false` (atau dihapus) |
| `VITE_API_URL` | alamat Render, tanpa `/` di akhir |
| `VITE_MODE_DEMO` | `true` |
| `VITE_PROFIL` | `rekrut` |

Deploy, salin alamat Vercel-nya, kembali ke Render, isi `CORS_ORIGIN`. Variabel
`VITE_*` dibaca saat **build** — mengubahnya di Vercel butuh **Redeploy**.

### Uji setelah deploy

Sama seperti daftar uji Versi A, ditambah:
- [ ] `/health` di Render menjawab `ok`.
- [ ] Console browser tanpa galat CORS.

## Situs untuk klien (nanti)

Untuk klien sungguhan, mulai dari Versi B lalu ubah:
- `VITE_MODE_DEMO=false`, `VITE_PROFIL=<id-klien>` (lihat [PROFIL_PERUSAHAAN.md](PROFIL_PERUSAHAAN.md)).
- `ALLOW_REKRUTER_SIGNUP=false`, dan Start Command **tanpa** `seed:demo`.
- Instance berbayar (tidak tidur) + storage permanen untuk PDF, dan rate limit login.
