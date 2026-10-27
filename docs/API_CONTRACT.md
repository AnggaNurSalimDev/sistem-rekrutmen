# API_CONTRACT.md

Kontrak antara frontend dan backend. Semua body dan respons berformat JSON, kecuali `/files`.

## Aturan umum

- **Autentikasi:** header `Authorization: Bearer <token>`. Token didapat dari `/auth/register` atau `/auth/login`, berlaku 8 jam (`JWT_EXPIRES_IN`).
- **Peran** diambil dari database setiap request, bukan dari isi token. Mengubah peran di token tidak berpengaruh.
- **Field asing ditolak.** Body dengan field yang tidak dikenal → 400 (mencegah salah ketik diam-diam).
- **Data milik rekruter lain** dijawab 404, bukan 403, supaya keberadaannya tidak bocor. `:id` yang bukan UUID juga 404.
- **Uang** (budget, gaji) dalam rupiah, bilangan bulat.
- **Format error:**
  ```json
  { "error": { "kode": "VALIDASI", "pesan": "Data tidak valid", "detail": [{ "field": "email", "pesan": "..." }] } }
  ```
  `detail` dan `field` hanya ada jika relevan.

| Status | `kode` | Arti |
|---|---|---|
| 400 | `VALIDASI` | Bentuk data salah atau melanggar invariant |
| 401 | `TIDAK_TERAUTENTIKASI`, `LOGIN_GAGAL` | Belum login, token tidak valid/kedaluwarsa, atau login salah |
| 403 | `DILARANG` | Login benar, tapi peran tidak punya akses |
| 404 | `TIDAK_DITEMUKAN`, `RUTE_TIDAK_ADA` | Data tidak ada / bukan milik Anda / endpoint tidak ada |
| 409 | `KONFLIK`, `EMAIL_TERPAKAI` | Aksi bertentangan dengan keadaan data saat ini |
| 413 | `TERLALU_BESAR` | Body lebih dari 100 KB |
| 500 | `INTERNAL` | Bug di server (detail hanya di log server) |

---

## Health

### `GET /health` — publik
- 200 `{ "status": "ok", "database": "ok", "fitur": { "parserAi": false } }`
- `fitur.parserAi` = apakah parser CV AI aktif (ada `ANTHROPIC_API_KEY`). Frontend memakainya untuk menampilkan "Parser AI tidak aktif di demo".
- 503 jika database tidak terhubung.

---

## Auth

### `POST /auth/register` — publik
Body:
```json
{ "email": "angga@contoh.id", "password": "minimal8", "nama": "Angga", "role": "kandidat" }
```
- `role`: `kandidat` | `rekruter`. Rekruter hanya bisa daftar sendiri jika `ALLOW_REKRUTER_SIGNUP=true` (default untuk demo).
- Email disimpan huruf kecil tanpa spasi. Password 8–200 karakter.
- 201 `{ "user": User, "token": "..." }`
- 400 data salah · 403 pendaftaran rekruter ditutup · 409 `EMAIL_TERPAKAI`

### `POST /auth/login` — publik
Body: `{ "email", "password" }`
- 200 `{ "user": User, "token": "..." }`
- 401 `LOGIN_GAGAL`. Pesannya sama untuk email tak terdaftar dan password salah.

### `GET /auth/me` — login
- 200 `{ "user": User }`

`User` = `{ id, email, nama, role }`

---

## Lowongan — khusus `rekruter`, hanya milik sendiri

`Lowongan`:
```json
{
  "id": "uuid", "posisi": "Frontend Developer", "budgetMaksimal": 8000000,
  "skillWajib": ["React"], "skillOpsional": ["TypeScript"],
  "kebutuhanWaktu": "Senin–Jumat 09.00–17.00",
  "kataKunciSorot": ["SIM C", "bersedia kerja shift"],
  "status": "draf | buka | tutup", "jumlahPelamar": 0,
  "dibuatPada": "ISO-8601", "diubahPada": "ISO-8601",
  "tes": [Tes]
}
```
`Tes` = `{ id, jenisTes, targetSkor, batasBawah, bobot, urutan, jumlahSoal, jumlahSoalAktif }`

`tes` tidak disertakan di daftar (`GET /lowongan`), hanya di detail.

