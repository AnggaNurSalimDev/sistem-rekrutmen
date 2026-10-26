import { useCallback, useEffect, useRef, useState } from 'react';
import { buatPelacakFokus, pasangPendengarFokus } from './pelacakFokus.js';
import { hentikanKamera, mintaKamera } from './kamera.js';

// sessionStorage bisa melempar (mode privat, diblokir); tanpa itu catatan
// hanya hidup selama halaman tidak dimuat ulang. Server tetap menghitung
// berapa kali halaman tes dibuka ulang, terpisah dari catatan ini.
const simpan = {
  ambil(kunci) {
    try {
      return JSON.parse(sessionStorage.getItem(kunci) ?? 'null');
    } catch {
      return null;
    }
  },
  set(kunci, nilai) {
    try {
      sessionStorage.setItem(kunci, JSON.stringify(nilai));
    } catch {
      /* diabaikan */
    }
  },
  hapus(kunci) {
    try {
      sessionStorage.removeItem(kunci);
    } catch {
      /* diabaikan */
    }
  },
};

/**
 * Integrity signals selama ujian berlangsung (`aktif = true`):
 * - menghitung episode keluar fokus (lihat pelacakFokus.js), tersimpan
 *   di sessionStorage dengan kunci `kunciSimpan` supaya tahan dimuat ulang,
 * - meminta kamera sekali. Ujian TIDAK menunggu jawaban izin kamera.
 *
 * Saat komponen dilepas, pendengar dilepas dan kamera dimatikan.
 */
export function useIntegritas(aktif, kunciSimpan) {
  const pelacak = useRef(null);
  if (pelacak.current === null) {
    pelacak.current = buatPelacakFokus({ awal: kunciSimpan ? simpan.ambil(kunciSimpan) : null });
  }

  const [jumlahKeluar, setJumlahKeluar] = useState(() => pelacak.current.ringkasan().jumlah);
  const [kamera, setKamera] = useState({ status: 'menunggu', stream: null });

  useEffect(() => {
    if (!aktif) return undefined;
    const p = pelacak.current;
    const perbarui = () => {
      setJumlahKeluar(p.ringkasan().jumlah);
      if (kunciSimpan) simpan.set(kunciSimpan, p.serialisasi());
    };
    // Episode yang terbuka saat halaman sebelumnya ditutup/dimuat ulang ditutup sekarang.
    p.kembali();
    perbarui();
    return pasangPendengarFokus(p, { saatBerubah: perbarui });
  }, [aktif, kunciSimpan]);

  useEffect(() => {
    if (!aktif) return undefined;
    let batal = false;
    let stream = null;
    mintaKamera().then((hasil) => {
      stream = hasil.stream;
      if (batal) hentikanKamera(stream);
      else setKamera(hasil);
    });
    return () => {
      batal = true;
      hentikanKamera(stream);
    };
  }, [aktif]);

  /** Ringkasan untuk dikirim; episode yang masih terbuka ditutup sekarang. */
  const selesaikan = useCallback(() => {
    pelacak.current.tutup();
    return pelacak.current.ringkasan();
  }, []);

  /** Dipanggil setelah jawaban berhasil dikirim. */
  const bersihkan = useCallback(() => {
    if (kunciSimpan) simpan.hapus(kunciSimpan);
  }, [kunciSimpan]);

  return { jumlahKeluar, kamera, selesaikan, bersihkan };
}
