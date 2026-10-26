import { Router } from 'express';
import multer from 'multer';
import { denganTransaksi } from '../db/pool.js';
import { HttpError, konflik, tidakDitemukan, validasiGagal } from '../http/errors.js';
import { parse, idParam, z } from '../http/validate.js';
import { requireRole } from '../auth/middleware.js';
import { ekstrakTeksPdf, prosesCv } from '../cv/index.js';
import { hitungRiwayatKerja } from '../scoring/riwayatKerja.js';
import { soalUntukKandidat, nilaiJawabanPilihanGanda } from '../scoring/soal.js';
import { hitungUlangSkor } from '../layanan/skor.js';

const UKURAN_CV_MAKS = 10 * 1024 * 1024;

const unggah = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UKURAN_CV_MAKS, files: 1, fields: 20, fieldSize: 10_000 },
});

/** Bungkus multer supaya errornya menjadi respons yang jelas, bukan 500. */
function terimaCv(req, res, next) {
  unggah.single('cv')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, 'TERLALU_BESAR', 'CV maksimal 10 MB'));
    if (err instanceof multer.MulterError) return next(validasiGagal(`Unggahan tidak valid: ${err.message}`));
    return next(err);
  });
}

const skemaLamaran = z.strictObject({
  lowonganId: z.uuid(),
  nama: z.string().trim().min(1).max(120),
  nomorKontak: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s()]{8,20}$/, 'nomor kontak hanya boleh angka, spasi, +, -, dan tanda kurung (8–20 karakter)'),
  ekspektasiGaji: z.coerce.number().int().min(0).max(10_000_000_000_000),
  ketersediaanWaktu: z.enum(['penuh', 'sebagian', 'tidak']),
  // Dikirim sebagai teks dari form multipart. Selain "true" = tidak setuju.
  persetujuanData: z.literal('true', { error: 'persetujuan pemrosesan data wajib dicentang' }),
});

const skemaKirim = z.strictObject({
  jawaban: z
    .array(z.strictObject({ soalId: z.uuid(), opsiDipilih: z.string().trim().min(1).max(20).nullable() }))
    .max(500),
  integritas: z.strictObject({
    statusKamera: z.enum(['granted', 'denied', 'hardware_not_found', 'not_supported']),
    episodeKeluarFokus: z.array(z.strictObject({ detik: z.number().min(0).max(86_400) })).max(1000),
  }),
});

// ------------------------------------------------------------ tampilan kandidat

/**
 * Yang boleh dilihat kandidat: status lamarannya dan status tiap tes.
 * Skor, rincian skor, hasil ekstraksi CV, dan integritas TIDAK ditampilkan.
 */
async function tampilanLamaran(db, kandidatId) {
  const { rows } = await db.query(
    `SELECT k.id, k.status_aplikasi, k.dikirim_pada, l.id AS lowongan_id, l.posisi, l.status AS status_lowongan,
       COALESCE(json_agg(json_build_object(
         'id', t.id,
         'jenisTes', t.jenis_tes,
         'status', CASE
           WHEN u.kandidat_id IS NOT NULL THEN 'selesai'
           WHEN s.kandidat_id IS NOT NULL THEN 'berlangsung'
           ELSE 'belum' END
       ) ORDER BY t.urutan) FILTER (WHERE t.id IS NOT NULL), '[]') AS tes
     FROM kandidat k
     JOIN lowongan l ON l.id = k.lowongan_id
     LEFT JOIN lowongan_tes t ON t.lowongan_id = l.id
     LEFT JOIN sesi_ujian s ON s.kandidat_id = k.id AND s.lowongan_tes_id = t.id
     LEFT JOIN ujian_teknis u ON u.kandidat_id = k.id AND u.lowongan_tes_id = t.id
     WHERE k.id = $1
     GROUP BY k.id, l.id`,
    [kandidatId],
  );
  const l = rows[0];
  return {
    id: l.id,
    lowongan: { id: l.lowongan_id, posisi: l.posisi, status: l.status_lowongan },
    statusAplikasi: l.status_aplikasi,
    dikirimPada: l.dikirim_pada,
    tes: l.tes,
  };
}

