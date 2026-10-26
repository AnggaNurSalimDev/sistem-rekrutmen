-- Kolom pendukung parser CV 3 mode dan tinjauan manual oleh HR.
ALTER TABLE cv_data
  ADD COLUMN teks_cv          TEXT,
  ADD COLUMN sumber_ekstraksi TEXT CHECK (sumber_ekstraksi IN ('regex', 'ai', 'manual')),
  ADD COLUMN alasan_tinjau    JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(alasan_tinjau) = 'array'),
  ADD COLUMN dikoreksi_oleh   UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN dikoreksi_pada   TIMESTAMPTZ,
  -- Hasil koreksi manual wajib punya waktu koreksi (penanda agar tidak ditimpa parse ulang).
  ADD CONSTRAINT cv_data_manual_punya_waktu_koreksi
    CHECK (sumber_ekstraksi IS DISTINCT FROM 'manual' OR dikoreksi_pada IS NOT NULL);

CREATE INDEX cv_data_perlu_tinjau_idx ON cv_data (status_ekstraksi)
  WHERE status_ekstraksi IN ('perlu_tinjau', 'gagal');