### Aturan lowongan
- Lowongan baru selalu berstatus `draf`.
- **Konfigurasi tes hanya bisa diubah saat `draf`.** Lowongan draf pasti belum punya pelamar, jadi tidak ada skor kandidat yang berubah.
- **Membuka** (`buka`) mensyaratkan: semua invariant lowongan lolos (skill wajib ≥ 1, budget > 0, target > batas bawah, jumlah bobot = 1) dan setiap tes punya minimal 1 soal aktif.
- Kembali ke `draf` dan menghapus hanya boleh jika belum ada pelamar. Lowongan dengan pelamar cukup ditutup.

| Transisi | Syarat |
|---|---|
| draf → buka | invariant + setiap tes punya soal aktif |
| buka → tutup | — |
| tutup → buka | sama seperti draf → buka |
| buka/tutup → draf | belum ada pelamar |
| draf → tutup | tidak diizinkan (409) |

### `GET /lowongan`
- 200 `{ "data": [Lowongan tanpa tes] }`, terbaru dulu.

### `POST /lowongan`
Body:
```json
{
  "posisi": "Frontend Developer", "budgetMaksimal": 8000000,
  "skillWajib": ["React", "JavaScript"], "skillOpsional": [],
  "kebutuhanWaktu": "Senin–Jumat 09.00–17.00",
  "kataKunciSorot": ["SIM C", "bersedia kerja shift"],
  "tes": [
    { "jenisTes": "logika", "targetSkor": 80, "batasBawah": 40, "bobot": 0.4 },
    { "jenisTes": "coding", "targetSkor": 90, "batasBawah": 50, "bobot": 0.6 }
  ]
}
```
- `kataKunciSorot`: opsional (default `[]`), maksimal 50 item, masing-masing 1–100 karakter, tanpa duplikat (tanpa membedakan huruf besar). Kata atau kalimat yang disorot frontend di setiap CV lowongan ini. Tidak memengaruhi skor, dan boleh diubah di status apa pun.
- `tes`: 1–10 item, `jenisTes` unik (tanpa membedakan huruf besar), skor 0–100, `bobot` > 0, jumlah bobot = 1 (toleransi 0,001).
- 201 `{ "data": Lowongan }` · 400 pelanggaran invariant (pesan menyebut masalahnya)

### `GET /lowongan/:id`
- 200 `{ "data": Lowongan }` · 404

### `PUT /lowongan/:id`
Body sama seperti `POST`. `kataKunciSorot` **opsional**: jika tidak dikirim, daftar lama dipertahankan. `tes` **opsional**:
- Tanpa `tes`: hanya data umum yang diubah (boleh di status apa pun).
- Dengan `tes` (hanya saat `draf`): daftar lengkap tes yang diinginkan. Item dengan `id` = ubah, tanpa `id` = tambah, tes lama yang tidak disebut = hapus. Nama boleh bertukar dalam satu request.
- 200 `{ "data": Lowongan }`
- 400 invariant / `id` tes bukan milik lowongan ini
- 409 mengubah tes di luar `draf` / menghapus tes yang masih punya soal

### `PATCH /lowongan/:id/status`
Body: `{ "status": "buka" }`
- 200 `{ "data": Lowongan }` (status sama dengan sekarang = tidak ada perubahan)
- 400 invariant · 409 syarat transisi tidak terpenuhi (pesan menyebut tes mana yang belum punya soal)

### `DELETE /lowongan/:id`
- 204 (tes dan soal ikut terhapus) · 409 sudah ada pelamar

---

## Bank soal — khusus `rekruter`, hanya milik sendiri

`Soal`:
```json
{
  "id": "uuid", "tesId": "uuid", "pertanyaan": "Berapa 2 + 2?",
  "opsi": [{ "id": "a", "teks": "4" }, { "id": "b", "teks": "5" }],
  "kunciOpsiId": "a", "poin": 1, "urutan": 0, "aktif": true, "terkunci": false
}
```

