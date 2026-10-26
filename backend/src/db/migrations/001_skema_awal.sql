-- Skema awal. Invariant penting dijaga di dua lapis: validasi aplikasi
-- (pesan error yang jelas) dan CHECK/UNIQUE/FK di sini (jaring pengaman
-- jika ada jalur tulis lain, misalnya seeder atau query manual).

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE CHECK (email = lower(btrim(email)) AND email LIKE '%_@_%'),
  password_hash TEXT NOT NULL,
  nama          TEXT NOT NULL CHECK (length(btrim(nama)) > 0),
  role          TEXT NOT NULL CHECK (role IN ('rekruter', 'kandidat')),
  dibuat_pada   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE lowongan (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dibuat_oleh      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  posisi           TEXT NOT NULL CHECK (length(btrim(posisi)) > 0),
  budget_maksimal  BIGINT NOT NULL CHECK (budget_maksimal > 0 AND budget_maksimal <= 10000000000000),
  skill_wajib      TEXT[] NOT NULL CHECK (cardinality(skill_wajib) >= 1),
  skill_opsional   TEXT[] NOT NULL DEFAULT '{}',
  kebutuhan_waktu  TEXT NOT NULL CHECK (length(btrim(kebutuhan_waktu)) > 0),
  status           TEXT NOT NULL DEFAULT 'draf' CHECK (status IN ('draf', 'buka', 'tutup')),
  dibuat_pada      TIMESTAMPTZ NOT NULL DEFAULT now(),
  diubah_pada      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX lowongan_dibuat_oleh_idx ON lowongan (dibuat_oleh);
CREATE INDEX lowongan_status_idx ON lowongan (status);

-- Jumlah bobot per lowongan = 1 dijaga di aplikasi (lintas baris).
CREATE TABLE lowongan_tes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lowongan_id  UUID NOT NULL REFERENCES lowongan(id) ON DELETE CASCADE,
  jenis_tes    TEXT NOT NULL CHECK (length(btrim(jenis_tes)) > 0),
  target_skor  NUMERIC(6, 2) NOT NULL CHECK (target_skor <= 100),
  batas_bawah  NUMERIC(6, 2) NOT NULL CHECK (batas_bawah >= 0),
  bobot        NUMERIC(6, 4) NOT NULL CHECK (bobot > 0 AND bobot <= 1),
  urutan       INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT lowongan_tes_target_di_atas_batas CHECK (target_skor > batas_bawah),
  -- DEFERRABLE: dua tes boleh bertukar nama dalam satu transaksi.
  CONSTRAINT lowongan_tes_jenis_unik UNIQUE (lowongan_id, jenis_tes) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE soal (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lowongan_tes_id  UUID NOT NULL REFERENCES lowongan_tes(id) ON DELETE CASCADE,
  pertanyaan       TEXT NOT NULL CHECK (length(btrim(pertanyaan)) > 0),
  opsi             JSONB NOT NULL CHECK (
                     jsonb_typeof(opsi) = 'array'
                     AND jsonb_array_length(opsi) BETWEEN 2 AND 6
                   ),
  kunci_opsi_id    TEXT NOT NULL,
  poin             NUMERIC(6, 2) NOT NULL DEFAULT 1 CHECK (poin > 0),
  urutan           INTEGER NOT NULL DEFAULT 0,
  aktif            BOOLEAN NOT NULL DEFAULT true,
  dibuat_pada      TIMESTAMPTZ NOT NULL DEFAULT now(),
  diubah_pada      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX soal_tes_idx ON soal (lowongan_tes_id, urutan);

-- Satu baris = satu lamaran.
CREATE TABLE kandidat (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  lowongan_id         UUID NOT NULL REFERENCES lowongan(id) ON DELETE RESTRICT,
  nama                TEXT NOT NULL CHECK (length(btrim(nama)) > 0),
  email               TEXT NOT NULL,
  nomor_kontak        TEXT NOT NULL,
  ekspektasi_gaji     BIGINT NOT NULL CHECK (ekspektasi_gaji >= 0 AND ekspektasi_gaji <= 10000000000000),
  ketersediaan_waktu  TEXT NOT NULL CHECK (ketersediaan_waktu IN ('penuh', 'sebagian', 'tidak')),
  persetujuan_data    BOOLEAN NOT NULL CHECK (persetujuan_data = true),
  persetujuan_pada    TIMESTAMPTZ NOT NULL,
  status_aplikasi     TEXT NOT NULL DEFAULT 'dilamar'
                        CHECK (status_aplikasi IN ('dilamar', 'ujian', 'selesai', 'ditolak', 'diterima')),
  skor_akhir          NUMERIC(5, 2) CHECK (skor_akhir BETWEEN 0 AND 100),
  rincian_skor        JSONB,
  skor_dihitung_pada  TIMESTAMPTZ,
  dikirim_pada        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT kandidat_satu_lamaran_per_lowongan UNIQUE (user_id, lowongan_id)
);
CREATE INDEX kandidat_lowongan_idx ON kandidat (lowongan_id);

CREATE TABLE cv_data (
  kandidat_id            UUID PRIMARY KEY REFERENCES kandidat(id) ON DELETE CASCADE,
  kunci_berkas           TEXT NOT NULL,
  status_ekstraksi       TEXT NOT NULL DEFAULT 'menunggu'
                           CHECK (status_ekstraksi IN ('menunggu', 'berhasil', 'gagal', 'perlu_tinjau')),
  skills_mentah          JSONB,
  skills_ternormalisasi  JSONB,
  riwayat_kerja          JSONB,
  total_bulan_kerja      INTEGER CHECK (total_bulan_kerja >= 0),
  jumlah_perusahaan      INTEGER CHECK (jumlah_perusahaan >= 0),
  diekstrak_pada         TIMESTAMPTZ
);

-- RESTRICT pada soal_id: soal yang sudah dijawab tidak bisa dihapus,
-- bahkan lewat query manual. Aplikasi menampilkan pesan yang lebih jelas.
CREATE TABLE jawaban_kandidat (
  kandidat_id   UUID NOT NULL REFERENCES kandidat(id) ON DELETE CASCADE,
  soal_id       UUID NOT NULL REFERENCES soal(id) ON DELETE RESTRICT,
  opsi_dipilih  TEXT,
  benar         BOOLEAN NOT NULL,
  dijawab_pada  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kandidat_id, soal_id)
);
CREATE INDEX jawaban_soal_idx ON jawaban_kandidat (soal_id);

CREATE TABLE ujian_teknis (
  kandidat_id               UUID NOT NULL REFERENCES kandidat(id) ON DELETE CASCADE,
  lowongan_tes_id           UUID NOT NULL REFERENCES lowongan_tes(id) ON DELETE RESTRICT,
  skor_pencapaian           NUMERIC(6, 2) NOT NULL CHECK (skor_pencapaian BETWEEN 0 AND 100),
  durasi_pengerjaan_detik   INTEGER NOT NULL CHECK (durasi_pengerjaan_detik >= 0),
  dimulai_pada              TIMESTAMPTZ NOT NULL,
  dikirim_pada              TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kandidat_id, lowongan_tes_id),
  CHECK (dikirim_pada >= dimulai_pada)
);

CREATE TABLE integritas (
  kandidat_id               UUID PRIMARY KEY REFERENCES kandidat(id) ON DELETE CASCADE,
  status_kamera             TEXT NOT NULL
                              CHECK (status_kamera IN ('granted', 'denied', 'hardware_not_found', 'not_supported')),
  jumlah_keluar_fokus       INTEGER NOT NULL DEFAULT 0 CHECK (jumlah_keluar_fokus >= 0),
  total_detik_keluar_fokus  INTEGER NOT NULL DEFAULT 0 CHECK (total_detik_keluar_fokus >= 0),
  log_pelanggaran           JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(log_pelanggaran) = 'array')
);
