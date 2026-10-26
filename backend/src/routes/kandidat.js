import { Router } from 'express';
import { denganTransaksi } from '../db/pool.js';
import { konflik, tidakDitemukan, validasiGagal } from '../http/errors.js';
import { parse, idParam, z } from '../http/validate.js';
import { requireRole } from '../auth/middleware.js';
import { hitungUlangSkor } from '../layanan/skor.js';
import { hitungRiwayatKerja } from '../scoring/riwayatKerja.js';
import { ambilLowonganMilik } from './lowongan.js';

const BULAN = /^\d{4}-(0[1-9]|1[0-2])$/;

const skemaKoreksi = z.strictObject({
  skills: z.array(z.string().trim().min(1).max(80)).max(100),
  riwayatKerja: z
    .array(
      z
        .strictObject({
          perusahaan: z.string().trim().min(1).max(200),
          mulai: z.string().regex(BULAN, 'format YYYY-MM').nullable(),
          selesai: z.string().regex(BULAN, 'format YYYY-MM').nullable(),
        })
        .refine((r) => r.mulai !== null || r.selesai === null, {
          message: 'isi tanggal mulai, atau kosongkan keduanya jika lama kerja tidak diketahui',
          path: ['mulai'],
        })
        .refine((r) => r.mulai === null || r.selesai === null || r.selesai >= r.mulai, {
          message: 'tanggal selesai tidak boleh sebelum tanggal mulai',
          path: ['selesai'],
        }),
    )
    .max(30),
});

const skemaKeputusan = z.strictObject({ keputusan: z.enum(['diterima', 'ditolak']).nullable() });

const tanggalHariIni = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

/** Kandidat yang melamar ke lowongan milik rekruter ini. Selain itu → 404. */
async function ambilKandidatMilik(db, id, userId, { kunci = false } = {}) {
  idParam(id, 'Kandidat');
  const { rows } = await db.query(
    `SELECT k.*, l.posisi, l.kata_kunci_sorot, l.skill_wajib, l.skill_opsional, l.budget_maksimal, l.kebutuhan_waktu
     FROM kandidat k JOIN lowongan l ON l.id = k.lowongan_id
     WHERE k.id = $1 AND l.dibuat_oleh = $2 ${kunci ? 'FOR UPDATE OF k' : ''}`,
    [id, userId],
  );
  if (rows.length === 0) throw tidakDitemukan('Kandidat');
  return rows[0];
}

/** Status progres tanpa keputusan rekruter: dilamar → ujian → selesai. */
async function statusProgres(db, kandidatId, lowonganId) {
  const { rows } = await db.query(
    `SELECT
       (SELECT count(*)::int FROM lowongan_tes WHERE lowongan_id = $2) AS jumlah_tes,
       (SELECT count(*)::int FROM ujian_teknis WHERE kandidat_id = $1) AS terkirim,
       (SELECT count(*)::int FROM sesi_ujian WHERE kandidat_id = $1) AS sesi`,
    [kandidatId, lowonganId],
  );
  const r = rows[0];
  if (r.jumlah_tes > 0 && r.terkirim >= r.jumlah_tes) return 'selesai';
  return r.sesi > 0 ? 'ujian' : 'dilamar';
}

const ringkasSkor = (r) =>
  r
    ? { status: r.status, sementara: Boolean(r.sementara), komponen: r.komponen ?? null, flags: r.flags ?? [], galat: r.galat }
    : null;

const SQL_DAFTAR = `
  SELECT k.id, k.nama, k.email, k.nomor_kontak, k.ekspektasi_gaji, k.ketersediaan_waktu, k.status_aplikasi,
         k.dikirim_pada, k.skor_akhir, k.rincian_skor,
         c.status_ekstraksi, c.terverifikasi, c.sumber_ekstraksi,
         i.status_kamera, i.jumlah_keluar_fokus, i.total_detik_keluar_fokus,
         (SELECT COALESCE(sum(s.jumlah_dibuka_ulang), 0)::int FROM sesi_ujian s WHERE s.kandidat_id = k.id) AS dibuka_ulang,
         (SELECT COALESCE(json_agg(json_build_object('tesId', u.lowongan_tes_id, 'skor', u.skor_pencapaian,
            'durasiDetik', u.durasi_pengerjaan_detik)), '[]') FROM ujian_teknis u WHERE u.kandidat_id = k.id) AS ujian
  FROM kandidat k
  LEFT JOIN cv_data c ON c.kandidat_id = k.id
  LEFT JOIN integritas i ON i.kandidat_id = k.id`;

