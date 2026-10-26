# RECRUITMENT_ARCHITECTURE.md

## 1. Arsitektur Tingkat Tinggi
Sistem menggunakan arsitektur terpisah antara antarmuka dan peladen:
- **Web Aplikasi (Frontend):** Satu aplikasi React dengan login berbasis peran (`rekruter` dan `kandidat`). Rute dan menu dibatasi sesuai peran.
- **Backend:** Node.js + Express. Autentikasi JWT; setiap endpoint memeriksa peran (middleware `requireRole`).
- **Database:** PostgreSQL (untuk data terstruktur)
- **Object Storage:** untuk berkas PDF CV. Saat ini driver disk lokal (`STORAGE_DRIVER=local`); driver AWS S3 / Supabase Storage cukup mengikuti antarmuka yang sama. Berkas privat; akses hanya lewat signed URL (HMAC) berumur pendek.
- **Parser CV:** tiga mode yang bisa dipilih klien: `regex` (tanpa biaya, berjalan lokal), `ai` (LLM API Claude/OpenAI atau model lokal Ollama), dan `gabungan`. Semua mode hanya mengekstraksi data mentah, tidak menghitung apa pun.

## 2. Struktur Database (PostgreSQL)
- **`users`:** id, email (unik), password_hash, role (`rekruter` | `kandidat`), dibuat_pada
- **`lowongan`:** id, dibuat_oleh (FK users), posisi, budget_maksimal, skill_wajib (array, minimal 1), skill_opsional (array), kebutuhan_waktu (teks, contoh: "Shift pagi Senin–Sabtu"), paket_kamus (array id paket untuk parser CV, contoh `{kru-outlet}`), status (`draf` | `buka` | `tutup`, default `draf`)
- **`lowongan_tes`:** id, lowongan_id, jenis_tes (unik per lowongan), target_skor, batas_bawah, bobot, urutan
- **`kandidat`** (satu baris = satu lamaran): id, user_id, lowongan_id, nama, email, nomor_kontak, ekspektasi_gaji, ketersediaan_waktu (`penuh` | `sebagian` | `tidak`), persetujuan_data (boolean + waktu), status_aplikasi, skor_akhir (nullable), rincian_skor (JSON), skor_dihitung_pada
  - Constraint: UNIQUE (user_id, lowongan_id)
- **`cv_data`:** kandidat_id, kunci_berkas (kunci di storage, bukan URL — URL dibuat saat dibutuhkan karena kedaluwarsa), status_ekstraksi (`menunggu` | `berhasil` | `gagal` | `perlu_tinjau`), skills_mentah (JSON), skills_ternormalisasi (JSON), riwayat_kerja (JSON: `[{perusahaan, mulai, selesai | null}]`), total_bulan_kerja, jumlah_perusahaan, teks_cv (hasil ekstraksi PDF, untuk parse ulang dan tinjauan), sumber_ekstraksi (`regex` | `ai` | `manual`), alasan_tinjau (JSON: daftar alasan parser ragu), dikoreksi_oleh (FK users, nullable), dikoreksi_pada, sorotan (JSON: `[{awal, akhir, kategori, label}]`), temuan_lain (JSON), terverifikasi (boolean), diverifikasi_oleh, diverifikasi_pada
  - `total_bulan_kerja` dan `jumlah_perusahaan` dihitung oleh backend dari `riwayat_kerja`, bukan oleh parser.
- **`soal`:** id, lowongan_tes_id, pertanyaan, opsi (JSON: `[{id, teks}]`), kunci_opsi_id, poin (default 1), urutan, aktif (boolean)
  - `terkunci` tidak disimpan sebagai kolom, tetapi dihitung dari ada tidaknya baris di `jawaban_kandidat`, sehingga tidak bisa tidak sinkron.
- **`jawaban_kandidat`:** kandidat_id, soal_id, opsi_dipilih (nullable), benar (boolean, dihitung server), dijawab_pada
  - Constraint: PRIMARY KEY (kandidat_id, soal_id); FK soal_id `ON DELETE RESTRICT` sehingga soal yang sudah dijawab tidak bisa dihapus bahkan lewat query manual.
