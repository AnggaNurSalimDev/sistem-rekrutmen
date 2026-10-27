-- Data demo: hasil "baca CV" yang ditulis tangan untuk contoh, bukan dari AI.
-- Disimpan dengan sumber 'contoh' supaya dashboard bisa memberi label yang jujur.
ALTER TABLE cv_data DROP CONSTRAINT cv_data_sumber_ekstraksi_check;
ALTER TABLE cv_data
  ADD CONSTRAINT cv_data_sumber_ekstraksi_check CHECK (sumber_ekstraksi IN ('ai', 'manual', 'contoh'));
