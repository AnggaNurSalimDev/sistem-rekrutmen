# PROJECT_ROADMAP.md

# 0. Aturan Penggunaan Roadmap
1. Jangan menganggap task selesai hanya karena kode sudah dibuat; harus memenuhi Definition of Done (DoD).
2. Parser CV (AI) tidak digunakan untuk komputasi matematika atau penilaian, hanya ekstraksi. Setiap temuan AI wajib didukung kutipan yang benar-benar ada di CV.
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
- [x] 0.1 Setup repository, `.env.example`, folder frontend/backend. → DoD: `npm run dev` jalan di kedua folder dari clone bersih.
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
  - Pengalaman tanpa tanggal → Tenure 50 + `lama_kerja_tidak_disebut`, bukan dianggap fresh graduate.
  - Ekspektasi gaji sama dengan budget, 15% di atas budget, 16% di atas budget.
  - Skill dengan penulisan berbeda ("ReactJS" vs "react").
  - Ujian belum dikerjakan → skor_akhir null.
- [x] 2.9 Fungsi validasi soal dan penilaian jawaban pilihan ganda → skor_pencapaian. → DoD: test mencakup soal tidak dijawab = salah, poin berbeda per soal, soal nonaktif tidak dihitung, jawaban untuk soal asing atau opsi asing ditolak.
- [x] 2.10 Skor sementara: data CV yang belum diverifikasi HR tetap dihitung dengan label `sementara`. → DoD: hanya `terverifikasi === true` yang menghilangkan label; CV `gagal`/`menunggu` tetap menghasilkan null.

# 4. Tahap 3 — Parser CV (AI)
*Parser regex (3.2, 3.3, 3.7, 3.8 versi lama) sempat selesai, lalu diganti AI setelah diuji dengan CV asli: CV yang ditulis sebagai kalimat dan tanpa tanggal kerja membuat regex salah tangkap. Kodenya ada di riwayat git.*

- [x] 3.1 Ekstraksi teks dari PDF dengan baris terjaga. → DoD: PDF tanpa teks (scan) menghasilkan `gagal` dengan alasan jelas, bukan crash.
- [x] 3.2 Parser AI Claude (Messages API, tool wajib dipanggil) dengan validasi skema dan coba ulang. → DoD: output tidak valid / error sementara dicoba ulang satu kali; error permanen (key salah) tidak diulang; gagal → `gagal` tanpa menolak lamaran; tidak mengirim `temperature`; API key tidak muncul di pesan error.
- [x] 3.3 Verifikasi kutipan: temuan tanpa kutipan yang ada di CV dibuang; nama perusahaan harus tertulis; tanggal hanya dipercaya jika tahunnya terlihat di kutipan; kalimat yang tampak sebagai perintah untuk AI ditandai. → DoD: test mencakup kutipan karangan, nama perusahaan karangan, tanggal karangan, kutipan terpotong baris, dan upaya menutup tag `<cv>` dari dalam CV.
- [x] 3.4 Mode tanpa AI: tanpa `ANTHROPIC_API_KEY`, CV berstatus `menunggu` (isi manual) dan `/health` menampilkan `fitur.parserAi = false`. → DoD: server tetap menyala dan lamaran tetap bisa diproses tanpa key.
- [x] 3.5 Sorotan dari kutipan AI yang terbukti + kata kunci sorot per lowongan (`kataKunciSorot`, disimpan backend, disorot di frontend).
- [x] 3.6 Simpan hasil ke `cv_data` dan hitung skor (dikerjakan bersama endpoint lamaran di 4.1).
- [ ] 3.7 Uji akurasi dengan CV **asli** memakai API sungguhan (butuh API key; biayanya kecil). → DoD: dua CV pemilik proyek lulus, yaitu tidak ada tanggal karangan dan ketiga tempat kerja ditemukan; hasil per kolom dicatat. CV buatan sendiri tidak dihitung.

# 5. Tahap 4 — Halaman Kandidat
- [x] 4.1 Daftar lowongan terbuka dan formulir lamaran (data diri, ekspektasi gaji, pertanyaan ketersediaan waktu, persetujuan data, upload CV).
- [x] 4.2 Modul ujian pilihan ganda (soal dari bank soal, urutan opsi diacak). → DoD: hasil ujian tersimpan per jenis tes; respons API soal untuk kandidat tidak memuat kunci jawaban.
- [x] 4.3 Modul Integrity Signals: deteksi keluar fokus berbasis episode dan request kamera. → DoD: satu kali pindah tab tercatat 1 episode, bukan 2.
- [x] 4.4 Penanganan edge case kamera tidak tersedia atau ditolak (kirim status tanpa blokir). → DoD: ujian tetap bisa diselesaikan di perangkat tanpa kamera.
- [x] 4.5 Uji ujung ke ujung alur kandidat di browser sungguhan (`frontend/e2e/alur-kandidat.mjs`). → DoD: daftar → melamar dengan PDF → tes dengan satu kali pindah tab, muat ulang, dan kamera palsu → kirim; hitungan di database sesuai (2 episode, 1 kali dibuka ulang).

