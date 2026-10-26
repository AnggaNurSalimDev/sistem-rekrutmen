# Sistem Rekrutmen

Sistem rekrutmen dengan scoring engine transparan, bank soal pilihan ganda yang bisa diisi sendiri oleh rekruter, parser CV yang bisa memakai regex, AI, atau keduanya, dan integrity signals untuk ujian online.

Dokumentasi: [arsitektur](docs/RECRUITMENT_ARCHITECTURE.md) · [API contract](docs/API_CONTRACT.md) · [roadmap](docs/PROJECT_ROADMAP.md)

## Status

| Tahap | Isi | Status |
|---|---|---|
| 0 | API contract | Selesai (folder frontend menyusul di Tahap 4) |
| 1 | Server Express, skema database, storage privat, login & peran, CRUD lowongan, bank soal | Selesai |
| 2 | Scoring engine + penilaian soal pilihan ganda | Selesai |
| 3 | Parser CV: ekstraksi teks PDF, parser regex dengan paket kamus (Kru Outlet) dan sorotan untuk HR, orkestrator mode regex/ai/gabungan | Sebagian (parser AI dan uji dengan CV asli belum) |
| 4–6 | Halaman kandidat & rekruter, seeder | Belum |

## Menjalankan di komputer sendiri

Butuh **Node.js 20+** dan **PostgreSQL 14+**.

### 1. Siapkan PostgreSQL (Ubuntu / Linux Mint)

```bash
sudo apt install postgresql
sudo -u postgres psql -c "CREATE USER rekrutmen WITH PASSWORD 'rekrutmen';"
sudo -u postgres createdb -O rekrutmen rekrutmen
sudo -u postgres createdb -O rekrutmen rekrutmen_test
```

### 2. Siapkan backend

```bash
cd backend
npm install
cp .env.example .env
cp .env.test.example .env.test
```

Isi `JWT_SECRET` dan `STORAGE_SIGNING_SECRET` di `.env` dengan dua nilai acak yang **berbeda**. Jalankan perintah ini dua kali untuk mendapatkannya:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Buat tabel dan jalankan

```bash
npm run migrate
npm run dev
```

Buka http://localhost:3000/health. Jika muncul `{"status":"ok","database":"ok"}`, backend siap.

Server menolak menyala jika konfigurasi kurang atau database tidak bisa dihubungi, dan pesannya menyebut apa yang harus diperbaiki.

## Test

```bash
npm test                  # 111 unit test (scoring engine + parser CV, tanpa database)
npm run test:integration  # 48 test endpoint ke PostgreSQL sungguhan
npm run test:all          # keduanya
npm run lint
```

Test integrasi **mengosongkan** database di `TEST_DATABASE_URL` setiap kali berjalan. Sebagai pengaman, test menolak berjalan jika nama databasenya tidak mengandung kata `test`. Jika `.env.test` belum ada, test integrasi dilewati dengan pesan, bukan gagal.

## Struktur

```
backend/
  src/
    server.js            titik masuk: config → database → app → listen
    app.js               menyusun Express (bisa diuji tanpa listen)
    config.js            validasi environment
    db/
      migrations/        file SQL berurutan (001_skema_awal.sql, ...)
      migrate.js         runner migrasi (advisory lock, satu transaksi per file)
      pool.js            koneksi + helper transaksi
    auth/                hash password (scrypt), JWT, requireAuth, requireRole
    http/                format error, validasi body (zod)
    routes/              health, auth, lowongan, soal, files, paket-kamus
    storage/             storage disk lokal + signed URL
    scoring/             fungsi murni: skor kandidat, validasi, penilaian soal
    cv/                  PDF → teks, parser regex, orkestrator mode parser
      paket/             paket kamus per bidang (teknologi-perkantoran, kru-outlet)
  scripts/
    buat-pdf-contoh.py   membuat ulang PDF contoh untuk test (butuh reportlab)
  test/
    *.test.js            unit test scoring engine dan parser CV
    fixtures/cv/         contoh teks CV beragam format (fiktif)
    fixtures/pdf/        contoh PDF: berteks dan hasil scan (fiktif)
    integration/         test endpoint dengan supertest + PostgreSQL
docs/
```

## Keputusan desain

**Scoring**
- **Skor sementara sampai HR memverifikasi CV.** Hasil parser langsung dipakai untuk skor supaya HR bisa mengurutkan kandidat sejak awal, tetapi selalu berlabel "belum diverifikasi" sampai HR menekan konfirmasi.
- **Data belum lengkap → `null`, bukan 0.** Kandidat yang belum ujian atau CV-nya gagal diekstrak tidak terlihat buruk; dashboard menampilkan "belum lengkap".
- **Fresh graduate → Tenure 50 (netral) + flag `tanpa_riwayat_kerja`.** Guard ditaruh sebelum pembagian karena `0 / 0` di JavaScript menghasilkan `NaN`, yang tanpa guard jatuh ke cabang skor 100.
- **Pembulatan hanya sekali di akhir**, supaya selisih pembulatan tidak menumpuk.
- **LLM hanya mengekstrak**; semua hitungan (bulan kerja, pencocokan skill) dilakukan di kode yang bisa diuji.