/** Lamaran milik kandidat yang login. Milik orang lain → 404. */
async function ambilLamaranMilik(db, id, userId, { kunci = false } = {}) {
  idParam(id, 'Lamaran');
  const { rows } = await db.query(
    `SELECT k.id, k.lowongan_id, l.status AS status_lowongan
     FROM kandidat k JOIN lowongan l ON l.id = k.lowongan_id
     WHERE k.id = $1 AND k.user_id = $2 ${kunci ? 'FOR UPDATE OF k' : ''}`,
    [id, userId],
  );
  if (rows.length === 0) throw tidakDitemukan('Lamaran');
  return rows[0];
}

async function ambilTesLamaran(db, lamaran, tesId) {
  idParam(tesId, 'Tes');
  const { rows } = await db.query('SELECT id, jenis_tes FROM lowongan_tes WHERE id = $1 AND lowongan_id = $2', [
    tesId,
    lamaran.lowongan_id,
  ]);
  if (rows.length === 0) throw tidakDitemukan('Tes');
  return rows[0];
}

async function soalSesi(db, soalIds) {
  const { rows } = await db.query('SELECT * FROM soal WHERE id = ANY($1)', [soalIds]);
  // Soal yang ditampilkan saat mulai tetap dipakai walau sesudahnya dinonaktifkan rekruter.
  return rows.map((s) => ({
    id: s.id,
    pertanyaan: s.pertanyaan,
    opsi: s.opsi,
    kunciOpsiId: s.kunci_opsi_id,
    poin: s.poin,
    urutan: s.urutan,
    aktif: true,
  }));
}

// ------------------------------------------------------------------- rute