- **`ujian_teknis`:** kandidat_id, lowongan_tes_id, skor_pencapaian, durasi_pengerjaan_detik, dimulai_pada, dikirim_pada
  - `skor_pencapaian` dihitung server dari `jawaban_kandidat` saat ujian dikirim, lalu disimpan (tidak dihitung ulang dari soal yang mungkin berubah).
- **`integritas`:** kandidat_id, status_kamera (`granted` | `denied` | `hardware_not_found` | `not_supported`), jumlah_keluar_fokus, total_detik_keluar_fokus, log_pelanggaran (JSON)

### Invariant yang divalidasi saat data masuk
- `lowongan.skill_wajib` minimal 1 item.
- `lowongan.budget_maksimal > 0`.
- Setiap `lowongan_tes`: `target_skor > batas_bawah`, `bobot > 0`. Jumlah bobot per lowongan = 1 (toleransi 0,001).
- `kandidat.ekspektasi_gaji >= 0`.
- Lamaran hanya bisa dibuat untuk lowongan berstatus `buka`.
- Setiap `soal`: pertanyaan tidak kosong, 2–6 opsi, id opsi unik, teks opsi tidak kosong, `kunci_opsi_id` adalah salah satu id opsi, `poin > 0`.
- Lowongan hanya bisa diubah ke status `buka` jika setiap `lowongan_tes` punya minimal 1 soal aktif.
- Konfigurasi tes (`lowongan_tes`) hanya bisa diubah saat lowongan `draf`. Lowongan yang sudah punya pelamar tidak bisa kembali ke `draf` atau dihapus, hanya ditutup.
- Pada lowongan `buka`, soal aktif terakhir sebuah tes tidak bisa dinonaktifkan atau dihapus.
- Invariant satu baris (CHECK, UNIQUE, FK) juga dipasang di database sebagai jaring pengaman; invariant lintas baris (jumlah bobot, soal aktif per tes) dijaga di aplikasi dalam transaksi.

Detail endpoint: [API_CONTRACT.md](API_CONTRACT.md).

## 3. Logika Pembobotan (Scoring Engine)
Scoring engine adalah kumpulan fungsi murni (tanpa akses database). Input: objek lowongan + objek kandidat. Output: skor per komponen + skor akhir.

Aturan umum:
- Setiap komponen menghasilkan angka 0–100 (di-clamp).
- Pembulatan hanya dilakukan sekali di akhir (2 desimal).
- Jika data sebuah komponen belum ada (contoh: ujian belum dikerjakan, ekstraksi CV gagal), `skor_akhir = null` dan status "belum lengkap". Data yang hilang tidak diperlakukan sebagai 0.
- **Skor sementara.** Data CV dari parser (status `berhasil` maupun `perlu_tinjau`) langsung dipakai menghitung skor, supaya HR bisa mengurutkan kandidat sejak awal. Selama HR belum mengonfirmasi CV, hasilnya `sementara = true` dan dashboard **wajib** menampilkan label "sementara, belum diverifikasi" di setiap baris. CV `perlu_tinjau` juga diberi flag `cv_perlu_tinjau`. Setelah HR mengonfirmasi (dengan atau tanpa koreksi), `sementara = false`.

1. **Skor Kesesuaian CV (30%):** (Jumlah Skill Wajib Ditemukan / Total Skill Wajib) * 100
   - Pencocokan dilakukan setelah normalisasi: huruf kecil, trim, hapus tanda baca, lalu dipetakan lewat kamus alias (contoh: "reactjs", "react.js" → "react").
   - Pembagi tidak mungkin 0 karena invariant skill_wajib minimal 1.
2. **Skor Tenure (20%):** Rata-rata bulan bekerja per perusahaan = total_bulan_kerja / jumlah_perusahaan.
   - < 6 bulan = 0; 6 sampai 12 bulan (inklusif) = 50; > 12 bulan = 100.
   - Pekerjaan dengan `selesai = null` (masih bekerja) dihitung sampai tanggal lamaran dikirim.
   - Entri dengan `selesai < mulai` atau tanggal tidak terbaca dibuang dan dicatat sebagai flag `riwayat_tidak_valid`.
   - Jika `jumlah_perusahaan = 0` (fresh graduate): skor = 50 (netral, karena belum ada bukti ke arah mana pun) dan flag `tanpa_riwayat_kerja` ditampilkan di dashboard. Kasus ini wajib ditangani sebelum pembagian, karena `0 / 0` di JavaScript menghasilkan `NaN` yang tanpa guard akan jatuh ke cabang skor 100.