### Aturan soal
- 2–6 opsi, `id` opsi unik (1–20 karakter, ditentukan frontend), teks tidak kosong, `kunciOpsiId` harus salah satu `id` opsi, `poin` > 0 (default 1).
- **`terkunci`** = sudah pernah dijawab kandidat. Soal terkunci tidak bisa diubah atau dihapus; hanya bisa dinonaktifkan. Untuk mengganti isinya, buat soal baru. Nilai ini dihitung dari data jawaban, bukan disimpan terpisah.
- Pada lowongan berstatus `buka`, soal aktif terakhir di sebuah tes tidak bisa dinonaktifkan atau dihapus.

### `GET /tes/:tesId/soal`
- 200 `{ "data": [Soal] }`, urut `urutan`. Termasuk kunci jawaban (rekruter saja).

### `GET /tes/:tesId/soal/pratinjau`
Tampilan seperti yang akan dilihat kandidat.
- 200 `{ "data": [{ "id", "pertanyaan", "opsi": [{ "id", "teks" }] }] }` — tanpa kunci, poin, dan soal nonaktif.

### `POST /tes/:tesId/soal`
Body: `{ "pertanyaan", "opsi", "kunciOpsiId", "poin"?, "urutan"? }`
- Tanpa `urutan` → ditaruh paling akhir.
- 201 `{ "data": Soal }` · 400

### `PUT /tes/:tesId/soal/urutan`
Body: `{ "urutan": ["uuid-soal", ...] }` — berisi **semua** soal di tes itu, masing-masing tepat satu kali. Boleh untuk soal terkunci (urutan tidak memengaruhi skor).
- 204 · 400 daftar tidak lengkap/ganda

### `GET /soal/:id`
- 200 `{ "data": Soal }`

### `PUT /soal/:id`
Body sama seperti `POST`.
- 200 `{ "data": Soal }` · 400 · 409 soal terkunci

### `PATCH /soal/:id/aktif`
Body: `{ "aktif": false }`. Boleh untuk soal terkunci.
- 200 `{ "data": Soal }` · 409 soal aktif terakhir di lowongan terbuka

### `DELETE /soal/:id`
- 204 · 409 soal terkunci / soal aktif terakhir di lowongan terbuka

---

## Berkas

### `GET /files/<kunci>?exp=<unix>&sig=<hex>` — publik dengan tanda tangan
URL ini dibuat server (berlaku `SIGNED_URL_TTL_SECONDS`, default 5 menit) dan dikirim ke rekruter saat melihat CV. Folder storage tidak pernah disajikan langsung.
- 200 isi berkas (`Cache-Control: private, no-store`)
- 404 untuk semua kegagalan: tanda tangan salah, kedaluwarsa, berkas tidak ada. Alasannya sengaja tidak dibedakan.

---

## Lowongan terbuka — publik (tanpa login)

Untuk calon pelamar. Sengaja tidak memuat budget, kata kunci sorot, target/batas bawah/bobot tes.

### `GET /lowongan-terbuka`
- 200 `{ "data": [LowonganTerbuka] }`, terbaru dulu. Hanya status `buka`.

`LowonganTerbuka` = `{ id, posisi, skillWajib, skillOpsional, kebutuhanWaktu, dibuatPada, tes: [{ id, jenisTes, jumlahSoal }] }`

### `GET /lowongan-terbuka/:id`
- 200 `{ "data": LowonganTerbuka }` · 404 (termasuk lowongan draf/tutup)

---

## Lamaran — khusus `kandidat`, hanya milik sendiri

`Lamaran` (tampilan kandidat):
```json
{
  "id": "uuid",
  "lowongan": { "id": "uuid", "posisi": "Kasir", "status": "buka" },
  "statusAplikasi": "dilamar | ujian | selesai | ditolak | diterima",
  "dikirimPada": "ISO-8601",
  "tes": [{ "id": "uuid", "jenisTes": "logika", "status": "belum | berlangsung | selesai" }]
}
```
Skor, rincian skor, hasil ekstraksi CV, dan data integritas **tidak pernah** dikirim ke kandidat.

### `POST /lamaran` — `multipart/form-data`
| Field | Isi |
|---|---|
| `lowonganId` | UUID lowongan berstatus `buka` |
| `nama` | 1–120 karakter |
| `nomorKontak` | 8–20 karakter: angka, spasi, `+`, `-`, `()` |
| `ekspektasiGaji` | bilangan bulat ≥ 0 (rupiah) |
| `ketersediaanWaktu` | `penuh` \| `sebagian` \| `tidak` (jawaban atas `kebutuhanWaktu` lowongan) |
| `persetujuanData` | harus `"true"` |
| `cv` | berkas PDF, maksimal 10 MB |

