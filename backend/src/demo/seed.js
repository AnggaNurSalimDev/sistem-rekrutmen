/**
 * Mengisi database dengan data demo (Tahap 6).
 *
 * Prinsip:
 * - Data dibuat LEWAT API aplikasi itu sendiri (server dijalankan di proses
 *   ini), bukan INSERT langsung. Jadi skor, verifikasi kutipan CV, penilaian
 *   soal, dan log integritas dihitung oleh kode yang sama dengan pengguna asli.
 *   Pengecualian yang disengaja dan dibatasi: waktu mulai tes dimundurkan
 *   supaya durasi tes masuk akal, dan sumber CV ditandai 'contoh'.
 * - Hanya menyentuh akun berdomain demo (DOMAIN_DEMO). Data lain di database
 *   tidak pernah dihapus atau diubah.
 * - Bisa dijalankan berulang: data demo lama dihapus dulu, lalu dibuat ulang.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buatApp } from '../app.js';
import { hashPassword } from '../auth/password.js';
import { denganTransaksi } from '../db/pool.js';
import { DOMAIN_DEMO, LOWONGAN, PASSWORD_DEMO, PELAMAR, REKRUTER } from './data.js';
import { BULAN_ACUAN } from './generator.js';
import { buatPdfCv } from './pdfSederhana.js';

const FOLDER_CV = new URL('./cv/', import.meta.url);
const CV_SCAN = 'bayu-saputra-scan.pdf';
const STATUS_LOWONGAN = new Set(['draf', 'buka', 'tutup']);
const MAKS_HARI_LALU = 60;
// Di lowongan yang masih dibuka, HR demo hanya menolak kandidat yang skornya jelas rendah.
const AMBANG_TOLAK = 60;

/** Teks CV yang dihasilkan generator, dalam bentuk yang dibandingkan dengan kutipan (sama seperti verifikasi: spasi/baris baru disamakan, huruf kecil). */
const ratakan = (teks) => teks.toLowerCase().replace(/\s+/g, ' ');
const POLA_EMAIL_DEMO = `%@${DOMAIN_DEMO}`;

export const emailPelamar = (akun) => `${akun}@${DOMAIN_DEMO}`;