3. **Skor Tes Kemampuan (30%):** Setiap tes dinormalisasi dengan batas bawah:
   - Jika Aktual <= Batas Bawah: Skor = 0
   - Jika Batas Bawah < Aktual < Target: ((Aktual - Batas Bawah) / (Target - Batas Bawah)) * 100
   - Jika Aktual >= Target: Skor = 100
   - Skor komponen = rata-rata tertimbang skor setiap tes menurut `lowongan_tes.bobot`.
   - Pembagi `(Target - Batas Bawah)` selalu > 0 karena invariant.
4. **Kesesuaian Anggaran (10%):** selisih = (ekspektasi_gaji - budget_maksimal) / budget_maksimal
   - selisih <= 0 → 100
   - 0 < selisih <= 0,15 → 100 * (1 - selisih / 0,15)
   - selisih > 0,15 → 0
5. **Ketersediaan Waktu (10%):** Kandidat menjawab satu pertanyaan yang memuat `lowongan.kebutuhan_waktu`: "Apakah Anda bisa memenuhi jadwal berikut?"
   - `penuh` = 100, `sebagian` = 50, `tidak` = 0

**Skor akhir** = 0,30·CV + 0,20·Tenure + 0,30·Tes + 0,10·Anggaran + 0,10·Waktu

Skor dihitung ulang setiap kali data lowongan atau data kandidat berubah. Waktu perhitungan disimpan di `skor_dihitung_pada`.

## 4. Parser CV (Ekstraksi)
Alur: PDF → teks → parser → data mentah → validasi skema → `cv_data`. Lamaran tidak pernah ditolak otomatis karena CV gagal dibaca.

**Langkah 1 — PDF ke teks.** Baris teks dipertahankan karena parser regex bergantung padanya. PDF tanpa teks (hasil scan/foto) → `status_ekstraksi = gagal` dengan alasan "PDF tidak berisi teks". OCR belum didukung.

**Langkah 2 — parser.** Semua mode mengembalikan bentuk yang sama:
`{ skills: string[], riwayat_kerja: [{perusahaan, mulai: "YYYY-MM", selesai: "YYYY-MM" | null}], temuan_lain: [{label, kategori}], sorotan: [{awal, akhir, kategori, label}], keyakinan: "tinggi" | "rendah", alasan_tinjau: string[] }`

Sorotan dan temuan lain selalu berasal dari regex, di mode apa pun, karena AI tidak mengembalikan posisi teks.

| Mode | Cara kerja | Kelebihan | Kekurangan |
|---|---|---|---|
| `regex` | Pencocokan pola dan kamus | Gratis, cepat, hasil bisa dijelaskan, data tidak keluar server | Lemah untuk nama perusahaan dan format CV yang tidak umum |
| `ai` | LLM mengembalikan JSON | Lebih tahan terhadap format beragam | Berbayar/butuh model lokal, data CV dikirim ke pihak ketiga (jika API), hasil bisa berbeda tiap kali |
| `gabungan` | Regex dulu; LLM dipanggil hanya jika `keyakinan = rendah` | Biaya AI hanya untuk CV yang sulit | Paling rumit dikonfigurasi |

**Paket kamus.** Regex hanya bisa menemukan apa yang ada di kamusnya, jadi kamus dikelompokkan per bidang pekerjaan. HR memilih satu atau beberapa paket saat membuat lowongan (`lowongan.paket_kamus`). Satu paket berisi:
- `skill`: nama + alias (penulisan lain yang dianggap sama) + `persis` (singkatan yang hanya cocok jika ditulis persis, contoh "POS" agar tidak cocok dengan "kantor pos").
- `penandaPerusahaan`: kata/merek yang menandai nama tempat kerja selain PT/CV (contoh "Indomaret", "kafe"), karena di banyak bidang pemberi kerja tidak memakai "PT".
- `kataKunci`: hal penting selain skill yang disorot untuk HR tetapi tidak masuk skor, dengan kategori `sertifikat` (contoh SIM C, sertifikat penjamah makanan), `ketersediaan` (bersedia shift), atau `jabatan` (pernah menjadi kasir/barista).