**Bank soal**
- **Soal adalah data, bukan kode.** Rekruter membuat soal pilihan ganda sendiri lewat API; scoring engine tidak berubah.
- **Kunci jawaban tidak pernah dikirim ke browser kandidat.**
- **Soal yang sudah dijawab dikunci**: tidak bisa diubah atau dihapus, hanya dinonaktifkan. Jika tidak, mengganti kunci jawaban akan mengubah arti skor kandidat lama tanpa ada yang sadar. Database ikut menjaga ini (`ON DELETE RESTRICT`).
- **Konfigurasi tes hanya bisa diubah saat lowongan berstatus draf.** Lowongan draf pasti belum punya pelamar.

**Parser CV**
- **Tiga mode, satu bentuk output.** `regex` (gratis, lokal, bisa dijelaskan), `ai`, atau `gabungan` (AI hanya untuk CV yang membuat regex ragu). Scoring engine tidak tahu dan tidak perlu tahu sumbernya.
- **Parser tidak pernah menolak lamaran.** CV yang meragukan diberi status `perlu_tinjau` beserta alasannya (misalnya "2 rentang kerja hanya menyebut tahun"), lalu dikoreksi HR.
- **Paket kamus per bidang.** Regex hanya menemukan apa yang ada di kamusnya, jadi HR memilih paket sesuai lowongan. Paket Kru Outlet juga mengenali merek seperti Indomaret atau Kopi Kenangan sebagai tempat kerja, dan menyorot hal non-skill seperti SIM C atau "bersedia kerja shift".
- **Sorotan untuk HR.** Setiap temuan disimpan beserta posisinya di teks CV, tanpa tumpang tindih, sehingga frontend cukup mewarnainya.
- **Bagian CV dikenali.** Tanggal di bagian Pendidikan dan Pengalaman Organisasi tidak dihitung sebagai pengalaman kerja.
- **Longest match untuk skill.** "Tailwind CSS" tidak ikut menghasilkan "CSS". Akibatnya, kandidat yang hanya menulis "Tailwind CSS" tidak dianggap punya skill "CSS"; jika HR menganggapnya setara, tambahkan alias.

**Keamanan**
- Peran user dibaca dari database setiap request, bukan dari token, sehingga token lama tidak bisa dipakai untuk menaikkan hak akses.
- Data milik rekruter lain dijawab 404, bukan 403, supaya keberadaannya tidak bocor.
- Pesan login gagal sama untuk email tak terdaftar dan password salah, dan waktu responsnya disamakan.
- Berkas CV hanya bisa dibaca lewat URL bertanda tangan yang kedaluwarsa dalam 5 menit.
- Password di-hash dengan `scrypt` bawaan Node, tanpa modul native yang sering gagal di-install.

## Batasan yang diketahui

- **Belum ada pembatasan percobaan login (rate limit).** Perlu ditambahkan sebelum dipakai publik.
- **Pendaftaran rekruter terbuka** (`ALLOW_REKRUTER_SIGNUP=true`) supaya calon klien bisa mencoba demo. Di produksi sebaiknya `false`, dan akun rekruter dibuat lewat undangan.
- Storage baru mendukung disk lokal. Untuk deploy di server tanpa disk permanen, perlu driver S3/Supabase.
- Menambah soal ke tes yang sedang dibuka mengubah total poin untuk kandidat **berikutnya**. Skor kandidat yang sudah mengirim ujian tidak berubah karena disimpan saat dikirim.

## Asumsi yang belum diuji dengan data nyata

- Bobot 30/20/30/10/10 dan ambang tenure 6/12 bulan adalah tebakan awal, belum divalidasi terhadap hasil rekrutmen sungguhan.
- Durasi kerja dihitung inklusif (Jan–Jun = 6 bulan). Dua pekerjaan yang waktunya tumpang tindih dijumlahkan apa adanya, tidak digabung.
- Kamus alias skill masih kecil dan perlu ditambah sesuai CV yang masuk.
- **Akurasi parser regex belum diukur dengan CV asli.** Semua contoh di `test/fixtures` dibuat sendiri, jadi lulusnya test hanya membuktikan parser bekerja untuk format yang sudah diantisipasi. Akurasi sebenarnya baru diketahui di task 3.6 dengan minimal 5 CV asli yang dianonimkan.
- CV hasil scan/foto tidak bisa dibaca (belum ada OCR) dan selalu masuk antrean tinjauan manual.