/** Invariant data demo, dicek sebelum menyentuh database. */
export function periksaDataDemo() {
  const kunciLowongan = new Set(LOWONGAN.map((l) => l.kunci));
  for (const l of LOWONGAN) {
    if (!STATUS_LOWONGAN.has(l.status)) throw new Error(`Lowongan ${l.kunci}: status "${l.status}" tidak dikenal`);
    if (l.status === 'draf' && PELAMAR.some((p) => p.lowongan === l.kunci)) throw new Error(`Lowongan ${l.kunci}: draf tidak boleh punya pelamar`);
    if (l.keputusan) {
      const { diterima = 0, ditolakTerbawah = 0, ditolakSisanya = false } = l.keputusan;
      if (!Number.isInteger(diterima) || diterima < 0 || !Number.isInteger(ditolakTerbawah) || ditolakTerbawah < 0) {
        throw new Error(`Lowongan ${l.kunci}: jumlah keputusan harus bilangan bulat ≥ 0`);
      }
      if (ditolakSisanya && l.status !== 'tutup') throw new Error(`Lowongan ${l.kunci}: "tolak sisanya" hanya untuk lowongan yang ditutup`);
    }
  }
  const akun = new Set();
  const nama = PELAMAR.map((p) => p.nama);
  for (const p of PELAMAR) {
    if (!kunciLowongan.has(p.lowongan)) throw new Error(`Pelamar ${p.nama}: lowongan "${p.lowongan}" tidak ada`);
    if (akun.has(p.akun)) throw new Error(`Akun demo ganda: ${p.akun}`);
    akun.add(p.akun);
    // Parser contoh mengenali CV dari baris pertamanya (nama). Nama yang menjadi bagian nama lain akan tertukar.
    const tabrakan = nama.find((n) => n !== p.nama && n.includes(p.nama));
    if (tabrakan) throw new Error(`Nama demo "${p.nama}" adalah bagian dari "${tabrakan}"`);
    if (!Number.isInteger(p.hariLalu) || p.hariLalu < 0 || p.hariLalu > MAKS_HARI_LALU) throw new Error(`Pelamar ${p.nama}: hariLalu harus 0–${MAKS_HARI_LALU}`);
    const sumberCv = [p.cv, p.cvBaris, p.cvScan].filter(Boolean).length;
    if (sumberCv !== 1) throw new Error(`Pelamar ${p.nama}: harus punya tepat satu sumber CV (cv, cvBaris, atau cvScan)`);
    if (p.cvBaris && p.contohHasil) {
      // Kutipan contoh harus benar-benar ada di CV, supaya verifikasi kutipan tidak membuangnya.
      const teks = ratakan(p.cvBaris.map((b) => b.teks).join('\n'));
      const semua = [...p.contohHasil.skills, ...p.contohHasil.riwayatKerja, ...p.contohHasil.temuanLain];
      const dikarang = new Set(p.kutipanDikarang ?? []);
      for (const t of semua) if (dikarang.has(t.kutipan) === teks.includes(ratakan(t.kutipan))) throw new Error(`Pelamar ${p.nama}: kutipan "${t.kutipan}" ${dikarang.has(t.kutipan) ? 'sengaja dikarang tapi ternyata ada' : 'tidak ada'} di CV`);
      for (const r of p.contohHasil.riwayatKerja) {
        for (const tgl of [r.mulai, r.selesai]) {
          if (tgl && tgl > `${BULAN_ACUAN.tahun}-${String(BULAN_ACUAN.bulan).padStart(2, '0')}`) throw new Error(`Pelamar ${p.nama}: tanggal kerja ${tgl} di masa depan`);
        }
      }
    }
    if (p.isiManual && p.contohHasil) throw new Error(`Pelamar ${p.nama}: isiManual hanya untuk CV yang gagal dibaca`);
    if (p.keputusan && !(p.konfirmasiHr || p.isiManual)) throw new Error(`Pelamar ${p.nama}: keputusan butuh CV yang sudah dicek HR`);
    const l = LOWONGAN.find((x) => x.kunci === p.lowongan);
    for (const [jenis, u] of Object.entries(p.ujian)) {
      const soal = l.soal[jenis];
      if (!soal) throw new Error(`Pelamar ${p.nama}: tes "${jenis}" tidak ada di ${l.kunci}`);
      if (!Number.isInteger(u.benar) || u.benar < 0 || u.benar > soal.length) {
        throw new Error(`Pelamar ${p.nama}: jumlah benar ${u.benar} di luar 0–${soal.length}`);
      }
      const totalKeluar = u.keluar.reduce((t, d) => t + d, 0);
      if (totalKeluar > u.menit * 60) throw new Error(`Pelamar ${p.nama}: waktu keluar halaman melebihi lama tes ${jenis}`);
    }
  }
  for (const l of LOWONGAN) {
    for (const t of l.body.tes) {
      if (!l.soal[t.jenisTes]?.length) throw new Error(`Lowongan ${l.kunci}: tes "${t.jenisTes}" tanpa soal`);
    }
  }
}

/** Hapus semua data milik akun demo. Mengembalikan kunci berkas CV yang perlu dihapus dari storage. */
export async function hapusDataDemo(pool) {
  return denganTransaksi(pool, async (db) => {
    const { rows: berkas } = await db.query(
      `SELECT c.kunci_berkas FROM cv_data c JOIN kandidat k ON k.id = c.kandidat_id
         JOIN users u ON u.id = k.user_id
        WHERE u.email LIKE $1 AND c.kunci_berkas IS NOT NULL`,
      [POLA_EMAIL_DEMO],
    );
    // Urutan penting: pelamar (beserta jawaban/ujian/sesi) → lowongan (beserta tes/soal) → akun.
    await db.query(
      `DELETE FROM kandidat WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)
          OR lowongan_id IN (SELECT l.id FROM lowongan l JOIN users u ON u.id = l.dibuat_oleh WHERE u.email LIKE $1)`,
      [POLA_EMAIL_DEMO],
    );
    await db.query('DELETE FROM lowongan WHERE dibuat_oleh IN (SELECT id FROM users WHERE email LIKE $1)', [POLA_EMAIL_DEMO]);
    const { rowCount } = await db.query('DELETE FROM users WHERE email LIKE $1', [POLA_EMAIL_DEMO]);
    return { kunciBerkas: berkas.map((b) => b.kunci_berkas), jumlahAkun: rowCount };
  });
}