function tampilkanBaris(k) {
  return {
    id: k.id,
    nama: k.nama,
    email: k.email,
    nomorKontak: k.nomor_kontak,
    ekspektasiGaji: k.ekspektasi_gaji,
    ketersediaanWaktu: k.ketersediaan_waktu,
    statusAplikasi: k.status_aplikasi,
    dikirimPada: k.dikirim_pada,
    skorAkhir: k.skor_akhir,
    skor: ringkasSkor(k.rincian_skor),
    cv: {
      statusEkstraksi: k.status_ekstraksi ?? null,
      terverifikasi: k.terverifikasi === true,
      sumber: k.sumber_ekstraksi ?? null,
    },
    integritas: k.status_kamera
      ? {
          statusKamera: k.status_kamera,
          jumlahKeluarFokus: k.jumlah_keluar_fokus,
          totalDetikKeluarFokus: k.total_detik_keluar_fokus,
          dibukaUlang: k.dibuka_ulang,
        }
      : null,
    ujian: k.ujian,
  };
}

/** Rute /lowongan/:lowonganId/kandidat */
export function ruteKandidatPerLowongan({ pool, requireAuth }) {
  const r = Router({ mergeParams: true });
  r.use(requireAuth, requireRole('rekruter'));

  r.get('/', async (req, res) => {
    const lowongan = await ambilLowonganMilik(pool, req.params.lowonganId, req.user.id);
    const { rows } = await pool.query(`${SQL_DAFTAR} WHERE k.lowongan_id = $1 ORDER BY k.dikirim_pada DESC`, [
      lowongan.id,
    ]);
    res.json({ data: rows.map(tampilkanBaris) });
  });

  return r;
}