Email diambil dari akun yang login. Proses: CV disimpan (privat) → teks diekstrak → parser AI (jika aktif) → data CV dan skor awal disimpan. Bisa memakan waktu beberapa detik jika AI aktif.

- 201 `{ "data": Lamaran }`. PDF hasil scan atau AI gagal **tetap 201**; CV-nya masuk antrean tinjauan HR.
- 400 data tidak valid / bukan PDF / tanpa CV / persetujuan tidak dicentang
- 404 lowongan tidak ada atau masih draf · 409 lowongan ditutup / sudah pernah melamar · 413 CV > 10 MB

### `GET /lamaran`
- 200 `{ "data": [Lamaran] }`, terbaru dulu.

### `GET /lamaran/:id`
- 200 `{ "data": Lamaran }` · 404 (termasuk lamaran milik orang lain)

---

## Ujian — khusus `kandidat`, hanya lamaran sendiri

### `POST /lamaran/:id/ujian/:tesId/mulai`
Membuat sesi ujian dan mengembalikan soalnya. Memanggil ulang (misalnya halaman dimuat ulang) mengembalikan sesi yang sama; waktu mulai tidak diulang, dan server menambah hitungan "dibuka ulang" yang ikut tercatat di log integritas.
- 200:
  ```json
  { "data": { "tesId": "uuid", "jenisTes": "logika", "dimulaiPada": "ISO-8601",
      "soal": [{ "id": "uuid", "pertanyaan": "...", "opsi": [{ "id": "a", "teks": "..." }] }] } }
  ```
  Tanpa kunci jawaban, poin, atau status aktif. Urutan opsi diacak oleh frontend.
- 404 lamaran/tes tidak ada · 409 ujian sudah dikirim / lowongan ditutup (untuk sesi baru) / tes tanpa soal

Soal yang ditampilkan dicatat di sesi. Penilaian memakai soal itu walau rekruter mengubah bank soal di tengah ujian.

### `POST /lamaran/:id/ujian/:tesId/kirim`
Body:
```json
{
  "jawaban": [{ "soalId": "uuid", "opsiDipilih": "a" }],
  "integritas": {
    "statusKamera": "granted | denied | hardware_not_found | not_supported",
    "episodeKeluarFokus": [{ "detik": 4.2 }]
  }
}
```
- `jawaban`: maksimal 500; `opsiDipilih` boleh `null`. Soal yang tidak dijawab dihitung salah.
- `integritas` wajib. Satu episode = satu kali keluar fokus (pindah tab/jendela), berapa pun event browser yang terpicu. `detik` 0–86400, maksimal 1000 episode. Total detik dipotong agar tidak melebihi lama ujian (dicatat di log).
- Skor dinilai di server, disimpan, dan skor akhir kandidat dihitung ulang. Setelah semua tes dikirim, `statusAplikasi` menjadi `selesai`.
- 200 `{ "data": { "terkirim": true, "dikirimPada": "ISO-8601" } }`. Skor **tidak** dikirim ke kandidat.
- 400 jawaban untuk soal di luar sesi / opsi tidak ada / jawaban dobel / integritas tidak valid
- 404 · 409 ujian belum dimulai / sudah dikirim

---

## Kandidat — khusus `rekruter`, hanya pelamar di lowongan milik sendiri

### `GET /lowongan/:id/kandidat`
- 200 `{ "data": [BarisKandidat] }`, terbaru dulu. 404 lowongan bukan milik Anda.

