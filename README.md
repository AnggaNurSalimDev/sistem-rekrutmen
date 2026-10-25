# Sistem Rekrutmen

Sistem rekrutmen dengan scoring engine transparan, parser CV berbasis LLM, dan integrity signals untuk ujian online.

Dokumentasi: [arsitektur](docs/RECRUITMENT_ARCHITECTURE.md) · [roadmap](docs/PROJECT_ROADMAP.md)

## Status

| Tahap | Isi | Status |
|---|---|---|
| 2 | Scoring engine (fungsi murni + test) | Selesai |
| 0, 1, 3–6 | Setup, database, parser CV, halaman kandidat & rekruter, seeder | Belum |

## Menjalankan test

Butuh Node.js 20 atau lebih baru.

```bash
cd backend
npm install
npm test     # 45 test
npm run lint
```

## Struktur

```
backend/
  src/scoring/
    index.js          hitungSkorKandidat(lowongan, kandidat) — titik masuk
    validasi.js       cek invariant lowongan (skill wajib, budget, bobot tes)
    skills.js         normalisasi skill + kamus alias
    cv.js             skor kesesuaian CV
    riwayatKerja.js   riwayat kerja mentah → total bulan & jumlah perusahaan
    tenure.js         skor tenure (termasuk fresh graduate)
    tes.js            normalisasi batas bawah + rata-rata tertimbang
    anggaranWaktu.js  skor anggaran & ketersediaan waktu
  test/
    fixtures/         data lowongan & kandidat (JSON statis)
    komponen.test.js  test per fungsi
    agregat.test.js   test skor akhir dari fixture
```

## Keputusan desain scoring

- **Data belum lengkap → `null`, bukan 0.** Kandidat yang belum ujian atau CV-nya gagal diekstrak tidak terlihat buruk; dashboard menampilkan "belum lengkap".
- **Fresh graduate → Tenure 50 (netral) + flag `tanpa_riwayat_kerja`.** Guard ditaruh sebelum pembagian karena `0 / 0` di JavaScript menghasilkan `NaN`, yang tanpa guard jatuh ke cabang skor 100.
- **Pembulatan hanya sekali di akhir**, supaya selisih pembulatan tidak menumpuk.
- **LLM hanya mengekstrak**; semua hitungan (bulan kerja, pencocokan skill) dilakukan di kode yang bisa diuji.

## Asumsi yang belum diuji dengan data nyata

- Bobot 30/20/30/10/10 dan ambang tenure 6/12 bulan adalah tebakan awal, belum divalidasi terhadap hasil rekrutmen sungguhan.
- Durasi kerja dihitung inklusif (Jan–Jun = 6 bulan). Dua pekerjaan yang waktunya tumpang tindih dijumlahkan apa adanya, tidak digabung.
- Kamus alias skill masih kecil dan perlu ditambah sesuai CV yang masuk.
