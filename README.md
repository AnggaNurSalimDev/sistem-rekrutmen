# Sistem Rekrutmen

Sistem rekrutmen dengan scoring engine transparan, bank soal pilihan ganda yang bisa diisi sendiri oleh rekruter, parser CV berbasis AI yang setiap temuannya wajib didukung kutipan dari CV, dan integrity signals untuk ujian online.

Dokumentasi: [arsitektur](docs/RECRUITMENT_ARCHITECTURE.md) · [API contract](docs/API_CONTRACT.md) · [roadmap](docs/PROJECT_ROADMAP.md)

## Status

| Tahap | Isi | Status |
|---|---|---|
| 0 | API contract, struktur repo | Selesai |
| 1 | Server Express, skema database, storage privat, login & peran, CRUD lowongan, bank soal | Selesai |
| 2 | Scoring engine + penilaian soal pilihan ganda | Selesai |
| 3 | Parser CV: ekstraksi teks PDF, parser AI Claude, verifikasi kutipan, sorotan, kata kunci sorot per lowongan | Sebagian (belum diuji dengan API sungguhan) |
| 4 | Halaman kandidat: lowongan, lamaran + upload CV, tes pilihan ganda dengan integrity signals | Selesai |
| 5 | Dashboard rekruter: lowongan, bank soal, tabel kandidat + grafik + CSV, verifikasi CV dengan sorotan, keputusan | Selesai |
| 6 | Seeder data demo: 2 lowongan, 7 pelamar dengan skenario berbeda | Selesai |

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

Buka http://localhost:3000/health. Jika muncul `"status":"ok"` dan `"database":"ok"`, backend siap.

### 4. (Opsional) Aktifkan parser CV AI