# 6. Tahap 5 — Halaman Rekruter (Dashboard)
- [x] 5.1 Tabel analitik kandidat per lowongan dengan sorting & filter. → DoD: skor sementara selalu berlabel "belum diverifikasi" dan bisa difilter (misalnya hanya kandidat terverifikasi). *Selesai: stempel kuning "Sementara", filter Semua / Perlu dicek HR / Sudah dicek HR / Sudah diputuskan, cari nama, urut per kolom (nilai kosong selalu di bawah).*
- [x] 5.2 Rincian skor per komponen dan flag (`tanpa_riwayat_kerja`, `riwayat_tidak_valid`, ekstraksi gagal). *Flag ditampilkan sebagai kalimat biasa, bukan kode.*
- [x] 5.3 Visualisasi grafik metrik. *Selesai: sebaran skor akhir dan rata-rata per komponen (SVG tanpa library, tooltip, tampilan tabel). Grafik mengikuti filter.*
- [x] 5.4 Tampilan metrik Integrity Signals berdampingan dengan skor ujian (contoh: "Out of focus: 3x / 14 detik", "Akses Kamera: hardware_not_found").
- [x] 5.5 Client-side Export ke CSV. *XLSX sengaja tidak dibuat: CSV berpemisah titik koma + BOM sudah terbuka rapi di Excel Indonesia, tanpa menambah library. Sel yang diawali = + - @ dinetralkan (CSV injection).*
- [x] 5.6 Halaman kelola soal per tes (tambah, ubah, urutkan, nonaktifkan, pratinjau seperti yang dilihat kandidat). → DoD: soal terkunci ditampilkan sebagai tidak bisa diubah, dengan alasan yang jelas.
- [x] 5.7 Antrean verifikasi CV + endpoint konfirmasi/koreksi: teks CV dengan sorotan AI berwarna per kategori, kotak pencarian kata kunci (kata kunci lowongan + ketikan bebas, disorot di browser), alasan tinjau, kutipan bukti tiap temuan, dan hasil ekstraksi yang bisa diedit. Tombol "Konfirmasi" dan "Simpan koreksi"; isi manual untuk CV `menunggu`/`gagal`. → DoD: setelah disimpan, `terverifikasi = true`, label sementara hilang, skor dihitung ulang; koreksi menjadikan `sumber_ekstraksi = manual`; data terverifikasi tidak tertimpa parse ulang.
- [x] 5.8 Endpoint + tombol ubah status lamaran (`dilamar` → `ujian` → `selesai` → `diterima`/`ditolak`). → DoD: transisi yang tidak masuk akal ditolak; kandidat hanya bisa melihat status lamarannya sendiri. *Dibuat lebih sederhana: rekruter hanya mengatur keputusan (terima / tolak / batalkan). Status progres dihitung dari tes yang dikirim, jadi tidak bisa diatur ke keadaan yang tidak masuk akal.*
- [x] 5.9 Halaman detail kandidat: rincian alasan skor (skill ditemukan/tidak, entri riwayat yang dibuang, skor per tes dan jawaban per soal, gaji vs budget), log integritas, tombol buka CV (signed URL).

- [x] 5.10 Uji ujung ke ujung alur rekruter (`frontend/e2e/alur-rekruter.mjs`) dengan parser AI palsu (`backend/scripts/server-ai-palsu.js`): buat lowongan → bank soal → buka → tabel, filter, CSV → sorotan + kata kunci → konfirmasi CV → isi CV manual → keputusan → tampilan HP.

# 7. Tahap 6 — Dummy Data Seeder
- [x] 6.1 Pembuatan skrip injeksi database (termasuk akun rekruter dan kandidat demo). *Selesai: `npm run seed:demo`. Data dibuat lewat API aplikasi sendiri (server berjalan di dalam proses seeder), jadi skor, verifikasi kutipan, penilaian soal, dan log integritas dihitung kode yang sama dengan pengguna asli. Hanya menyentuh akun `@demo.rekrut.id`; aman dijalankan berulang.*
- [x] 6.2 Simulasi variasi data (lowongan Kepala Toko, ditambah lowongan Kasir Outlet dengan satu pelamar belum tes dan satu ditolak):
  - Kandidat A: skor tinggi, Out of Focus masif.
  - Kandidat B: skor sedang, clean.
  - Kandidat C: fresh graduate tanpa riwayat kerja.
  - Kandidat D: ekstraksi CV gagal (menunggu tinjauan manual).
  - Kandidat E: pengalaman kerja tanpa tanggal (flag `lama_kerja_tidak_disebut`).
  - Hasil ekstraksi di data demo diberi label "contoh hasil" jika tidak benar-benar dihasilkan AI. *Disimpan dengan `sumber = contoh` (migrasi 007); dashboard menampilkan catatan "Data demo: … bukan hasil AI sungguhan".*
- [x] 6.3 Set soal contoh pilihan ganda untuk setiap tes demo, beserta jawaban kandidat A–D yang konsisten dengan skor mereka. *Dicek oleh test integrasi `demo.test.js`: skor tiap tes = jumlah jawaban benar per soal.*
