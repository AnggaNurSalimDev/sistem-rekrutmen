-- Dihitung server setiap kali sesi ujian yang sudah ada dibuka lagi (muat ulang,
-- tab ditutup lalu dibuka). Berbeda dari catatan keluar fokus di browser,
-- angka ini tidak bisa dihapus dari sisi kandidat.
ALTER TABLE sesi_ujian
  ADD COLUMN jumlah_dibuka_ulang INTEGER NOT NULL DEFAULT 0 CHECK (jumlah_dibuka_ulang >= 0);