/** Rute /kandidat/:id */
export function ruteKandidat({ pool, storage, requireAuth }) {
  const r = Router();
  r.use(requireAuth, requireRole('rekruter'));

  r.get('/:id', async (req, res) => {
    const k = await ambilKandidatMilik(pool, req.params.id, req.user.id);
    const [{ rows: baris }, { rows: cvRows }, { rows: tes }, { rows: ujian }, { rows: jawaban }, { rows: integritas }] =
      await Promise.all([
        pool.query(`${SQL_DAFTAR} WHERE k.id = $1`, [k.id]),
        pool.query('SELECT * FROM cv_data WHERE kandidat_id = $1', [k.id]),
        pool.query('SELECT id, jenis_tes, target_skor, batas_bawah, bobot FROM lowongan_tes WHERE lowongan_id = $1 ORDER BY urutan', [
          k.lowongan_id,
        ]),
        pool.query('SELECT * FROM ujian_teknis WHERE kandidat_id = $1', [k.id]),
        pool.query(
          `SELECT j.soal_id, j.opsi_dipilih, j.benar, s.pertanyaan, s.opsi, s.kunci_opsi_id, s.lowongan_tes_id, s.urutan
           FROM jawaban_kandidat j JOIN soal s ON s.id = j.soal_id
           WHERE j.kandidat_id = $1 ORDER BY s.urutan, s.dibuat_pada`,
          [k.id],
        ),
        pool.query('SELECT * FROM integritas WHERE kandidat_id = $1', [k.id]),
      ]);
    const cv = cvRows[0];
    const i = integritas[0];

    res.json({
      data: {
        ...tampilkanBaris(baris[0]),
        lowongan: {
          id: k.lowongan_id,
          posisi: k.posisi,
          kataKunciSorot: k.kata_kunci_sorot,
          skillWajib: k.skill_wajib,
          skillOpsional: k.skill_opsional,
          budgetMaksimal: k.budget_maksimal,
          kebutuhanWaktu: k.kebutuhan_waktu,
        },
        rincianSkor: k.rincian_skor,
        cv: cv
          ? {
              statusEkstraksi: cv.status_ekstraksi,
              sumber: cv.sumber_ekstraksi,
              terverifikasi: cv.terverifikasi,
              diverifikasiPada: cv.diverifikasi_pada,
              alasanTinjau: cv.alasan_tinjau,
              teks: cv.teks_cv,
              sorotan: cv.sorotan,
              skills: Array.isArray(cv.skills_mentah) ? cv.skills_mentah : [],
              riwayatKerja: Array.isArray(cv.riwayat_kerja) ? cv.riwayat_kerja : [],
              rincianAi: cv.rincian_ai,
              urlPdf: storage.buatUrlBertanda(cv.kunci_berkas),
            }
          : null,
        tes: tes.map((t) => {
          const u = ujian.find((x) => x.lowongan_tes_id === t.id);
          return {
            id: t.id,
            jenisTes: t.jenis_tes,
            targetSkor: t.target_skor,
            batasBawah: t.batas_bawah,
            bobot: t.bobot,
            hasil: u
              ? { skor: u.skor_pencapaian, durasiDetik: u.durasi_pengerjaan_detik, dikirimPada: u.dikirim_pada }
              : null,
            jawaban: jawaban
              .filter((j) => j.lowongan_tes_id === t.id)
              .map((j) => ({
                soalId: j.soal_id,
                pertanyaan: j.pertanyaan,
                opsi: j.opsi,
                kunciOpsiId: j.kunci_opsi_id,
                opsiDipilih: j.opsi_dipilih,
                benar: j.benar,
              })),
          };
        }),
        integritasLengkap: i
          ? {
              statusKamera: i.status_kamera,
              jumlahKeluarFokus: i.jumlah_keluar_fokus,
              totalDetikKeluarFokus: i.total_detik_keluar_fokus,
              log: i.log_pelanggaran,
            }
          : null,
      },
    });
  });

  // Konfirmasi tanpa perubahan: hasil parser dianggap benar oleh HR.
  r.post('/:id/cv/konfirmasi', async (req, res) => {
    const hasil = await denganTransaksi(pool, async (db) => {
      const k = await ambilKandidatMilik(db, req.params.id, req.user.id, { kunci: true });
      const { rows } = await db.query('SELECT status_ekstraksi, terverifikasi FROM cv_data WHERE kandidat_id = $1', [k.id]);
      const cv = rows[0];
      if (!cv) throw konflik('Kandidat ini tidak punya data CV');
      if (!['berhasil', 'perlu_tinjau'].includes(cv.status_ekstraksi)) {
        throw konflik('CV belum punya data yang bisa dikonfirmasi. Isi data CV lewat koreksi.');
      }
      if (!cv.terverifikasi) {
        await db.query(
          `UPDATE cv_data SET terverifikasi = true, diverifikasi_oleh = $2, diverifikasi_pada = now()
           WHERE kandidat_id = $1`,
          [k.id, req.user.id],
        );
      }
      return hitungUlangSkor(db, k.id);
    });
    res.json({ data: ringkasSkor(hasil) });
  });

  // Koreksi atau isi manual: data dari HR menggantikan hasil parser.
  r.put('/:id/cv', async (req, res) => {
    const data = parse(skemaKoreksi, req.body);
    // Dobel (beda huruf besar) dibuang; penulisan pertama dari HR yang dipakai.
    const unik = new Map();
    for (const s of data.skills) if (!unik.has(s.toLowerCase())) unik.set(s.toLowerCase(), s);
    const skills = [...unik.values()];

    const riwayat = hitungRiwayatKerja(data.riwayatKerja, tanggalHariIni());
    if (riwayat.entriDibuang.length > 0) {
      const e = riwayat.entriDibuang[0];
      throw validasiGagal(`Riwayat kerja ke-${e.indeks + 1}: ${e.alasan}`, { field: `riwayatKerja.${e.indeks}` });
    }

    const hasil = await denganTransaksi(pool, async (db) => {
      const k = await ambilKandidatMilik(db, req.params.id, req.user.id, { kunci: true });
      const { rowCount } = await db.query(
        `UPDATE cv_data SET skills_mentah = $2, riwayat_kerja = $3, total_bulan_kerja = $4, jumlah_perusahaan = $5,
           status_ekstraksi = 'berhasil', sumber_ekstraksi = 'manual', alasan_tinjau = '[]',
           terverifikasi = true, diverifikasi_oleh = $6, diverifikasi_pada = now(),
           dikoreksi_oleh = $6, dikoreksi_pada = now()
         WHERE kandidat_id = $1`,
        [k.id, JSON.stringify(skills), JSON.stringify(data.riwayatKerja), riwayat.totalBulan, riwayat.jumlahPerusahaan, req.user.id],
      );
      if (rowCount === 0) throw konflik('Kandidat ini tidak punya data CV');
      return hitungUlangSkor(db, k.id);
    });
    res.json({ data: ringkasSkor(hasil) });
  });

  // Keputusan rekruter. null = batalkan keputusan (kembali ke status progres).
  r.patch('/:id/status', async (req, res) => {
    const { keputusan } = parse(skemaKeputusan, req.body);
    const status = await denganTransaksi(pool, async (db) => {
      const k = await ambilKandidatMilik(db, req.params.id, req.user.id, { kunci: true });
      const baru = keputusan ?? (await statusProgres(db, k.id, k.lowongan_id));
      await db.query('UPDATE kandidat SET status_aplikasi = $1 WHERE id = $2', [baru, k.id]);
      return baru;
    });
    res.json({ data: { statusAplikasi: status } });
  });

  return r;
}
