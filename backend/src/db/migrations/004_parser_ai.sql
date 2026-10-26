-- Parser regex dan paket kamus diganti parser AI + kata kunci sorot dari rekruter.

ALTER TABLE lowongan DROP COLUMN paket_kamus;

-- Kata/kalimat yang ditulis rekruter untuk disorot di setiap CV lowongan ini.
-- Penyorotan dilakukan di frontend; backend hanya menyimpan daftarnya.
ALTER TABLE lowongan
  ADD COLUMN kata_kunci_sorot TEXT[] NOT NULL DEFAULT '{}'
    CHECK (cardinality(kata_kunci_sorot) <= 50);

-- Sumber ekstraksi sekarang hanya AI atau isian/koreksi manual HR.
ALTER TABLE cv_data DROP CONSTRAINT cv_data_sumber_ekstraksi_check;
UPDATE cv_data SET sumber_ekstraksi = NULL WHERE sumber_ekstraksi = 'regex';
ALTER TABLE cv_data
  ADD CONSTRAINT cv_data_sumber_ekstraksi_check CHECK (sumber_ekstraksi IN ('ai', 'manual')),
  -- Rincian dari AI (kutipan per temuan) untuk ditampilkan ke HR.
  ADD COLUMN rincian_ai JSONB;
