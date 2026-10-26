# PROJECT_ROADMAP.md

# 0. Aturan Penggunaan Roadmap
1. Jangan menganggap task selesai hanya karena kode sudah dibuat; harus memenuhi Definition of Done (DoD).
2. Parser CV (regex maupun AI) tidak digunakan untuk komputasi matematika, hanya ekstraksi.
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
- [ ] 0.1 Setup repository, `.env.example`, folder frontend/backend. → DoD: `npm run dev` jalan di kedua folder dari clone bersih. *(Backend selesai; folder frontend dibuat di Tahap 4.)*
- [x] 0.2 Finalisasi API Contract antara frontend dan backend ([API_CONTRACT.md](API_CONTRACT.md); diperbarui tiap tahap). → DoD: semua endpoint tertulis (method, path, peran yang diizinkan, body, respons, kode error).

# 2. Tahap 1 — Database, Infrastruktur & Autentikasi
- [x] 1.1 Inisialisasi peladen Node.js & Express. → DoD: endpoint `/health` merespons 200.
- [x] 1.2 Skema database PostgreSQL (users, lowongan, lowongan_tes, kandidat, cv_data, ujian_teknis, integritas) melalui migrasi. → DoD: constraint dan invariant tingkat database aktif (UNIQUE user_id+lowongan_id, CHECK budget > 0, CHECK target > batas_bawah).
- [x] 1.3 Setup Object Storage privat untuk unggahan PDF. → DoD: berkas hanya bisa diakses lewat signed URL. *(Driver disk lokal; driver S3/Supabase menyusul saat deploy.)*
- [x] 1.4 Registrasi, login (JWT), dan middleware peran (`rekruter` | `kandidat`). → DoD: kandidat mendapat 403 saat mengakses endpoint rekruter.
- [x] 1.5 CRUD lowongan dan konfigurasi tes per lowongan (khusus rekruter). → DoD: lowongan tanpa skill wajib, atau bobot tes yang jumlahnya bukan 1, ditolak dengan pesan jelas.
- [x] 1.6 CRUD bank soal pilihan ganda per tes (khusus rekruter). → DoD: soal dengan kunci yang bukan salah satu opsi ditolak; soal yang sudah dijawab kandidat tidak bisa diubah atau dihapus (hanya dinonaktifkan); lowongan tidak bisa dibuka jika ada tes tanpa soal aktif.

# 3. Tahap 2 — Scoring Engine (Independen)
*Dikerjakan lebih awal karena berupa fungsi murni dan bisa diuji tanpa web atau database.*
- [x] 2.1 Fungsi normalisasi skill + kamus alias.
- [x] 2.2 Fungsi kalkulasi skor CV.
- [x] 2.3 Fungsi kalkulasi riwayat kerja → total bulan & jumlah perusahaan (termasuk `selesai = null` dan entri tidak valid).
- [x] 2.4 Fungsi kalkulasi Tenure (termasuk flag `tanpa_riwayat_kerja`).
- [x] 2.5 Fungsi kalkulasi Tes Teknis (normalisasi batas bawah + rata-rata tertimbang per tes).
- [x] 2.6 Fungsi kalkulasi Anggaran dan Ketersediaan Waktu.
- [x] 2.7 Kalkulator agregat total akhir (mengembalikan `null` jika ada komponen yang belum lengkap).
- [x] 2.8 Pengujian dengan JSON statis. → DoD: test mencakup minimal kasus berikut:
  - Aktual tepat di batas bawah, tepat di target, di antara keduanya, di atas target.
  - Tenure tepat 6 bulan dan tepat 12 bulan.
  - Fresh graduate (0 perusahaan) → Tenure 50, bukan NaN atau 100.
  - Ekspektasi gaji sama dengan budget, 15% di atas budget, 16% di atas budget.
  - Skill dengan penulisan berbeda ("ReactJS" vs "react").
  - Ujian belum dikerjakan → skor_akhir null.
- [x] 2.9 Fungsi validasi soal dan penilaian jawaban pilihan ganda → skor_pencapaian. → DoD: test mencakup soal tidak dijawab = salah, poin berbeda per soal, soal nonaktif tidak dihitung, jawaban untuk soal asing atau opsi asing ditolak.
- [x] 2.10 Skor sementara: data CV yang belum diverifikasi HR tetap dihitung dengan label `sementara`. → DoD: hanya `terverifikasi === true` yang menghilangkan label; CV `gagal`/`menunggu` tetap menghasilkan null.

