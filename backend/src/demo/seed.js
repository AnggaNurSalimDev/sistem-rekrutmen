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

const FOLDER_CV = new URL('./cv/', import.meta.url);
const POLA_EMAIL_DEMO = `%@${DOMAIN_DEMO}`;

export const emailPelamar = (akun) => `${akun}@${DOMAIN_DEMO}`;

/** Invariant data demo, dicek sebelum menyentuh database. */
export function periksaDataDemo() {
  const kunciLowongan = new Set(LOWONGAN.map((l) => l.kunci));
  const akun = new Set();
  for (const p of PELAMAR) {
    if (!kunciLowongan.has(p.lowongan)) throw new Error(`Pelamar ${p.nama}: lowongan "${p.lowongan}" tidak ada`);
    if (akun.has(p.akun)) throw new Error(`Akun demo ganda: ${p.akun}`);
    akun.add(p.akun);
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

/** Parser "AI" untuk demo: mengembalikan contohHasil milik pelamar yang namanya ada di teks CV. */
function buatParserContoh() {
  return async (teks) => {
    const p = PELAMAR.find((x) => x.contohHasil && teks.includes(x.nama));
    if (!p) throw Object.assign(new Error('CV demo tidak dikenal'), { bisaDiulang: false });
    return structuredClone(p.contohHasil);
  };
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

async function buatAkun(pool, email, nama, role) {
  const hash = await hashPassword(PASSWORD_DEMO);
  await pool.query('INSERT INTO users (email, password_hash, nama, role) VALUES ($1, $2, $3, $4)', [email, hash, nama, role]);
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
  await buatAkun(pool, REKRUTER.email, REKRUTER.nama, 'rekruter');
  for (const p of PELAMAR) await buatAkun(pool, emailPelamar(p.akun), p.nama, 'kandidat');

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
      await api(`/lowongan/${data.id}/status`, { method: 'PATCH', token: tokenHr, body: { status: l.status } });
      lowongan[l.kunci] = { id: data.id, posisi: l.body.posisi, tes };
    }

    for (const p of PELAMAR) {
      const token = await masuk(emailPelamar(p.akun));
      const l = lowongan[p.lowongan];
      const form = new FormData();
      form.set('lowonganId', l.id);
      form.set('nama', p.nama);
      form.set('nomorKontak', `0800-1111-${String(PELAMAR.indexOf(p) + 1).padStart(4, '0')}`);
      form.set('ekspektasiGaji', String(p.gaji));
      form.set('ketersediaanWaktu', p.waktu);
      form.set('persetujuanData', 'true');
      const pdf = await readFile(fileURLToPath(new URL(p.cv, FOLDER_CV)));
      form.set('cv', new Blob([pdf], { type: 'application/pdf' }), p.cv);
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
      if (p.keputusan) await api(`/kandidat/${lamaran.id}/status`, { method: 'PATCH', token: tokenHr, body: { keputusan: p.keputusan } });
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
