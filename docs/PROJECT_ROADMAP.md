# PROJECT_ROADMAP.md

# 0. Aturan Penggunaan Roadmap
1. Jangan menganggap task selesai hanya karena kode sudah dibuat; harus memenuhi Definition of Done (DoD).
2. AI (LLM) tidak digunakan untuk komputasi matematika, hanya ekstraksi.
3. Integrity Signals tidak memotong skor teknis.
4. Export data dieksekusi di client-side.
5. Error deteksi kamera (hardware not found) tidak memblokir ujian.
6. Data yang belum lengkap menghasilkan `skor_akhir = null`, bukan 0.

## Definition of Done (berlaku untuk semua task)
- Kode sudah di-commit ke branch utama dan lolos lint.
- Input divalidasi (guard clause) dan invariant dicek sesuai RECRUITMENT_ARCHITECTURE.md.
- Kasus error utama ditangani dan mengembalikan pesan yang jelas (bukan crash).
- Ada minimal satu bukti berjalan: unit test, test endpoint, atau pemeriksaan manual yang dicatat di PR/commit.
- Tidak ada rahasia (API key, password) di repository.
- DoD tambahan per task ditulis setelah tanda "→ DoD:".

# 1. Tahap 0 — Project Planning & Control
- [ ] 0.1 Setup repository, `.env.example`, folder frontend/backend. → DoD: `npm run dev` jalan di kedua folder dari clone bersih.
- [ ] 0.2 Finalisasi API Contract antara frontend dan backend. → DoD: semua endpoint tertulis (method, path, peran yang diizinkan, body, respons, kode error).

# 2. Tahap 1 — Database, Infrastruktur & Autentikasi
- [ ] 1.1 Inisialisasi peladen Node.js & Express. → DoD: endpoint `/health` merespons 200.
- [ ] 1.2 Skema database PostgreSQL (users, lowongan, lowongan_tes, kandidat, cv_data, ujian_teknis, integritas) melalui migrasi. → DoD: constraint dan invariant tingkat database aktif (UNIQUE user_id+lowongan_id, CHECK budget > 0, CHECK target > batas_bawah).
- [ ] 1.3 Setup Object Storage privat untuk unggahan PDF. → DoD: berkas hanya bisa diakses lewat signed URL.
- [ ] 1.4 Registrasi, login (JWT), dan middleware peran (`rekruter` | `kandidat`). → DoD: kandidat mendapat 403 saat mengakses endpoint rekruter.
- [ ] 1.5 CRUD lowongan dan konfigurasi tes per lowongan (khusus rekruter). → DoD: lowongan tanpa skill wajib, atau bobot tes yang jumlahnya bukan 1, ditolak dengan pesan jelas.

# 3. Tahap 2 — Scoring Engine (Independen)
*Dikerjakan lebih awal karena berupa fungsi murni dan bisa diuji tanpa web atau database.*
- [ ] 2.1 Fungsi normalisasi skill + kamus alias.
- [ ] 2.2 Fungsi kalkulasi skor CV.
- [ ] 2.3 Fungsi kalkulasi riwayat kerja → total bulan & jumlah perusahaan (termasuk `selesai = null` dan entri tidak valid).
- [ ] 2.4 Fungsi kalkulasi Tenure (termasuk flag `tanpa_riwayat_kerja`).
- [ ] 2.5 Fungsi kalkulasi Tes Teknis (normalisasi batas bawah + rata-rata tertimbang per tes).
- [ ] 2.6 Fungsi kalkulasi Anggaran dan Ketersediaan Waktu.
- [ ] 2.7 Kalkulator agregat total akhir (mengembalikan `null` jika ada komponen yang belum lengkap).
- [ ] 2.8 Pengujian dengan JSON statis. → DoD: test mencakup minimal kasus berikut:
  - Aktual tepat di batas bawah, tepat di target, di antara keduanya, di atas target.
  - Tenure tepat 6 bulan dan tepat 12 bulan.
  - Fresh graduate (0 perusahaan) → Tenure 50, bukan NaN atau 100.
  - Ekspektasi gaji sama dengan budget, 15% di atas budget, 16% di atas budget.
  - Skill dengan penulisan berbeda ("ReactJS" vs "react").
  - Ujian belum dikerjakan → skor_akhir null.

# 4. Tahap 3 — AI Parser & Extraction
- [ ] 3.1 Integrasi backend dengan API LLM / Ollama.
- [ ] 3.2 Endpoint upload CV dan ekstraksi JSON (skills, riwayat_kerja) dengan validasi skema. → DoD: output tidak valid dicoba ulang satu kali, lalu ditandai `gagal` tanpa menolak lamaran.
- [ ] 3.3 Hitung total_bulan_kerja & jumlah_perusahaan memakai fungsi dari Tahap 2, lalu simpan ke tabel `cv_data`.
- [ ] 3.4 Uji akurasi ekstraksi dengan minimal 5 CV contoh (termasuk CV berbahasa Indonesia). → DoD: hasil dibandingkan manual dan dicatat.

# 5. Tahap 4 — Halaman Kandidat
- [ ] 4.1 Daftar lowongan terbuka dan formulir lamaran (data diri, ekspektasi gaji, pertanyaan ketersediaan waktu, persetujuan data, upload CV).
- [ ] 4.2 Modul ujian teknis antarmuka. → DoD: hasil ujian tersimpan per jenis tes.
- [ ] 4.3 Modul Integrity Signals: deteksi keluar fokus berbasis episode dan request kamera. → DoD: satu kali pindah tab tercatat 1 episode, bukan 2.
- [ ] 4.4 Penanganan edge case kamera tidak tersedia atau ditolak (kirim status tanpa blokir). → DoD: ujian tetap bisa diselesaikan di perangkat tanpa kamera.

# 6. Tahap 5 — Halaman Rekruter (Dashboard)
- [ ] 5.1 Tabel analitik kandidat per lowongan dengan sorting & filter.
- [ ] 5.2 Rincian skor per komponen dan flag (`tanpa_riwayat_kerja`, `riwayat_tidak_valid`, ekstraksi gagal).
- [ ] 5.3 Visualisasi grafik metrik.
- [ ] 5.4 Tampilan metrik Integrity Signals berdampingan dengan skor ujian (contoh: "Out of focus: 3x / 14 detik", "Akses Kamera: hardware_not_found").
- [ ] 5.5 Client-side Export ke CSV/XLSX.

# 7. Tahap 6 — Dummy Data Seeder
- [ ] 6.1 Pembuatan skrip injeksi database (termasuk akun rekruter dan kandidat demo).
- [ ] 6.2 Simulasi variasi data:
  - Kandidat A: skor tinggi, Out of Focus masif.
  - Kandidat B: skor sedang, clean.
  - Kandidat C: fresh graduate tanpa riwayat kerja.
  - Kandidat D: ekstraksi CV gagal (menunggu tinjauan manual).