export function ruteLamaran({ pool, storage, parserAi, requireAuth, log = console }) {
  const r = Router();
  r.use(requireAuth, requireRole('kandidat'));

  r.post('/', terimaCv, async (req, res) => {
    const data = parse(skemaLamaran, req.body);
    const berkas = req.file;
    if (!berkas || berkas.size === 0) throw validasiGagal('CV wajib diunggah dalam format PDF', { field: 'cv' });
    if (berkas.buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw validasiGagal('CV harus berupa berkas PDF', { field: 'cv' });
    }

    // Cek murah dulu, sebelum menyimpan berkas dan memanggil AI.
    const { rows: lowonganRows } = await pool.query(
      'SELECT id, status, skill_wajib, skill_opsional FROM lowongan WHERE id = $1',
      [data.lowonganId],
    );
    const lowongan = lowonganRows[0];
    if (!lowongan || lowongan.status === 'draf') throw tidakDitemukan('Lowongan');
    if (lowongan.status !== 'buka') throw konflik('Lowongan ini sudah ditutup');

    const { rows: sudah } = await pool.query('SELECT 1 FROM kandidat WHERE user_id = $1 AND lowongan_id = $2', [
      req.user.id,
      lowongan.id,
    ]);
    if (sudah.length > 0) throw konflik('Anda sudah melamar lowongan ini');

    const kunciBerkas = await storage.simpan('cv', berkas.buffer, 'pdf');
    try {
      const ekstraksi = await ekstrakTeksPdf(berkas.buffer);
      const cv = ekstraksi.ok
        ? await prosesCv({
            teks: ekstraksi.teks,
            parserAi,
            skillLowongan: [...lowongan.skill_wajib, ...lowongan.skill_opsional],
          })
        : { status: 'gagal', sumber: null, skills: [], riwayatKerja: [], rincian: null, sorotan: [], alasanTinjau: [ekstraksi.alasan] };

      const tanggalHariIni = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
      const riwayat = hitungRiwayatKerja(cv.riwayatKerja, tanggalHariIni);

      const kandidatId = await denganTransaksi(pool, async (db) => {
        const { rows } = await db.query(
          `INSERT INTO kandidat (user_id, lowongan_id, nama, email, nomor_kontak, ekspektasi_gaji,
             ketersediaan_waktu, persetujuan_data, persetujuan_pada)
           VALUES ($1, $2, $3, $4, $5, $6, $7, true, now()) RETURNING id`,
          [req.user.id, lowongan.id, data.nama, req.user.email, data.nomorKontak, data.ekspektasiGaji, data.ketersediaanWaktu],
        );
        const id = rows[0].id;
        await db.query(
          `INSERT INTO cv_data (kandidat_id, kunci_berkas, status_ekstraksi, sumber_ekstraksi, teks_cv,
             skills_mentah, riwayat_kerja, rincian_ai, sorotan, alasan_tinjau,
             total_bulan_kerja, jumlah_perusahaan, diekstrak_pada)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())`,
          [
            id,
            kunciBerkas,
            cv.status,
            cv.sumber,
            ekstraksi.ok ? ekstraksi.teks : null,
            JSON.stringify(cv.skills),
            JSON.stringify(cv.riwayatKerja),
            cv.rincian ? JSON.stringify(cv.rincian) : null,
            JSON.stringify(cv.sorotan),
            JSON.stringify(cv.alasanTinjau),
            riwayat.totalBulan,
            riwayat.jumlahPerusahaan,
          ],
        );
        await hitungUlangSkor(db, id);
        return id;
      });

      res.status(201).json({ data: await tampilanLamaran(pool, kandidatId) });
    } catch (err) {
      await storage.hapus(kunciBerkas).catch((e) => log.error?.('Gagal menghapus CV yatim', e));
      if (err.code === '23505') throw konflik('Anda sudah melamar lowongan ini');
      throw err;
    }
  });

  r.get('/', async (req, res) => {
    const { rows } = await pool.query('SELECT id FROM kandidat WHERE user_id = $1 ORDER BY dikirim_pada DESC', [
      req.user.id,
    ]);
    const data = await Promise.all(rows.map((k) => tampilanLamaran(pool, k.id)));
    res.json({ data });
  });

  r.get('/:id', async (req, res) => {
    const lamaran = await ambilLamaranMilik(pool, req.params.id, req.user.id);
    res.json({ data: await tampilanLamaran(pool, lamaran.id) });
  });

  // ---------------------------------------------------------------- ujian

  r.post('/:id/ujian/:tesId/mulai', async (req, res) => {
    const hasil = await denganTransaksi(pool, async (db) => {
      const lamaran = await ambilLamaranMilik(db, req.params.id, req.user.id, { kunci: true });
      const tes = await ambilTesLamaran(db, lamaran, req.params.tesId);

      const { rows: terkirim } = await db.query(
        'SELECT 1 FROM ujian_teknis WHERE kandidat_id = $1 AND lowongan_tes_id = $2',
        [lamaran.id, tes.id],
      );
      if (terkirim.length > 0) throw konflik('Ujian ini sudah dikirim');

      // Sesi yang sudah ada dilanjutkan (misalnya halaman dimuat ulang); waktu mulai tidak diulang.
      let { rows: sesi } = await db.query(
        'SELECT soal_ids, dimulai_pada FROM sesi_ujian WHERE kandidat_id = $1 AND lowongan_tes_id = $2',
        [lamaran.id, tes.id],
      );
      if (sesi.length === 0) {
        if (lamaran.status_lowongan !== 'buka') throw konflik('Lowongan sudah ditutup; ujian tidak bisa dimulai');
        const { rows: soalAktif } = await db.query(
          'SELECT id FROM soal WHERE lowongan_tes_id = $1 AND aktif ORDER BY urutan, dibuat_pada',
          [tes.id],
        );
        if (soalAktif.length === 0) throw konflik('Tes ini belum punya soal');
        ({ rows: sesi } = await db.query(
          `INSERT INTO sesi_ujian (kandidat_id, lowongan_tes_id, soal_ids)
           VALUES ($1, $2, $3) RETURNING soal_ids, dimulai_pada`,
          [lamaran.id, tes.id, soalAktif.map((s) => s.id)],
        ));
        await db.query("UPDATE kandidat SET status_aplikasi = 'ujian' WHERE id = $1 AND status_aplikasi = 'dilamar'", [
          lamaran.id,
        ]);
      }

      return {
        tesId: tes.id,
        jenisTes: tes.jenis_tes,
        dimulaiPada: sesi[0].dimulai_pada,
        soal: soalUntukKandidat(await soalSesi(db, sesi[0].soal_ids)),
      };
    });
    res.json({ data: hasil });
  });

  r.post('/:id/ujian/:tesId/kirim', async (req, res) => {
    const data = parse(skemaKirim, req.body);

    const hasil = await denganTransaksi(pool, async (db) => {
      const lamaran = await ambilLamaranMilik(db, req.params.id, req.user.id, { kunci: true });
      const tes = await ambilTesLamaran(db, lamaran, req.params.tesId);

      const { rows: sesi } = await db.query(
        `SELECT soal_ids, dimulai_pada, GREATEST(0, floor(EXTRACT(EPOCH FROM now() - dimulai_pada)))::int AS durasi
         FROM sesi_ujian WHERE kandidat_id = $1 AND lowongan_tes_id = $2`,
        [lamaran.id, tes.id],
      );
      if (sesi.length === 0) throw konflik('Ujian belum dimulai');
      const { rows: terkirim } = await db.query(
        'SELECT 1 FROM ujian_teknis WHERE kandidat_id = $1 AND lowongan_tes_id = $2',
        [lamaran.id, tes.id],
      );
      if (terkirim.length > 0) throw konflik('Ujian ini sudah dikirim');

      const daftarSoal = await soalSesi(db, sesi[0].soal_ids);
      const idSesi = new Set(sesi[0].soal_ids);
      const idAda = new Set(daftarSoal.map((s) => s.id));
      // Soal dari sesi yang sempat dihapus rekruter dilewati; soal di luar sesi tetap ditolak.
      const jawaban = data.jawaban.filter((j) => !idSesi.has(j.soalId) || idAda.has(j.soalId));
      const nilai = nilaiJawabanPilihanGanda(daftarSoal, jawaban);

      for (const r of nilai.rincian) {
        await db.query(
          'INSERT INTO jawaban_kandidat (kandidat_id, soal_id, opsi_dipilih, benar) VALUES ($1, $2, $3, $4)',
          [lamaran.id, r.soalId, r.opsiDipilih, r.benar],
        );
      }
      const durasi = sesi[0].durasi;
      const { rows: kirim } = await db.query(
        `INSERT INTO ujian_teknis (kandidat_id, lowongan_tes_id, skor_pencapaian, durasi_pengerjaan_detik, dimulai_pada)
         VALUES ($1, $2, $3, $4, $5) RETURNING dikirim_pada`,
        [lamaran.id, tes.id, Math.round(nilai.skorPencapaian * 100) / 100, durasi, sesi[0].dimulai_pada],
      );

      // Integrity signals: dikirim browser, jadi hanya indikatif. Total detik
      // keluar fokus tidak mungkin melebihi lama ujian; jika lebih, dipotong dan dicatat.
      const { statusKamera, episodeKeluarFokus } = data.integritas;
      const dilaporkan = Math.round(episodeKeluarFokus.reduce((t, e) => t + e.detik, 0));
      const totalDetik = Math.min(dilaporkan, durasi);
      const log = [
        { tesId: tes.id, jenis: 'kamera', statusKamera },
        ...episodeKeluarFokus.map((e) => ({ tesId: tes.id, jenis: 'keluar_fokus', detik: Math.round(e.detik) })),
        ...(dilaporkan > durasi ? [{ tesId: tes.id, jenis: 'dipotong', dilaporkan, durasi }] : []),
      ];
      await db.query(
        `INSERT INTO integritas (kandidat_id, status_kamera, jumlah_keluar_fokus, total_detik_keluar_fokus, log_pelanggaran)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (kandidat_id) DO UPDATE SET
           status_kamera = EXCLUDED.status_kamera,
           jumlah_keluar_fokus = integritas.jumlah_keluar_fokus + EXCLUDED.jumlah_keluar_fokus,
           total_detik_keluar_fokus = integritas.total_detik_keluar_fokus + EXCLUDED.total_detik_keluar_fokus,
           log_pelanggaran = integritas.log_pelanggaran || EXCLUDED.log_pelanggaran`,
        [lamaran.id, statusKamera, episodeKeluarFokus.length, totalDetik, JSON.stringify(log)],
      );

      const { rows: sisa } = await db.query(
        `SELECT count(*)::int AS n FROM lowongan_tes t
         WHERE t.lowongan_id = $1
           AND NOT EXISTS (SELECT 1 FROM ujian_teknis u WHERE u.kandidat_id = $2 AND u.lowongan_tes_id = t.id)`,
        [lamaran.lowongan_id, lamaran.id],
      );
      if (sisa[0].n === 0) {
        await db.query("UPDATE kandidat SET status_aplikasi = 'selesai' WHERE id = $1 AND status_aplikasi IN ('dilamar', 'ujian')", [
          lamaran.id,
        ]);
      }

      await hitungUlangSkor(db, lamaran.id);
      return { terkirim: true, dikirimPada: kirim[0].dikirim_pada };
    });
    res.json({ data: hasil });
  });

  return r;
}