# 4. Tahap 3 — Parser CV
- [x] 3.1 Ekstraksi teks dari PDF dengan baris terjaga. → DoD: PDF tanpa teks (scan) menghasilkan `gagal` dengan alasan jelas, bukan crash.
- [x] 3.2 Parser regex: skill, rentang tanggal (ID/EN), nama perusahaan, deteksi bagian CV, keyakinan + alasan tinjau. → DoD: test mencakup CV berbahasa Indonesia dan Inggris, CV tanpa judul bagian, tanggal tahun saja, pekerjaan "sampai sekarang", bagian pendidikan yang tidak boleh dihitung, skill pendek yang ambigu.
- [x] 3.3 Orkestrator mode `regex` | `ai` | `gabungan` dengan skema output yang sama untuk semua mode. → DoD: mode `gabungan` hanya memanggil AI saat keyakinan regex rendah (diuji dengan parser AI palsu).
- [x] 3.7 Paket kamus per bidang (skill + alias + singkatan persis, penanda perusahaan, kata kunci non-skill) dan paket pertama **Kru Outlet**; lowongan memilih paket lewat `paketKamus`; `GET /paket-kamus` menampilkan isi paket. → DoD: paket bawaan divalidasi saat server menyala; merek tanpa "PT" dikenali hanya jika paket dipilih; istilah skill dari HR menang atas nama di paket.
- [x] 3.8 Sorotan posisi temuan untuk HR (tanggal, perusahaan, skill, sertifikat, ketersediaan, jabatan, judul bagian). → DoD: posisi tepat menunjuk teks, tidak bertumpuk, urut; benar walau baris diawali spasi.
- [ ] 3.9 Paket buatan klien (disimpan di database, divalidasi dengan `periksaPaket` yang sama).
- [ ] 3.4 Parser AI (Claude/OpenAI/Ollama) dengan validasi skema. → DoD: output tidak valid dicoba ulang satu kali, lalu ditandai `gagal` tanpa menolak lamaran.
- [ ] 3.5 Simpan hasil ke `cv_data` dan hitung total_bulan_kerja & jumlah_perusahaan memakai fungsi dari Tahap 2 (dikerjakan bersama endpoint lamaran di 4.1).
- [ ] 3.6 Uji akurasi dengan minimal 5 CV **asli** (dianonimkan, termasuk CV berbahasa Indonesia), untuk setiap mode yang tersedia. → DoD: hasil dibandingkan manual dan dicatat per kolom (skill, tanggal, perusahaan). CV contoh buatan sendiri tidak dihitung, karena parser bisa saja hanya cocok dengan contoh yang dibuat untuknya.

# 5. Tahap 4 — Halaman Kandidat
- [ ] 4.1 Daftar lowongan terbuka dan formulir lamaran (data diri, ekspektasi gaji, pertanyaan ketersediaan waktu, persetujuan data, upload CV).
- [ ] 4.2 Modul ujian pilihan ganda (soal dari bank soal, urutan opsi diacak). → DoD: hasil ujian tersimpan per jenis tes; respons API soal untuk kandidat tidak memuat kunci jawaban.
- [ ] 4.3 Modul Integrity Signals: deteksi keluar fokus berbasis episode dan request kamera. → DoD: satu kali pindah tab tercatat 1 episode, bukan 2.
- [ ] 4.4 Penanganan edge case kamera tidak tersedia atau ditolak (kirim status tanpa blokir). → DoD: ujian tetap bisa diselesaikan di perangkat tanpa kamera.

# 6. Tahap 5 — Halaman Rekruter (Dashboard)
- [ ] 5.1 Tabel analitik kandidat per lowongan dengan sorting & filter. → DoD: skor sementara selalu berlabel "belum diverifikasi" dan bisa difilter (misalnya hanya kandidat terverifikasi).
- [ ] 5.2 Rincian skor per komponen dan flag (`tanpa_riwayat_kerja`, `riwayat_tidak_valid`, ekstraksi gagal).
- [ ] 5.3 Visualisasi grafik metrik.
- [ ] 5.4 Tampilan metrik Integrity Signals berdampingan dengan skor ujian (contoh: "Out of focus: 3x / 14 detik", "Akses Kamera: hardware_not_found").
- [ ] 5.5 Client-side Export ke CSV/XLSX.
- [ ] 5.6 Halaman kelola soal per tes (tambah, ubah, urutkan, nonaktifkan, pratinjau seperti yang dilihat kandidat). → DoD: soal terkunci ditampilkan sebagai tidak bisa diubah, dengan alasan yang jelas.
- [ ] 5.7 Antrean verifikasi CV + endpoint konfirmasi/koreksi: teks CV dengan sorotan berwarna per kategori, alasan tinjau, temuan lain, dan hasil ekstraksi yang bisa diedit. Tombol "Konfirmasi" dan "Simpan koreksi". → DoD: setelah disimpan, `terverifikasi = true`, label sementara hilang, skor dihitung ulang; koreksi menjadikan `sumber_ekstraksi = manual`; data terverifikasi tidak tertimpa parse ulang.
- [ ] 5.8 Endpoint + tombol ubah status lamaran (`dilamar` → `ujian` → `selesai` → `diterima`/`ditolak`). → DoD: transisi yang tidak masuk akal ditolak; kandidat hanya bisa melihat status lamarannya sendiri.
- [ ] 5.9 Halaman detail kandidat: rincian alasan skor (skill ditemukan/tidak, entri riwayat yang dibuang, skor per tes dan jawaban per soal, gaji vs budget), log integritas, tombol buka CV (signed URL).

# 7. Tahap 6 — Dummy Data Seeder
- [ ] 6.1 Pembuatan skrip injeksi database (termasuk akun rekruter dan kandidat demo).
- [ ] 6.2 Simulasi variasi data:
  - Kandidat A: skor tinggi, Out of Focus masif.
  - Kandidat B: skor sedang, clean.
  - Kandidat C: fresh graduate tanpa riwayat kerja.
  - Kandidat D: ekstraksi CV gagal (menunggu tinjauan manual).
- [ ] 6.3 Set soal contoh pilihan ganda untuk setiap tes demo, beserta jawaban kandidat A–D yang konsisten dengan skor mereka.