Isi `ANTHROPIC_API_KEY` di `.env` dengan API key Claude milik Anda, lalu jalankan ulang server. Tanpa key, aplikasi tetap berjalan: CV diterima dan masuk antrean isi manual, dan `/health` menampilkan `"parserAi": false`. Biaya API ditanggung pemilik key; API ditagih terpisah dari langganan chat Claude ([cara membuat API key](https://platform.claude.com/docs/en/manage-claude/authentication)).

Server menolak menyala jika konfigurasi kurang atau database tidak bisa dihubungi, dan pesannya menyebut apa yang harus diperbaiki.

### 5. Jalankan frontend

Di terminal lain:

```bash
cd frontend
npm install
npm run dev
```

Buka http://localhost:5173. Frontend memanggil backend di `http://localhost:3000`; jika berbeda, salin `frontend/.env.example` menjadi `frontend/.env.local` dan ubah `VITE_API_URL`.

Cara tercepat mencoba: isi data demo, lalu masuk sebagai `hr@demo.rekrut.id` dengan password `demo12345`.

```bash
cd backend
npm run seed:demo
```

Seeder membuat lowongan **Kepala Toko** (5 pelamar: skor tinggi tapi sering keluar halaman, skor sedang yang sudah dicek HR, fresh graduate, CV hasil scan, pengalaman tanpa tanggal) dan **Kasir Outlet** (2 pelamar). Hanya akun `@demo.rekrut.id` yang disentuh; menjalankannya lagi menghapus dan membuat ulang data demo saja. Semua orang dan perusahaan di dalamnya fiktif, dan hasil baca CV-nya berlabel "contoh" karena ditulis tangan, bukan dibaca AI.

Cara mencoba dari nol:

1. Buat akun dengan peran **Rekruter**, lalu buat lowongan, isi soal tiap tes, dan buka lowongannya.
2. Keluar, buat akun kedua dengan peran **Pelamar** (pakai email lain), lalu lamar dan kerjakan tesnya.
3. Masuk lagi sebagai rekruter dan buka lowongan itu untuk melihat tabel kandidat, skor, dan CV.

## Test

```bash
npm test                  # 99 unit test (scoring engine + parser CV, tanpa database dan tanpa API)
npm run test:integration  # 89 test endpoint ke PostgreSQL sungguhan
npm run test:all          # keduanya
npm run lint
```

Test integrasi **mengosongkan** database di `TEST_DATABASE_URL` setiap kali berjalan. Sebagai pengaman, test menolak berjalan jika nama databasenya tidak mengandung kata `test`. Jika `.env.test` belum ada, test integrasi dilewati dengan pesan, bukan gagal.

Test parser AI **tidak memanggil Claude sungguhan** (memakai `fetch` palsu), jadi gratis dan tidak butuh key. Test ini membuktikan alur, verifikasi kutipan, dan penanganan error, tetapi bukan seberapa akurat Claude membaca CV.

Frontend:

```bash
cd frontend
npm test       # 48 test: logika ujian, sorotan kata kunci, tabel kandidat, ekspor CSV, form lowongan/soal/riwayat
npm run lint
npm run build
```

Uji ujung ke ujung alur pelamar di browser sungguhan (opsional, butuh backend + frontend berjalan dan Playwright):

```bash
cd frontend
npm i -D playwright && npx playwright install chromium
API_URL=http://localhost:3000 WEB_URL=http://localhost:5173 node e2e/alur-kandidat.mjs
```

Skrip ini membuat akun rekruter, lowongan, dan soal lewat API, lalu menjalankan: daftar → melamar dengan PDF → tes dengan satu kali pindah tab, muat ulang halaman, dan kamera palsu → kirim jawaban.

Alur rekruter butuh backend dengan **parser AI palsu** (tidak memanggil API apa pun; hanya mengenali PDF contoh di `backend/test/fixtures/pdf/`), supaya sorotan dan verifikasi CV bisa diuji tanpa API key:

```bash
cd backend && PORT=3100 CORS_ORIGIN=http://localhost:4173 PUBLIC_BASE_URL=http://localhost:3100 node scripts/server-ai-palsu.js
cd frontend && VITE_API_URL=http://localhost:3100 npm run build && npx vite preview --port 4173
API_URL=http://localhost:3100 WEB_URL=http://localhost:4173 node e2e/alur-rekruter.mjs
```

Isinya: buat lowongan lewat form (termasuk validasi bobot) → isi bank soal → buka lowongan → tiga pelamar via API → tabel, filter, cari, unduh CSV → detail kandidat: sorotan AI, cari kata kunci, konfirmasi CV, isi CV manual untuk PDF scan, terima/tolak → tampilan HP tidak melebar.

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
    routes/              health, auth, lowongan, soal, files
    storage/             storage disk lokal + signed URL
    scoring/             fungsi murni: skor kandidat, validasi, penilaian soal
    cv/                  PDF → teks, alur parser, verifikasi kutipan
    demo/                data demo (fiktif), PDF CV demo, logika seeder
      ai/                prompt, skema output, klien Claude Messages API
  scripts/
    buat-pdf-contoh.py   membuat ulang PDF contoh untuk test (butuh reportlab)
    server-ai-palsu.js   backend dengan parser AI palsu, khusus uji e2e (menolak jalan di produksi)
    seed-demo.js         isi data demo (npm run seed:demo)
    buat-cv-demo.py      membuat ulang PDF CV demo (butuh reportlab)
  test/
    *.test.js            unit test scoring engine dan parser CV
    fixtures/cv/         contoh teks CV (fiktif)
    fixtures/pdf/        contoh PDF: berteks dan hasil scan (fiktif)
    integration/         test endpoint dengan supertest + PostgreSQL
frontend/
  src/
    api/klien.js         pemanggil API + format error
    auth/                login, token, peran
    halaman/             lowongan, detail + form lamaran, masuk/daftar, lamaran saya, tes
      rekruter/          daftar & form lowongan, bank soal, tabel kandidat + grafik, detail kandidat, baca CV
    rekruter/            logika murni dashboard: sorotan, filter/urut, statistik, CSV, form
    ujian/               pelacak keluar fokus, kamera, pengacak opsi berbenih
  test/                  unit test (Vitest)
  e2e/                   uji ujung ke ujung alur pelamar dan rekruter (Playwright)
docs/
```

## Keputusan desain

**Scoring**
- **Skor sementara sampai HR memverifikasi CV.** Hasil parser langsung dipakai untuk skor supaya HR bisa mengurutkan kandidat sejak awal, tetapi selalu berlabel "belum diverifikasi" sampai HR menekan konfirmasi.
- **Data belum lengkap → `null`, bukan 0.** Kandidat yang belum ujian atau CV-nya gagal diekstrak tidak terlihat buruk; dashboard menampilkan "belum lengkap".
- **Fresh graduate → Tenure 50 (netral) + flag `tanpa_riwayat_kerja`.** Guard ditaruh sebelum pembagian karena `0 / 0` di JavaScript menghasilkan `NaN`, yang tanpa guard jatuh ke cabang skor 100.
- **Pengalaman tanpa tanggal → Tenure 50 + flag `lama_kerja_tidak_disebut`**, bukan dianggap fresh graduate. Banyak CV asli menyebut tempat kerja tanpa tahun; sistem tidak menebaknya.
- **Pembulatan hanya sekali di akhir**, supaya selisih pembulatan tidak menumpuk.
- **AI hanya mengekstrak**; semua hitungan (bulan kerja, pencocokan skill) dilakukan di kode yang bisa diuji.

**Bank soal**
- **Soal adalah data, bukan kode.** Rekruter membuat soal pilihan ganda sendiri lewat API; scoring engine tidak berubah.
- **Kunci jawaban tidak pernah dikirim ke browser kandidat.**
- **Soal yang sudah dijawab dikunci**: tidak bisa diubah atau dihapus, hanya dinonaktifkan. Jika tidak, mengganti kunci jawaban akan mengubah arti skor kandidat lama tanpa ada yang sadar. Database ikut menjaga ini (`ON DELETE RESTRICT`).
- **Konfigurasi tes hanya bisa diubah saat lowongan berstatus draf.** Lowongan draf pasti belum punya pelamar.

**Parser CV**
- **AI mengekstrak, backend memeriksa.** Setiap temuan AI wajib membawa kutipan persis dari CV. Kutipan yang tidak ada di CV, nama perusahaan yang tidak tertulis, dan tanggal yang tahunnya tidak terlihat di kutipan dibuang atau dikosongkan. Ini penangkal utama AI yang mengarang.
- **Tanggal tidak pernah ditebak.** CV tanpa tanggal kerja menghasilkan entri "tanpa tanggal", bukan tanggal karangan.
- **Teks CV adalah data, bukan perintah.** Prompt melarang AI mengikuti instruksi di dalam CV, tag `<cv>` tidak bisa ditutup dari dalam CV, dan kalimat seperti "abaikan semua instruksi" ditandai untuk HR.
- **Parser tidak pernah menolak lamaran.** AI mati, gagal, atau ragu → CV masuk antrean tinjauan/isi manual.
- **Fitur AI opsional.** Tanpa API key (misalnya demo publik), semua fitur lain tetap berjalan. Halaman web tidak pernah meminta API key dari pengunjung.
- **Kata kunci sorot dari rekruter.** Rekruter menulis kata atau kalimat yang dicari di setiap CV lowongan; penyorotannya di frontend dan tidak memengaruhi skor.
- *Riwayat:* parser regex sempat dibuat, lalu diganti setelah diuji dengan CV asli yang ditulis sebagai kalimat dan tanpa tanggal. Kodenya ada di riwayat git.

**Tes pelamar**
- **Satu kali pindah tab = satu episode**, walau browser memicu beberapa event. Memuat ulang halaman juga dihitung, dan catatannya tidak hilang karena disimpan di perangkat. Server ikut menghitung berapa kali halaman tes dibuka ulang, terpisah dari catatan browser.
- **Kamera tidak pernah memblokir tes.** Ditolak, tidak ada, atau tidak didukung: tes tetap berjalan, statusnya dicatat. Video hanya tampil di layar pelamar.
- **Pelamar diberi tahu sebelum tes** apa saja yang dicatat. Skor dan catatan integritas tidak ditampilkan ke pelamar.
- **Urutan opsi diacak per pelamar** dengan benih tetap, jadi tidak berubah saat halaman dimuat ulang. Draf jawaban juga tersimpan saat dimuat ulang.
- **Soal dinilai sesuai yang dilihat pelamar**, walau rekruter mengubah bank soal di tengah tes.

**Dashboard rekruter**
- **Skor yang belum pasti selalu terlihat berbeda.** Selama CV belum dicek HR, skor diberi stempel kuning "Sementara" di tabel, detail, dan kolom CSV sendiri.
- **Antrean verifikasi tanpa halaman terpisah.** Filter "Perlu dicek HR" di tabel, dan setelah konfirmasi ada tautan ke CV berikutnya yang belum dicek (skor tertinggi dulu).
- **Dua lapis sorotan di CV**: temuan AI (garis bawah biru, hanya yang kutipannya terbukti) dan kata kunci rekruter (stabilo kuning, dicari di browser, kata utuh, tanpa beda huruf besar). Jumlah kemunculan tiap kata kunci ditampilkan, termasuk "tidak ada".
- **Data integritas ditampilkan sebagai petunjuk**, dengan kalimat bahwa itu bukan bukti kecurangan.
- **Bobot tes diatur rekruter, bobot skor akhir tetap.** Satu tes otomatis 100% (tidak bisa diubah); menambah atau menghapus tes membagi bobot rata lagi, lalu rekruter boleh mengubahnya selama jumlahnya 100%. Form menampilkan rumusnya dengan angka yang sedang diisi, dan halaman kandidat menampilkan perhitungan skornya langkah demi langkah. Lima bobot skor akhir (30/20/30/10/10) sama untuk semua lowongan supaya skor antarlowongan bisa dibandingkan.
- **Setelah masuk, pengguna hanya diarahkan ke halaman milik perannya.** Alamat tujuan dari `?ke=` diabaikan jika milik peran lain, dan tombol Keluar pindah ke halaman publik dulu.
- **CSV dibuat di browser** dengan pemisah titik koma dan BOM (Excel Indonesia), dan sel yang diawali `=` `+` `-` `@` dinetralkan karena nama pelamar bisa berisi rumus.

**Keamanan**
- Peran user dibaca dari database setiap request, bukan dari token, sehingga token lama tidak bisa dipakai untuk menaikkan hak akses.
- Data milik rekruter lain dijawab 404, bukan 403, supaya keberadaannya tidak bocor.
- Pesan login gagal sama untuk email tak terdaftar dan password salah, dan waktu responsnya disamakan.
- Berkas CV hanya bisa dibaca lewat URL bertanda tangan yang kedaluwarsa dalam 5 menit.
- Password di-hash dengan `scrypt` bawaan Node, tanpa modul native yang sering gagal di-install.

## Batasan yang diketahui

- **Belum ada pembatasan percobaan login (rate limit).** Perlu ditambahkan sebelum dipakai publik.
- **Pendaftaran rekruter terbuka** (`ALLOW_REKRUTER_SIGNUP=true`) supaya calon klien bisa mencoba demo. Di produksi sebaiknya `false`, dan akun rekruter dibuat lewat undangan.
- Jika AI aktif, teks CV dikirim ke Anthropic. Formulir lamaran (Tahap 4) wajib meminta persetujuan untuk ini.
- Token login disimpan di `localStorage`. Praktis untuk demo, tetapi rentan jika ada celah XSS; untuk produksi sebaiknya cookie `httpOnly`.
- Lamaran diproses langsung saat dikirim; jika AI aktif, pelamar menunggu beberapa detik. Untuk volume besar sebaiknya dipindah ke antrean kerja di latar belakang.
- Storage baru mendukung disk lokal. Untuk deploy di server tanpa disk permanen, perlu driver S3/Supabase.
- Menambah soal ke tes yang sedang dibuka mengubah total poin untuk kandidat **berikutnya**. Skor kandidat yang sudah mengirim ujian tidak berubah karena disimpan saat dikirim.

## Asumsi yang belum diuji dengan data nyata

- Bobot 30/20/30/10/10 dan ambang tenure 6/12 bulan adalah tebakan awal, belum divalidasi terhadap hasil rekrutmen sungguhan.
- Durasi kerja dihitung inklusif (Jan–Jun = 6 bulan). Dua pekerjaan yang waktunya tumpang tindih dijumlahkan apa adanya, tidak digabung.
- Kamus alias skill di scoring engine masih kecil dan perlu ditambah sesuai CV yang masuk.
- **Akurasi Claude membaca CV belum diukur.** Belum pernah dipanggil dengan API sungguhan; semua test memakai jawaban AI palsu. Akurasi baru diketahui di task 3.7.
- CV hasil scan/foto tidak bisa dibaca (belum ada OCR) dan selalu masuk antrean tinjauan manual.
