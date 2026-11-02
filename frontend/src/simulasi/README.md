# Mode simulasi — demo tanpa backend

Dibuat supaya tautan portofolio yang dibagikan ke media sosial selalu bisa dicoba
siapa pun, kapan pun, tanpa tergantung server yang bisa tidur atau mati. Ini
**bukan** pengganti sistem sungguhan (lihat [DEPLOY.md](../../../docs/DEPLOY.md)
untuk versi dengan backend asli) — ini khusus untuk tautan yang dibagikan luas.

```
pengunjung membuka tautan
        │
        ▼
Vercel (statis) ── seluruh aplikasi React, termasuk "server palsu" ini
        │
        ▼
browser pengunjung sendiri:
  seed.json (6 lowongan, 70 pelamar — hasil asli scoring engine & verifikasi
             kutipan CV backend, "difoto" sekali lewat skrip Node)
        │  dimuat ke localStorage saat pertama buka
        ▼
  router.js  ── menjawab persis seperti API_CONTRACT.md, tapi di dalam browser
        │        (lihat api/klien.js: panggil() dialihkan ke sini jika
        │         VITE_SIMULASI=true, alih-alih fetch() ke server)
        ▼
  halaman React — TIDAK TAHU dan TIDAK PERLU TAHU ini simulasi
```

## Kenapa ini bisa dipercaya, bukan sekadar tiruan

Scoring engine (`mesin/scoring/`) dan verifikasi kutipan CV (`mesin/verifikasiCv.js`)
adalah **salinan langsung** dari `backend/src/scoring/` dan `backend/src/cv/verifikasi.js`
— fungsi murni tanpa database, jadi bisa dipindah ke browser tanpa ditulis ulang
dan tanpa risiko hasilnya beda dari backend asli. Yang ditulis ulang hanya lapisan
di sekitarnya: cara data disimpan (localStorage, bukan PostgreSQL) dan cara
permintaan dijawab (pencocokan path JS, bukan Express).

`backend/scripts/buat-seed-simulasi.mjs` menjalankan pipeline yang sama (buat PDF →
ekstrak teks → verifikasi kutipan → hitung skor → urutkan keputusan) yang dipakai
`backend/src/demo/seed.js` untuk mengisi database sungguhan, lalu hasilnya ditulis
ke `data/seed.json`. Kalau `backend/src/demo/data.js` atau `generator.js` berubah,
jalankan ulang skripnya:

```bash
cd backend && node scripts/buat-seed-simulasi.mjs
```

## Yang disimulasikan secara jujur (bukan dipalsukan diam-diam)

- **Pembacaan AI untuk CV baru.** Mode simulasi tidak bisa memanggil Claude API
  sungguhan. Saat seseorang melamar di sini, hasil "baca CV"-nya diambil dari salah
  satu profil contoh di `cvContoh.js` — prinsipnya sama dengan `sumber = 'contoh'`
  di data demo backend, hanya saja dipilih saat itu juga. Berkas PDF yang *betul-betul*
  diunggah tetap bisa dibuka lewat "Buka PDF asli"; yang disimulasikan cuma bagian
  "AI membaca isinya".
- **Data hanya hidup di browser pengunjung itu sendiri** (localStorage). Tidak ada
  yang dikirim ke mana pun, dan pengunjung lain tidak melihat perubahan siapa pun.
  Ada tombol "Atur ulang data simulasi" di bawah setiap halaman mode demo.

## Yang TIDAK disimulasikan (dipakai apa adanya dari backend)

Validasi, invariant, aturan status lamaran, penguncian soal yang sudah dijawab,
perhitungan skor, dan verifikasi kutipan — semuanya logika asli, bukan versi yang
disederhanakan untuk demo.

## File

| File | Isi |
|---|---|
| `toko.js` | "Database": localStorage + seed.json, format mirip baris PostgreSQL |
| `router.js` | Satu pintu: method+path → handler, dipanggil dari `api/klien.js` |
| `auth.js`, `lowongan.js`, `soal.js`, `lamaran.js`, `kandidat.js`, `lowonganTerbuka.js` | Satu file per kelompok endpoint, padanan `backend/src/routes/*.js` |
| `skor.js` | Padanan `backend/src/layanan/skor.js` |
| `cvContoh.js` | Profil CV contoh untuk lamaran baru yang dibuat pengunjung |
| `mesin/` | Salinan fungsi murni dari backend (scoring engine + verifikasi CV) |
| `data/seed.json` | Dibuat oleh `backend/scripts/buat-seed-simulasi.mjs`, jangan diedit tangan |

## Mengaktifkan

```
VITE_SIMULASI=true   # wajib — mematikan semua fetch ke VITE_API_URL
VITE_MODE_DEMO=true  # supaya pengalih profil & editor tampilan juga muncul
```

Di situs klien sungguhan, kedua-duanya `false` (atau dihapus): kode di folder ini
tidak pernah ikut terbundel (dimuat lewat `import()` dinamis di `api/klien.js`),
jadi tidak menambah ukuran unduhan situs klien sama sekali.