```json
{
  "id": "uuid", "nama": "...", "email": "...", "nomorKontak": "...",
  "ekspektasiGaji": 4200000, "ketersediaanWaktu": "penuh",
  "statusAplikasi": "dilamar | ujian | selesai | ditolak | diterima", "dikirimPada": "ISO-8601",
  "skorAkhir": 72.5,
  "skor": { "status": "lengkap | belum_lengkap | galat", "sementara": true,
            "komponen": { "cv": 100, "tenure": 50, "tes": 60, "anggaran": 100, "waktu": 100 },
            "flags": ["lama_kerja_tidak_disebut"] },
  "cv": { "statusEkstraksi": "menunggu | berhasil | perlu_tinjau | gagal", "terverifikasi": false, "sumber": "ai | manual | contoh | null" },
  "integritas": { "statusKamera": "granted", "jumlahKeluarFokus": 2, "totalDetikKeluarFokus": 14, "dibukaUlang": 1 },
  "ujian": [{ "tesId": "uuid", "skor": 50, "durasiDetik": 412 }]
}
```
`skorAkhir` terisi walau `skor.sementara = true`; dashboard **wajib** memberi label "belum diverifikasi". `integritas` = `null` sebelum ada tes yang dikirim.

### `GET /kandidat/:id`
Semua `BarisKandidat`, ditambah:
- `lowongan`: `{ id, posisi, kataKunciSorot, skillWajib, skillOpsional, budgetMaksimal, kebutuhanWaktu }`
- `rincianSkor`: hasil lengkap scoring engine (komponen, flags, detail per komponen)
- `cv`: `{ statusEkstraksi, sumber, terverifikasi, diverifikasiPada, alasanTinjau, teks, sorotan: [{awal, akhir, kategori, label}], skills, riwayatKerja, rincianAi, urlPdf }`. `urlPdf` berlaku 5 menit. `sumber = contoh` hanya ada di data demo: hasil baca CV ditulis tangan, bukan dari AI; dashboard wajib memberi label.
- `tes`: `[{ id, jenisTes, targetSkor, batasBawah, bobot, hasil: { skor, durasiDetik, dikirimPada } | null, jawaban: [{ soalId, pertanyaan, opsi, kunciOpsiId, opsiDipilih, benar }] }]`
- `integritasLengkap`: `{ statusKamera, jumlahKeluarFokus, totalDetikKeluarFokus, log }` atau `null`

### `POST /kandidat/:id/cv/konfirmasi`
HR menyatakan hasil parser benar. Label sementara hilang, skor dihitung ulang.
- 200 `{ "data": RingkasSkor }` (idempoten) · 409 CV `menunggu`/`gagal` (belum ada data, pakai koreksi)

### `PUT /kandidat/:id/cv`
Koreksi atau isi manual data CV. Data dari HR menggantikan hasil parser (`sumber = manual`, `terverifikasi = true`).
```json
{
  "skills": ["Pelayanan Pelanggan", "Kasir"],
  "riwayatKerja": [
    { "perusahaan": "Toko Maju", "mulai": "2021-01", "selesai": "2022-12" },
    { "perusahaan": "Kafe Senja", "mulai": "2023-02", "selesai": null },
    { "perusahaan": "Warung Sari", "mulai": null, "selesai": null }
  ]
}
```
- `selesai: null` dengan `mulai` terisi = masih bekerja. Keduanya `null` = lama kerja tidak diketahui (Tenure 50 + flag).
- 200 `{ "data": RingkasSkor }` · 400 selesai sebelum mulai / selesai tanpa mulai / mulai di masa depan / format bukan `YYYY-MM`

### `PATCH /kandidat/:id/status`
Body: `{ "keputusan": "diterima" | "ditolak" | null }`. `null` membatalkan keputusan; status kembali ke progres tes (`dilamar`/`ujian`/`selesai`). Keputusan tidak tertimpa walau pelamar masih mengirim tes.
- **Menerima atau menolak hanya boleh setelah CV dicek HR** (`cv.terverifikasi = true`: dikonfirmasi, dikoreksi, atau diisi manual), supaya keputusan tidak diambil dari skor sementara. Membatalkan keputusan (`null`) selalu boleh.
- 200 `{ "data": { "statusAplikasi": "ditolak" } }` · 400 · 409 CV belum dicek HR

Mengubah budget atau skill lowongan (`PUT /lowongan/:id`) menghitung ulang skor semua pelamarnya.

`RingkasSkor` = `{ status, sementara, komponen, flags }`

---

## Belum ada

- Paket kamus/kata kunci buatan klien di database, undangan akun rekruter, pembatasan percobaan login
