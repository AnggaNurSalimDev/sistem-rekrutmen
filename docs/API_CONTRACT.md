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
- 200 `{ "status": "ok", "database": "ok" }`
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
  "paketKamus": ["kru-outlet"],
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
  "paketKamus": ["kru-outlet"],
  "tes": [
    { "jenisTes": "logika", "targetSkor": 80, "batasBawah": 40, "bobot": 0.4 },
    { "jenisTes": "coding", "targetSkor": 90, "batasBawah": 50, "bobot": 0.6 }
  ]
}
```
- `paketKamus`: opsional (default `[]`), maksimal 10, tanpa duplikat, setiap id harus ada di `GET /paket-kamus`. Menentukan kamus yang dipakai parser CV regex untuk lowongan ini; skill wajib/opsional lowongan selalu ikut dicari.
- `tes`: 1–10 item, `jenisTes` unik (tanpa membedakan huruf besar), skor 0–100, `bobot` > 0, jumlah bobot = 1 (toleransi 0,001).
- 201 `{ "data": Lowongan }` · 400 pelanggaran invariant (pesan menyebut masalahnya)

### `GET /lowongan/:id`
- 200 `{ "data": Lowongan }` · 404

### `PUT /lowongan/:id`
Body sama seperti `POST`. `paketKamus` **opsional**: jika tidak dikirim, pilihan lama dipertahankan. `tes` **opsional**:
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

## Paket kamus — khusus `rekruter`

Kamus bawaan untuk parser CV regex, dikelompokkan per bidang pekerjaan. Hanya dibaca; paket buatan klien belum didukung.

### `GET /paket-kamus`
- 200 `{ "data": [{ "id": "kru-outlet", "nama": "Kru Outlet (Retail & F&B)", "deskripsi": "...", "jumlahSkill": 17, "jumlahKataKunci": 7 }] }`

### `GET /paket-kamus/:id`
Isi lengkap, supaya HR tahu persis apa yang dicari regex.
- 200:
  ```json
  { "data": {
      "id": "kru-outlet", "nama": "...", "deskripsi": "...", "jumlahSkill": 17, "jumlahKataKunci": 7,
      "skill": [{ "nama": "Kasir", "alias": ["Cashier", "Kassa"], "persis": [] }],
      "penandaPerusahaan": ["toko", "Indomaret"],
      "kataKunci": [{ "label": "SIM C", "kategori": "sertifikat" }]
  } }
  ```
  Pola regex mentah sengaja tidak dikirim.
- 404 id tidak dikenal

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

## Belum ada (tahap berikutnya)

- Daftar lowongan terbuka untuk kandidat, formulir lamaran, upload CV (Tahap 3–4)
- Mengambil soal ujian dan mengirim jawaban (Tahap 4)
- Data kandidat, skor, dan integrity signals untuk dashboard (Tahap 5)
