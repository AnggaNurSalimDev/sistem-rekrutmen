# Profil Perusahaan (tampilan per klien)

Satu file JSON menentukan merek, huruf, teks beranda, dan gaya seluruh aplikasi.
Data, skor, dan alur tidak berubah; yang berubah hanya tampilan.

**Tidak ada yang perlu menulis JSON dengan tangan.** File dibuat lewat halaman editor
`/atur-tampilan` di situs demo (tautan "Buat tampilan untuk perusahaan Anda" di bawah halaman).

```
calon klien / pengembang                     situs demo
  isi form (nama, logo, warna, huruf, teks) ──▶ seluruh halaman berubah langsung
                                                │
           ┌────────────────────────────────────┴───────────────┐
           ▼                                                    ▼
  "Pakai di demo ini"                                 "Unduh file profil"
  tersimpan di browser itu saja,                      profil-<nama>.json (logo ikut di dalamnya)
  bisa diklik-klik di seluruh demo                    → bahan deploy situs klien
```

Alur dengan klien:
1. Saat presentasi, buka `/atur-tampilan`, isi bersama klien (atau klien mencoba sendiri dari HP-nya).
2. Klik **Unduh file profil**. Kalau perlu revisi nanti: **Buka file profil** → ubah → unduh lagi.
3. Saat membuat situs klien: taruh file itu di `frontend/src/merek/profil/`, set `VITE_PROFIL=<id>` (id tertulis di dalam file, sama dengan nama file tanpa `profil-`).

Editor hanya ada di mode demo. Di situs klien, `/atur-tampilan` menampilkan "Halaman tidak ditemukan".

```
src/merek/profil/<id>.json
        │  validasiProfil()   field salah → nilai bawaan + peringatan di console
        ▼
  profil lengkap
        │  variabelCss()      2 warna → ±30 variabel CSS (warna turunan + cek kontras)
        ▼
  <html style="--utama:…; --tautan:…; --radius:…">   +  judul tab, favicon, theme-color
        │
        ▼
  styles.css hanya membaca var(--…), tidak menulis warna merek langsung
```

## Isi file

```json
{
  "id": "toko-maju",
  "nama": "Toko Maju",
  "logo": { "teks": "Toko Maju", "titik": false, "gambar": "/merek/toko-maju.svg" },
  "favicon": "/merek/toko-maju.svg",
  "warna": { "utama": "#b4410e", "aksen": "#fde68a" },
  "huruf": "jakarta",
  "gaya": { "tema": "terang", "sudut": "bulat", "kerapatan": "normal" },
  "teks": {
    "judulBeranda": "Tumbuh bareng Toko Maju",
    "deskripsiBeranda": "Kalimat pembuka di bawah judul.",
    "tentang": "Paragraf tentang perusahaan, atau null untuk menyembunyikan.",
    "tombolLamar": "Kirim lamaran"
  }
}
```

| Field | Pilihan |
|---|---|
| `id` | wajib; huruf kecil, angka, tanda hubung. Sama dengan nama file. |
| `warna.utama` | `#rrggbb`. Latar kepala dan tombol. Tulisan di atasnya otomatis putih atau gelap. |
| `warna.aksen` | `#rrggbb`. Titik logo dan garis menu aktif. Kalau tidak kontras dengan warna utama, diganti otomatis. |
| `huruf` | `jakarta` (sans modern), `fraunces` (serif hangat), `grotesk` (sans teknis) |
| `gaya.tema` | `terang`, `gelap` |
| `gaya.sudut` | `tajam`, `sedang`, `bulat` |
| `gaya.kerapatan` | `rapat`, `normal`, `lega` (mengubah ukuran dasar huruf dan lebar konten) |
| `logo.gambar`, `favicon` | path di `frontend/public`, atau gambar tertanam (data URL PNG/JPG/WEBP/SVG ≤ 109 KB) dari editor. URL luar ditolak. |
| `fiktif` | `true` untuk profil demo; ditandai "(fiktif)" di pengalih |

Yang sengaja **tidak** ikut profil: kuning, hijau, merah (warna status: "Sementara", "Diterima", galat).
Warna status yang berubah per klien akan membingungkan HR yang membaca dashboard.

## Menjamin keterbacaan

`variabelCss` tidak memakai warna klien mentah-mentah untuk teks:

- `--di-atas-utama`: putih atau hitam, mana yang kontrasnya lebih tinggi terhadap warna utama.
- `--tautan`: warna utama yang digeser ke terang/gelap sampai kontras ≥ 4.5:1 terhadap latar kartu.
  Contoh: indigo `#2b3a8f` di tema gelap menjadi indigo muda.
- `--tanda-data` (batang grafik): ≥ 3:1.

Test `test/merek.test.js` memeriksa setiap file di `src/merek/profil` dengan angka-angka ini.
Profil klien baru yang warnanya tidak terbaca akan membuat test gagal sebelum dideploy.

## Memilih profil

| Situasi | Pengaturan |
|---|---|
| Situs klien | `VITE_PROFIL=toko-maju`, `VITE_MODE_DEMO=false`. Profil terkunci. |
| Demo portofolio | `VITE_MODE_DEMO=true`. Pengalih muncul di bawah halaman; `?profil=kedai-teduh` di alamat juga bisa dipakai untuk membagikan tampilan tertentu. |

Urutan di mode demo: `?profil=` di alamat → pilihan terakhir (localStorage) → `VITE_PROFIL` → `rekrut`.

## Menambah klien

1. Buat file lewat editor `/atur-tampilan` → **Unduh file profil**.
2. Simpan di `src/merek/profil/`.
3. `npm test` (cek kontras), lalu `VITE_PROFIL=<id-klien> npm run dev` untuk melihat hasilnya.

Catatan privasi: semua file di `src/merek/profil` ikut masuk ke hasil build. Profil klien sungguhan
sebaiknya hanya ada di salinan repo untuk klien itu, bukan di repo publik portofolio.
