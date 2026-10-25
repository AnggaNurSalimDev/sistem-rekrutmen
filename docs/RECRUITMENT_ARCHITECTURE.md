# RECRUITMENT_ARCHITECTURE.md

## 1. Arsitektur Tingkat Tinggi
Sistem menggunakan arsitektur terpisah antara antarmuka dan peladen:
- **Web Aplikasi (Frontend):** Satu aplikasi React dengan login berbasis peran (`rekruter` dan `kandidat`). Rute dan menu dibatasi sesuai peran.
- **Backend:** Node.js + Express. Autentikasi JWT; setiap endpoint memeriksa peran (middleware `requireRole`).
- **Database:** PostgreSQL (untuk data terstruktur)
- **Object Storage:** AWS S3 / Supabase Storage (untuk berkas PDF CV). Bucket privat; akses berkas hanya lewat signed URL berumur pendek.
- **AI Parser:** LLM API (Claude/OpenAI) atau Model Lokal (Ollama - Phi-3/Qwen). Hanya mengekstraksi data mentah, tidak menghitung apa pun.

## 2. Struktur Database (PostgreSQL)
- **`users`:** id, email (unik), password_hash, role (`rekruter` | `kandidat`), dibuat_pada
- **`lowongan`:** id, dibuat_oleh (FK users), posisi, budget_maksimal, skill_wajib (array, minimal 1), skill_opsional (array), kebutuhan_waktu (teks, contoh: "Shift pagi Senin–Sabtu"), status (`buka` | `tutup`)
- **`lowongan_tes`:** id, lowongan_id, jenis_tes, target_skor, batas_bawah, bobot
- **`kandidat`** (satu baris = satu lamaran): id, user_id, lowongan_id, nama, email, nomor_kontak, ekspektasi_gaji, ketersediaan_waktu (`penuh` | `sebagian` | `tidak`), persetujuan_data (boolean + waktu), status_aplikasi, skor_akhir (nullable), rincian_skor (JSON), skor_dihitung_pada
  - Constraint: UNIQUE (user_id, lowongan_id)
- **`cv_data`:** kandidat_id, url_cv, status_ekstraksi (`berhasil` | `gagal` | `perlu_tinjau`), skills_mentah (JSON), skills_ternormalisasi (JSON), riwayat_kerja (JSON: `[{perusahaan, mulai, selesai | null}]`), total_bulan_kerja, jumlah_perusahaan
  - `total_bulan_kerja` dan `jumlah_perusahaan` dihitung oleh backend dari `riwayat_kerja`, bukan oleh LLM.
- **`soal`:** id, lowongan_tes_id, pertanyaan, opsi (JSON: `[{id, teks}]`), kunci_opsi_id, poin (default 1), urutan, aktif (boolean), terkunci (boolean)
- **`jawaban_kandidat`:** kandidat_id, soal_id, opsi_dipilih (nullable), benar (boolean, dihitung server), dijawab_pada
  - Constraint: UNIQUE (kandidat_id, soal_id)
- **`ujian_teknis`:** kandidat_id, lowongan_tes_id, skor_pencapaian, durasi_pengerjaan, dikirim_pada
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

## 3. Logika Pembobotan (Scoring Engine)
Scoring engine adalah kumpulan fungsi murni (tanpa akses database). Input: objek lowongan + objek kandidat. Output: skor per komponen + skor akhir.

Aturan umum:
- Setiap komponen menghasilkan angka 0–100 (di-clamp).
- Pembulatan hanya dilakukan sekali di akhir (2 desimal).
- Jika data sebuah komponen belum ada (contoh: ujian belum dikerjakan, ekstraksi CV gagal), `skor_akhir = null` dan status "belum lengkap". Data yang hilang tidak diperlakukan sebagai 0.

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

## 4. AI Parser (Ekstraksi CV)
- LLM diminta mengembalikan JSON dengan skema tetap: `{ skills: string[], riwayat_kerja: [{perusahaan, mulai: "YYYY-MM", selesai: "YYYY-MM" | null}] }`.
- Output divalidasi dengan skema (contoh: zod). Jika tidak valid, sistem mencoba sekali lagi. Jika masih gagal, `status_ekstraksi = gagal` dan lamaran masuk antrean tinjauan manual. Lamaran tidak ditolak otomatis.
- Semua perhitungan (total bulan, jumlah perusahaan, pencocokan skill) dilakukan di backend.

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
- **Penguncian soal:** begitu ada satu kandidat yang menjawab sebuah soal, soal itu `terkunci = true` dan tidak bisa diubah atau dihapus, hanya bisa dinonaktifkan. Untuk mengganti isinya, rekruter membuat soal baru. Ini mencegah skor kandidat lama berubah diam-diam atau menjadi tidak bisa dijelaskan.
- **Seeder** menyediakan satu set soal contoh per tes supaya demo langsung bisa dicoba.
