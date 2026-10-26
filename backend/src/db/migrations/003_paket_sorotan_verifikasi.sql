-- Paket kamus per lowongan, sorotan untuk HR, dan verifikasi CV (skor sementara).

-- id paket bawaan dicek aplikasi; daftar paket ada di kode (src/cv/paket).
ALTER TABLE lowongan
  ADD COLUMN paket_kamus TEXT[] NOT NULL DEFAULT '{}'
    CHECK (cardinality(paket_kamus) <= 10);

ALTER TABLE cv_data
  ADD COLUMN sorotan            JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(sorotan) = 'array'),
  ADD COLUMN temuan_lain        JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(temuan_lain) = 'array'),
  ADD COLUMN terverifikasi      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN diverifikasi_oleh  UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN diverifikasi_pada  TIMESTAMPTZ,
  -- Terverifikasi selalu punya waktu verifikasi, dan sebaliknya. diverifikasi_oleh
  -- boleh kosong (akun HR dihapus) tanpa membatalkan verifikasinya.
  ADD CONSTRAINT cv_data_verifikasi_konsisten CHECK (terverifikasi = (diverifikasi_pada IS NOT NULL));