Paket bawaan: `teknologi-perkantoran` dan `kru-outlet`. Saat ini paket ditulis di kode (`backend/src/cv/paket/`) dan divalidasi saat server menyala; paket buatan klien (disimpan di database) belum didukung. Isi lengkap setiap paket bisa dilihat HR lewat API, supaya tidak ada aturan tersembunyi.

**Parser regex:**
- **Skill:** teks dipecah menjadi kata per frasa, lalu 1–3 kata berurutan dinormalisasi dengan fungsi yang sama dengan scoring engine (kamus alias), dan dicocokkan ke kamus = skill lowongan + skill dari paket terpilih. Skill yang tidak ada di kamus tidak akan ditemukan. *Longest match*: kata yang sudah menjadi bagian skill lebih panjang tidak dipakai lagi ("Tailwind CSS" tidak menghasilkan "CSS"). Skill sangat pendek (contoh "C", "Go") rawan salah tangkap, jadi wajib cocok persis huruf besar-kecilnya dan dicatat di `alasan_tinjau`.
- **Istilah HR menang:** jika skill lowongan ditulis "Cashier" dan paket memakai nama "Kasir" dengan alias "Cashier", hasil parser memakai "Cashier", supaya cocok dengan skill wajib di scoring engine.
- **Bagian CV:** judul seperti "Pengalaman Kerja"/"Work Experience" dan "Pendidikan"/"Education" dideteksi. Rentang tanggal di bagian pendidikan, organisasi, dan bagian lain tidak dihitung sebagai pekerjaan.
- **Tanggal:** nama bulan Indonesia dan Inggris (lengkap/singkatan), `MM/YYYY`, `YYYY-MM`, tahun saja, dan kata "sekarang"/"present" untuk pekerjaan yang masih berjalan.
- **Nama perusahaan:** dicari di baris yang sama dengan tanggal, lalu 1–2 baris di atas atau di bawahnya. Arah (atas/bawah) ditentukan dari pola mayoritas di CV itu; baris bullet tidak ikut menentukan arah. Prioritas pada teks yang memuat penanda badan usaha (PT, CV, Tbk, Inc, Ltd, dll.) atau penanda dari paket. Kata "di/at/@" hanya dipakai di baris tanggal itu sendiri.

**Sorotan.** Setiap temuan disimpan beserta posisinya di teks CV (`awal`, `akhir`, `kategori`, `label`), dengan kategori `tanggal`, `perusahaan`, `skill`, `sertifikat`, `ketersediaan`, `jabatan`, dan `bagian`. Setiap kemunculan disorot, bukan hanya yang pertama. Sorotan dijamin tidak bertumpuk dan sudah urut; jika dua temuan bertumpuk, yang lebih penting untuk skor dipertahankan (tanggal > perusahaan > sertifikat/ketersediaan > skill > jabatan > bagian). Frontend cukup memotong teks di setiap `awal`/`akhir` lalu mewarnainya, tanpa logika regex sama sekali.

**`keyakinan = rendah`** (→ `status_ekstraksi = perlu_tinjau`) jika salah satu terjadi: bagian pengalaman kerja tidak ditemukan, nama perusahaan hanya ditebak, bulan tidak disebut (hanya tahun), skill pendek ditemukan, atau tidak ada riwayat kerja sama sekali (bisa fresh graduate, bisa juga format tidak terbaca). Setiap alasan ditulis di `alasan_tinjau` agar HR tahu apa yang harus dicek.

**Mode `ai`:** output divalidasi dengan skema yang sama. Jika tidak valid, dicoba sekali lagi; jika masih gagal, `status_ekstraksi = gagal`.

**Langkah 3 — verifikasi HR.** HR membuka CV dengan sorotan, memeriksa data hasil parser, lalu:
- **Konfirmasi tanpa perubahan** → `terverifikasi = true`, `sumber_ekstraksi` tetap (`regex`/`ai`).
- **Koreksi lalu simpan** → `terverifikasi = true`, `sumber_ekstraksi = manual`, `status_ekstraksi = berhasil`.

