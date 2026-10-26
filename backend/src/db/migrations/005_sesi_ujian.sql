-- Sesi ujian: dibuat saat kandidat menekan "Mulai", sebelum ada skor.
-- Menyimpan daftar soal yang ditampilkan, supaya penilaian memakai soal yang
-- sama dengan yang dilihat kandidat walau rekruter mengubah bank soal di tengah ujian.
CREATE TABLE sesi_ujian (
  kandidat_id      UUID NOT NULL REFERENCES kandidat(id) ON DELETE CASCADE,
  lowongan_tes_id  UUID NOT NULL REFERENCES lowongan_tes(id) ON DELETE RESTRICT,
  soal_ids         UUID[] NOT NULL CHECK (cardinality(soal_ids) >= 1),
  dimulai_pada     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kandidat_id, lowongan_tes_id)
);

-- Ujian yang sudah dikirim wajib punya sesi.
ALTER TABLE ujian_teknis
  ADD CONSTRAINT ujian_teknis_punya_sesi
    FOREIGN KEY (kandidat_id, lowongan_tes_id) REFERENCES sesi_ujian (kandidat_id, lowongan_tes_id);

-- Satu kandidat bisa punya beberapa tes; status kamera disimpan per tes di log,
-- kolom status_kamera di integritas menyimpan status terakhir.
COMMENT ON COLUMN integritas.log_pelanggaran IS
  'Array episode keluar fokus per tes: [{tesId, detik, dipotong?}] dan status kamera per tes: [{tesId, statusKamera}]';