/** Parser "AI" untuk demo: mengembalikan contohHasil milik pelamar yang namanya di baris pertama CV. */
function buatParserContoh() {
  const perNama = new Map(PELAMAR.filter((p) => p.contohHasil).map((p) => [p.nama, p]));
  return async (teks) => {
    const p = perNama.get(teks.split('\n')[0].trim());
    if (!p) throw Object.assign(new Error('CV demo tidak dikenal'), { bisaDiulang: false });
    return structuredClone(p.contohHasil);
  };
}

async function berkasCv(p) {
  if (p.cvBaris) return { pdf: buatPdfCv(p.cvBaris, `CV ${p.nama} (fiktif, data demo)`), nama: `${p.akun}.pdf` };
  const file = p.cvScan ? CV_SCAN : p.cv;
  return { pdf: await readFile(fileURLToPath(new URL(file, FOLDER_CV))), nama: file };
}

function klienApi(baseUrl) {
  return async function api(path, { method = 'GET', body, form, token } = {}) {
    const headers = token ? { authorization: `Bearer ${token}` } : {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(`${baseUrl}${path}`, { method, headers, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined) });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${data?.error?.pesan ?? 'tanpa pesan'}`);
    return data;
  };
}

async function buatAkun(pool, email, nama, role, hash) {
  await pool.query('INSERT INTO users (email, password_hash, nama, role) VALUES ($1, $2, $3, $4)', [email, hash, nama, role]);
}

/**
 * Lamaran demo disebar ke beberapa minggu terakhir (bukan semuanya "hari ini").
 * Semua waktu milik satu lamaran digeser bersama, jadi urutan dan durasinya tetap.
 */
async function mundurkanWaktu(pool, kandidatId, hari, jam) {
  await denganTransaksi(pool, async (db) => {
    const geser = `make_interval(days => $2, hours => $3)`;
    await db.query(`UPDATE kandidat SET dikirim_pada = dikirim_pada - ${geser}, persetujuan_pada = persetujuan_pada - ${geser} WHERE id = $1`, [kandidatId, hari, jam]);
    await db.query(`UPDATE sesi_ujian SET dimulai_pada = dimulai_pada - ${geser} WHERE kandidat_id = $1`, [kandidatId, hari, jam]);
    await db.query(`UPDATE ujian_teknis SET dimulai_pada = dimulai_pada - ${geser}, dikirim_pada = dikirim_pada - ${geser} WHERE kandidat_id = $1`, [kandidatId, hari, jam]);
    await db.query(`UPDATE jawaban_kandidat SET dijawab_pada = dijawab_pada - ${geser} WHERE kandidat_id = $1`, [kandidatId, hari, jam]);
  });
}

/**
 * @returns {Promise<{rekruter: string, pelamar: string[], lowongan: object[]}>}
 */
export async function isiDataDemo({ pool, config, storage, log = console }) {
  periksaDataDemo();

  const lama = await hapusDataDemo(pool);
  for (const kunci of lama.kunciBerkas) await storage.hapus(kunci).catch(() => {});
  if (lama.jumlahAkun > 0) log.info?.(`Data demo lama dihapus (${lama.jumlahAkun} akun).`);

  // Akun dibuat langsung supaya seeder tetap jalan walau pendaftaran rekruter ditutup (ALLOW_REKRUTER_SIGNUP=false).
  // Semua akun demo berpassword sama, jadi hash dihitung sekali (scrypt sengaja lambat).
  const hash = await hashPassword(PASSWORD_DEMO);
  await buatAkun(pool, REKRUTER.email, REKRUTER.nama, 'rekruter', hash);
  for (const p of PELAMAR) await buatAkun(pool, emailPelamar(p.akun), p.nama, 'kandidat', hash);

  const app = buatApp({ pool, config, storage, parserAi: buatParserContoh(), log: { error() {}, info() {}, warn() {} } });
  const server = await new Promise((ok) => {
    const s = app.listen(0, '127.0.0.1', () => ok(s));
  });
  try {
    const api = klienApi(`http://127.0.0.1:${server.address().port}`);
    const masuk = async (email) => (await api('/auth/login', { method: 'POST', body: { email, password: PASSWORD_DEMO } })).token;
    const tokenHr = await masuk(REKRUTER.email);

    // Lowongan + bank soal. Kunci jawaban disimpan untuk menjawab sesuai skenario.
    const lowongan = {};
    for (const l of LOWONGAN) {
      const { data } = await api('/lowongan', { method: 'POST', token: tokenHr, body: l.body });
      const tes = {};
      for (const t of data.tes) {
        const kunci = new Map();
        for (const s of l.soal[t.jenisTes]) {
          const r = await api(`/tes/${t.id}/soal`, { method: 'POST', token: tokenHr, body: s });
          kunci.set(r.data.id, { benar: s.kunciOpsiId, salah: s.opsi.find((o) => o.id !== s.kunciOpsiId).id });
        }
        tes[t.jenisTes] = { id: t.id, kunci };
      }
      // Lowongan yang nanti ditutup tetap dibuka dulu, supaya pelamarnya bisa melamar dan tes.
      if (l.status !== 'draf') await api(`/lowongan/${data.id}/status`, { method: 'PATCH', token: tokenHr, body: { status: 'buka' } });
      lowongan[l.kunci] = { id: data.id, posisi: l.body.posisi, tes };
    }

    const waktuMundur = [];
    for (const [indeks, p] of PELAMAR.entries()) {
      const token = await masuk(emailPelamar(p.akun));
      const l = lowongan[p.lowongan];
      const form = new FormData();
      form.set('lowonganId', l.id);
      form.set('nama', p.nama);
      form.set('nomorKontak', p.nomorKontak ?? `0800-1111-${String(indeks + 1).padStart(4, '0')}`);
      form.set('ekspektasiGaji', String(p.gaji));
      form.set('ketersediaanWaktu', p.waktu);
      form.set('persetujuanData', 'true');
      const cv = await berkasCv(p);
      form.set('cv', new Blob([cv.pdf], { type: 'application/pdf' }), cv.nama);
      const { data: lamaran } = await api('/lamaran', { method: 'POST', token, form });

      // Hasil "baca CV" demo ditulis tangan: tandai jujur sebagai contoh.
      await pool.query(`UPDATE cv_data SET sumber_ekstraksi = 'contoh' WHERE kandidat_id = $1 AND sumber_ekstraksi = 'ai'`, [lamaran.id]);

      for (const [jenis, u] of Object.entries(p.ujian)) {
        const t = l.tes[jenis];
        const { data: sesi } = await api(`/lamaran/${lamaran.id}/ujian/${t.id}/mulai`, { method: 'POST', token });
        for (let i = 0; i < (u.dibukaUlang ?? 0); i++) await api(`/lamaran/${lamaran.id}/ujian/${t.id}/mulai`, { method: 'POST', token });
        // Tes dikerjakan "beberapa menit lalu", supaya durasi dan batas waktu keluar halaman masuk akal.
        await pool.query(
          `UPDATE sesi_ujian SET dimulai_pada = now() - make_interval(mins => $3) WHERE kandidat_id = $1 AND lowongan_tes_id = $2`,
          [lamaran.id, t.id, u.menit],
        );
        const jawaban = sesi.soal.map((s, i) => ({ soalId: s.id, opsiDipilih: i < u.benar ? t.kunci.get(s.id).benar : t.kunci.get(s.id).salah }));
        await api(`/lamaran/${lamaran.id}/ujian/${t.id}/kirim`, {
          method: 'POST',
          token,
          body: { jawaban, integritas: { statusKamera: u.kamera, episodeKeluarFokus: u.keluar.map((detik) => ({ detik })) } },
        });
      }

      if (p.konfirmasiHr) await api(`/kandidat/${lamaran.id}/cv/konfirmasi`, { method: 'POST', token: tokenHr });
      if (p.isiManual) await api(`/kandidat/${lamaran.id}/cv`, { method: 'PUT', token: tokenHr, body: p.isiManual });
      if (p.keputusan) await api(`/kandidat/${lamaran.id}/status`, { method: 'PATCH', token: tokenHr, body: { keputusan: p.keputusan } });
      // Jam ikut digeser sedikit (deterministik) supaya lamaran di hari yang sama tidak berjam sama.
      waktuMundur.push([lamaran.id, p.hariLalu, (indeks * 7) % 10]);
    }

    for (const [id, hari, jam] of waktuMundur) await mundurkanWaktu(pool, id, hari, jam);

    for (const l of LOWONGAN) {
      const info = lowongan[l.kunci];
      // Skor dihitung ulang lewat jalur yang sama dengan HR mengubah lowongan, karena
      // lama kerja "masih bekerja" dihitung sampai tanggal lamaran yang baru saja dimundurkan.
      if (PELAMAR.some((p) => p.lowongan === l.kunci)) {
        const { tes: _tes, ...umum } = l.body;
        await api(`/lowongan/${info.id}`, { method: 'PUT', token: tokenHr, body: umum });
      }
      // Keputusan HR mengikuti peringkat skor (CV sudah dicek, semua tes selesai): N teratas diterima,
      // maksimal M terbawah yang skornya di bawah ambang ditolak. Lowongan yang ditutup: semua sisanya ditolak
      // (posisinya sudah terisi).
      if (l.keputusan) {
        const { diterima = 0, ditolakTerbawah = 0, ditolakSisanya = false } = l.keputusan;
        const { data: daftar } = await api(`/lowongan/${info.id}/kandidat`, { token: tokenHr });
        const urut = daftar
          .filter((k) => k.cv.terverifikasi && k.skorAkhir !== null && !['diterima', 'ditolak'].includes(k.statusAplikasi))
          .sort((a, b) => b.skorAkhir - a.skorAkhir);
        if (diterima > urut.length) {
          throw new Error(`Lowongan ${l.kunci}: hanya ${urut.length} kandidat siap diputuskan, butuh ${diterima} diterima`);
        }
        for (const [i, k] of urut.entries()) {
          let keputusan = null;
          if (i < diterima) keputusan = 'diterima';
          else if (ditolakSisanya) keputusan = 'ditolak';
          else if (i >= Math.max(diterima, urut.length - ditolakTerbawah) && k.skorAkhir < AMBANG_TOLAK) keputusan = 'ditolak';
          if (keputusan) await api(`/kandidat/${k.id}/status`, { method: 'PATCH', token: tokenHr, body: { keputusan } });
        }
      }
      if (l.status === 'tutup') await api(`/lowongan/${info.id}/status`, { method: 'PATCH', token: tokenHr, body: { status: 'tutup' } });

      // Lowongan dibuat beberapa hari sebelum pelamar pertamanya; yang ditutup "diubah" saat ditutup.
      const hari = PELAMAR.filter((p) => p.lowongan === l.kunci).map((p) => p.hariLalu);
      const dibuat = (hari.length ? Math.max(...hari) : 0) + 3;
      const diubah = l.status === 'tutup' ? Math.max(Math.min(...hari) - 4, 0) : hari.length ? Math.min(...hari) : 1;
      await pool.query(
        `UPDATE lowongan SET dibuat_pada = now() - make_interval(days => $2), diubah_pada = now() - make_interval(days => $3) WHERE id = $1`,
        [info.id, dibuat, Math.min(diubah, dibuat)],
      );
    }

    return {
      rekruter: REKRUTER.email,
      pelamar: PELAMAR.map((p) => emailPelamar(p.akun)),
      lowongan: Object.values(lowongan).map(({ id, posisi }) => ({ id, posisi })),
    };
  } finally {
    await new Promise((ok) => server.close(ok));
  }
}