Keduanya mengisi `diverifikasi_oleh` dan `diverifikasi_pada`, lalu skor dihitung ulang tanpa label sementara. CV berstatus `perlu_tinjau` atau `gagal` tampil lebih dulu di antrean, tetapi CV `berhasil` pun tetap berstatus sementara sampai dikonfirmasi. Data yang sudah diverifikasi tidak ditimpa oleh parse ulang otomatis.

Semua perhitungan (total bulan, jumlah perusahaan, pencocokan skill dengan lowongan) tetap dilakukan scoring engine di backend.

## 5. Integrity Signals (Pengawasan Ujian)
- **Deteksi Fokus (Out of Focus):** Mendengarkan `visibilitychange` dan `blur`/`focus`, tetapi dihitung per **episode**:
  - Episode dimulai pada event pertama yang menandakan hilang fokus (`blur` atau `hidden`).
  - Event hilang fokus lain selama episode masih terbuka diabaikan, sehingga satu kali pindah tab tidak terhitung dua kali.
  - Episode ditutup saat `focus` atau `visible`. Durasinya dijumlahkan.
  - Hasil akhir: jumlah episode dan total detik (contoh: "3x / 14 detik").
- **Kamera:** Bersifat psychological deterrent. Meminta akses `getUserMedia`. Video tidak direkam dan tidak disimpan; yang disimpan hanya status. Jika perangkat tidak ditemukan atau akses ditolak, ujian tetap berjalan dan status dicatat (`hardware_not_found` / `denied` / `not_supported`).
- Data integritas dikirim dari browser, sehingga bisa dimanipulasi. Karena itu sinyal ini hanya bersifat indikatif.
- Sistem tidak memotong skor teknis; dashboard hanya menampilkan peringatan objektivitas.

## 6. Privasi Data
- Sebelum melamar, kandidat wajib menyetujui pemberitahuan pemrosesan data (CV, data kontak, status kamera). Waktu persetujuan disimpan.
- Berkas CV disimpan di bucket privat; dashboard mengaksesnya lewat signed URL.
- Data dummy seeder hanya berisi data fiktif.

## 7. Fitur Pendukung Portofolio
- **Client-Side Export:** Ekspor CSV/XLSX dilakukan sepenuhnya di memori browser (React) menggunakan library eksternal, tanpa membebani backend.
- **Dummy Data Seeder:** Skrip Node.js untuk menyuntikkan data fiktif, termasuk variasi skor teknis tinggi tetapi Integrity Signals buruk, fresh graduate tanpa riwayat kerja, dan CV dengan ekstraksi gagal, untuk keperluan demonstrasi portofolio.

## 8. Bank Soal (Ujian Pilihan Ganda)
Soal adalah data, bukan kode. Rekruter (termasuk calon klien yang mencoba demo) bisa membuat, mengubah, dan mengurutkan soal sendiri tanpa menyentuh kode.

- **Tipe soal:** saat ini hanya pilihan ganda (satu jawaban benar). Tipe lain (esai, isian) belum didukung karena butuh penilaian manual atau LLM.
- **Penilaian:** `skor_pencapaian = (jumlah poin soal yang dijawab benar / jumlah poin semua soal aktif) × 100`.
  - Soal yang tidak dijawab saat ujian dikirim dihitung salah.
  - Sebelum ujian dikirim, tes berstatus "belum dikerjakan" dan scoring engine menghasilkan `null`, bukan 0.
  - Penilaian berupa fungsi murni di scoring engine dan bisa diuji tanpa database.
  - Hasilnya masuk ke Skor Tes Kemampuan (bagian 3) lewat normalisasi batas bawah, sama seperti sebelumnya.
- **Keamanan kunci jawaban:** endpoint soal untuk kandidat tidak pernah menyertakan `kunci_opsi_id`. Penilaian hanya dilakukan di server.
- **Urutan opsi diacak** per kandidat di browser. Karena jawaban disimpan sebagai id opsi, pengacakan tidak memengaruhi penilaian.
- **Penguncian soal:** begitu ada satu kandidat yang menjawab sebuah soal, soal itu terkunci dan tidak bisa diubah atau dihapus, hanya bisa dinonaktifkan. Untuk mengganti isinya, rekruter membuat soal baru. Ini mencegah skor kandidat lama berubah diam-diam atau menjadi tidak bisa dijelaskan.
- **Seeder** menyediakan satu set soal contoh per tes supaya demo langsung bisa dicoba.
