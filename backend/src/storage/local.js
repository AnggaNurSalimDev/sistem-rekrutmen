import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, stat, rm } from 'node:fs/promises';
import path from 'node:path';

// Kunci berkas selalu dibuat server, tapi tetap divalidasi supaya
// tidak ada "../" yang bisa keluar dari folder storage.
const POLA_KUNCI = /^[a-z0-9-]+(\/[a-z0-9-]+)*\.[a-z0-9]{1,5}$/;
const POLA_FOLDER = /^[a-z0-9-]+$/;
const POLA_EKSTENSI = /^[a-z0-9]{1,5}$/;
const MAKS_UKURAN = 10 * 1024 * 1024;

export function kunciValid(kunci) {
  return typeof kunci === 'string' && kunci.length <= 200 && POLA_KUNCI.test(kunci);
}

/**
 * Storage di disk lokal. Folder storage TIDAK disajikan sebagai file statis;
 * satu-satunya jalan membaca berkas adalah URL bertanda tangan (HMAC) yang
 * kedaluwarsa. Driver S3/Supabase cukup mengikuti antarmuka yang sama.
 */
export function buatStorageLokal({ dir, signingSecret, publicBaseUrl, ttlDetik, sekarang = () => Date.now() }) {
  if (!dir) throw new Error('dir storage wajib diisi');
  if (!signingSecret || signingSecret.length < 32) throw new Error('signingSecret minimal 32 karakter');
  if (!Number.isInteger(ttlDetik) || ttlDetik <= 0) throw new Error('ttlDetik harus bilangan bulat > 0');

  const root = path.resolve(dir);
  const base = publicBaseUrl.replace(/\/+$/, '');

  const tandaTangan = (kunci, exp) => createHmac('sha256', signingSecret).update(`${kunci}\n${exp}`).digest('hex');

  function pathAman(kunci) {
    if (!kunciValid(kunci)) throw new Error('Kunci berkas tidak valid');
    const lengkap = path.resolve(root, kunci);
    if (!lengkap.startsWith(root + path.sep)) throw new Error('Kunci berkas keluar dari folder storage');
    return lengkap;
  }

  return {
    /** Simpan buffer; kembalikan kunci acak buatan server. */
    async simpan(folder, buffer, ekstensi) {
      if (!POLA_FOLDER.test(folder)) throw new Error('Nama folder tidak valid');
      if (!POLA_EKSTENSI.test(ekstensi)) throw new Error('Ekstensi tidak valid');
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('Berkas kosong');
      if (buffer.length > MAKS_UKURAN) throw new Error('Berkas melebihi 10 MB');

      const kunci = `${folder}/${randomUUID()}.${ekstensi}`;
      const tujuan = pathAman(kunci);
      await mkdir(path.dirname(tujuan), { recursive: true });
      await writeFile(tujuan, buffer, { flag: 'wx' });
      return kunci;
    },

    /** Hapus berkas (dipakai saat lamaran gagal disimpan setelah CV terlanjur diunggah). */
    async hapus(kunci) {
      await rm(pathAman(kunci), { force: true });
    },

    /** URL sementara untuk membaca berkas (default TTL dari config). */
    buatUrlBertanda(kunci, ttl = ttlDetik) {
      pathAman(kunci);
      const exp = Math.floor(sekarang() / 1000) + ttl;
      const sig = tandaTangan(kunci, exp);
      return `${base}/files/${kunci}?exp=${exp}&sig=${sig}`;
    },

    /**
     * Mengembalikan isi berkas jika tanda tangan valid dan belum kedaluwarsa.
     * null untuk semua kegagalan (tanda tangan salah, kedaluwarsa, tidak ada)
     * supaya pemanggil tidak membocorkan alasan spesifiknya.
     */
    async bacaJikaSah(kunci, exp, sig) {
      if (!kunciValid(kunci)) return null;
      const expAngka = Number(exp);
      if (!Number.isInteger(expAngka) || expAngka < Math.floor(sekarang() / 1000)) return null;
      if (typeof sig !== 'string' || !/^[a-f0-9]{64}$/.test(sig)) return null;

      const harapan = Buffer.from(tandaTangan(kunci, expAngka), 'hex');
      if (!timingSafeEqual(harapan, Buffer.from(sig, 'hex'))) return null;

      try {
        const lengkap = pathAman(kunci);
        if (!(await stat(lengkap)).isFile()) return null;
        return await readFile(lengkap);
      } catch {
        return null;
      }
    },
  };
}
