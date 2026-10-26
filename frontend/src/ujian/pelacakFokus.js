/**
 * Menghitung keluar fokus per EPISODE, bukan per event browser.
 *
 * Satu kali pindah tab biasanya memicu dua event (window "blur" lalu
 * "visibilitychange" → hidden), dan saat kembali juga dua ("visible" lalu
 * "focus"). Kalau setiap event dihitung, satu kali pindah tab tercatat 2x.
 *
 * Aturannya:
 * - Episode dibuka oleh event hilang-fokus PERTAMA. Event hilang-fokus
 *   berikutnya selama episode masih terbuka diabaikan.
 * - Episode ditutup oleh event kembali PERTAMA. Event kembali tanpa
 *   episode terbuka diabaikan.
 *
 * Status bisa diserialisasi dan dipulihkan, supaya memuat ulang halaman
 * tidak menghapus catatan. Episode yang masih terbuka saat halaman ditutup
 * ditutup saat halaman dibuka lagi, jadi memuat ulang ikut terhitung sebagai
 * keluar halaman. Karena itu waktu memakai jam dinding (Date.now), bukan
 * performance.now yang mulai dari nol setiap halaman dimuat.
 *
 * Fungsi murni (waktu disuntikkan), supaya bisa diuji tanpa browser.
 */
export function buatPelacakFokus({ sekarang = () => Date.now(), awal = null } = {}) {
  if (typeof sekarang !== 'function') throw new Error('sekarang harus fungsi');

  let mulai = null;
  let episode = [];
  if (awal && typeof awal === 'object') {
    if (Number.isFinite(awal.mulai)) mulai = awal.mulai;
    if (Array.isArray(awal.episode)) {
      episode = awal.episode.filter((e) => Number.isFinite(e?.detik) && e.detik >= 0).map((e) => ({ detik: e.detik }));
    }
  }

  return {
    hilang() {
      if (mulai === null) mulai = sekarang();
    },

    kembali() {
      if (mulai === null) return;
      const detik = Math.max(0, (sekarang() - mulai) / 1000);
      episode.push({ detik: Math.round(detik * 10) / 10 });
      mulai = null;
    },

    /** Dipanggil saat jawaban dikirim: episode yang masih terbuka ditutup sekarang. */
    tutup() {
      this.kembali();
    },

    sedangKeluar() {
      return mulai !== null;
    },

    ringkasan() {
      return {
        jumlah: episode.length,
        totalDetik: Math.round(episode.reduce((t, e) => t + e.detik, 0) * 10) / 10,
        episode: episode.map((e) => ({ ...e })),
      };
    },

    /** Bentuk yang aman disimpan (JSON). */
    serialisasi() {
      return { mulai, episode: episode.map((e) => ({ ...e })) };
    },
  };
}

/**
 * Pasang pendengar event browser ke pelacak. Mengembalikan fungsi untuk
 * melepasnya. `jendela`/`dokumen` disuntikkan supaya bisa diuji.
 * "pagehide" (muat ulang, tutup tab) membuka episode, sama seperti pindah tab.
 */
export function pasangPendengarFokus(pelacak, { jendela = window, dokumen = document, saatBerubah = () => {} } = {}) {
  const hilang = () => {
    pelacak.hilang();
    saatBerubah();
  };
  const kembali = () => {
    pelacak.kembali();
    saatBerubah();
  };
  const visibilitas = () => (dokumen.visibilityState === 'hidden' ? hilang() : kembali());

  jendela.addEventListener('blur', hilang);
  jendela.addEventListener('focus', kembali);
  jendela.addEventListener('pagehide', hilang);
  dokumen.addEventListener('visibilitychange', visibilitas);
  return () => {
    jendela.removeEventListener('blur', hilang);
    jendela.removeEventListener('focus', kembali);
    jendela.removeEventListener('pagehide', hilang);
    dokumen.removeEventListener('visibilitychange', visibilitas);
  };
}
