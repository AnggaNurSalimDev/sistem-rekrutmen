import { Router } from 'express';
import { denganTransaksi } from '../db/pool.js';
import { konflik, tidakDitemukan, validasiGagal } from '../http/errors.js';
import { parse, idParam, z } from '../http/validate.js';
import { requireRole } from '../auth/middleware.js';
import { validasiLowongan } from '../scoring/validasi.js';
import { validasiSoal } from '../scoring/soal.js';

const teks = (maks) => z.string().trim().min(1).max(maks);

const skemaTes = z.strictObject({
  id: z.uuid().optional(),
  jenisTes: teks(60),
  targetSkor: z.number().min(0).max(100),
  batasBawah: z.number().min(0).max(100),
  bobot: z.number().gt(0).max(1),
});

const bidangLowongan = {
  posisi: teks(120),
  budgetMaksimal: z.int().positive().max(10_000_000_000_000),
  skillWajib: z.array(teks(60)).min(1).max(50),
  skillOpsional: z.array(teks(60)).max(50).default([]),
  kebutuhanWaktu: teks(300),
};

// Kata/kalimat yang disorot frontend di setiap CV lowongan ini.
// Duplikat (tanpa membedakan huruf besar) ditolak supaya daftar tetap rapi.
const kataKunciSorot = z
  .array(z.string().trim().min(1).max(100))
  .max(50)
  .refine(
    (daftar) => new Set(daftar.map((k) => k.toLowerCase())).size === daftar.length,
    'kata kunci sorot tidak boleh dobel',
  );

const skemaBuat = z.strictObject({
  ...bidangLowongan,
  kataKunciSorot: kataKunciSorot.default([]),
  tes: z.array(skemaTes).min(1).max(10),
});
// kataKunciSorot opsional saat ubah: jika tidak dikirim, daftar lama dipertahankan.
const skemaUbah = z.strictObject({
  ...bidangLowongan,
  kataKunciSorot: kataKunciSorot.optional(),
  tes: z.array(skemaTes).min(1).max(10).optional(),
});
const skemaStatus = z.strictObject({ status: z.enum(['draf', 'buka', 'tutup']) });

/** Cek invariant domain (jumlah bobot = 1, nama tes unik, dst). */
function validasiDomain(data) {
  const nama = data.tes.map((t) => t.jenisTes.toLowerCase());
  const ganda = nama.find((n, i) => nama.indexOf(n) !== i);
  if (ganda) throw validasiGagal(`Nama tes "${ganda}" dipakai lebih dari sekali`, { field: 'tes' });

  validasiLowongan({
    budgetMaksimal: data.budgetMaksimal,
    skillWajib: data.skillWajib,
    tes: data.tes.map((t, i) => ({ ...t, id: t.id ?? `baru-${i}` })),
  });
}

function tampilkanTes(t) {
  return {
    id: t.id,
    jenisTes: t.jenis_tes,
    targetSkor: t.target_skor,
    batasBawah: t.batas_bawah,
    bobot: t.bobot,
    urutan: t.urutan,
    jumlahSoal: t.jumlah_soal ?? 0,
    jumlahSoalAktif: t.jumlah_soal_aktif ?? 0,
  };
}

function tampilkanLowongan(l, tes) {
  return {
    id: l.id,
    posisi: l.posisi,
    budgetMaksimal: l.budget_maksimal,
    skillWajib: l.skill_wajib,
    skillOpsional: l.skill_opsional,
    kebutuhanWaktu: l.kebutuhan_waktu,
    kataKunciSorot: l.kata_kunci_sorot,
    status: l.status,
    jumlahPelamar: l.jumlah_pelamar ?? 0,
    dibuatPada: l.dibuat_pada,
    diubahPada: l.diubah_pada,
    ...(tes ? { tes: tes.map(tampilkanTes) } : {}),
  };
}

const SQL_LOWONGAN = `
  SELECT l.*, (SELECT count(*)::int FROM kandidat k WHERE k.lowongan_id = l.id) AS jumlah_pelamar
  FROM lowongan l`;

const SQL_TES = `
  SELECT t.*,
    (SELECT count(*)::int FROM soal s WHERE s.lowongan_tes_id = t.id) AS jumlah_soal,
    (SELECT count(*)::int FROM soal s WHERE s.lowongan_tes_id = t.id AND s.aktif) AS jumlah_soal_aktif
  FROM lowongan_tes t WHERE t.lowongan_id = $1 ORDER BY t.urutan, t.jenis_tes`;

/**
 * Lowongan milik rekruter ini. Milik rekruter lain → 404 (bukan 403),
 * supaya keberadaan lowongan orang lain tidak bocor.
 * kunci = true mengunci baris (dipakai di dalam transaksi).
 */
export async function ambilLowonganMilik(db, id, userId, { kunci = false } = {}) {
  idParam(id, 'Lowongan');
  if (kunci) {
    const r = await db.query('SELECT id FROM lowongan WHERE id = $1 AND dibuat_oleh = $2 FOR UPDATE', [id, userId]);
    if (r.rows.length === 0) throw tidakDitemukan('Lowongan');
  }
  const { rows } = await db.query(`${SQL_LOWONGAN} WHERE l.id = $1 AND l.dibuat_oleh = $2`, [id, userId]);
  if (rows.length === 0) throw tidakDitemukan('Lowongan');
  return rows[0];
}

async function detail(db, lowongan) {
  const { rows: tes } = await db.query(SQL_TES, [lowongan.id]);
  return tampilkanLowongan(lowongan, tes);
}

async function simpanTes(db, lowonganId, daftarTes) {
  const { rows: lama } = await db.query(SQL_TES, [lowonganId]);
  const lamaPerId = new Map(lama.map((t) => [t.id, t]));

  for (const t of daftarTes) {
    if (t.id && !lamaPerId.has(t.id)) {
      throw validasiGagal(`Tes ${t.id} bukan bagian dari lowongan ini`, { field: 'tes' });
    }
  }

  const idDipertahankan = new Set(daftarTes.filter((t) => t.id).map((t) => t.id));
  const dihapus = lama.filter((t) => !idDipertahankan.has(t.id));
  const masihPunyaSoal = dihapus.filter((t) => t.jumlah_soal > 0);
  if (masihPunyaSoal.length > 0) {
    throw konflik(
      `Tes ${masihPunyaSoal.map((t) => `"${t.jenis_tes}"`).join(', ')} masih punya soal. Hapus soalnya dulu.`,
      { tes: masihPunyaSoal.map((t) => t.id) },
    );
  }
  for (const t of dihapus) await db.query('DELETE FROM lowongan_tes WHERE id = $1', [t.id]);

  for (const [urutan, t] of daftarTes.entries()) {
    const nilai = [t.jenisTes, t.targetSkor, t.batasBawah, t.bobot, urutan];
    if (t.id) {
      await db.query(
        `UPDATE lowongan_tes SET jenis_tes = $1, target_skor = $2, batas_bawah = $3, bobot = $4, urutan = $5
         WHERE id = $6`,
        [...nilai, t.id],
      );
    } else {
      await db.query(
        `INSERT INTO lowongan_tes (jenis_tes, target_skor, batas_bawah, bobot, urutan, lowongan_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [...nilai, lowonganId],
      );
    }
  }
}

/** Syarat membuka lowongan: semua invariant lolos + tiap tes punya soal aktif yang valid. */
async function pastikanBisaDibuka(db, lowongan) {
  const { rows: tes } = await db.query(SQL_TES, [lowongan.id]);
  validasiLowongan({
    budgetMaksimal: lowongan.budget_maksimal,
    skillWajib: lowongan.skill_wajib,
    tes: tes.map((t) => ({
      id: t.id,
      jenisTes: t.jenis_tes,
      targetSkor: t.target_skor,
      batasBawah: t.batas_bawah,
      bobot: t.bobot,
    })),
  });

  const tanpaSoal = tes.filter((t) => t.jumlah_soal_aktif === 0);
  if (tanpaSoal.length > 0) {
    throw konflik(
      `Lowongan belum bisa dibuka. Tes tanpa soal aktif: ${tanpaSoal.map((t) => `"${t.jenis_tes}"`).join(', ')}`,
      { tes: tanpaSoal.map((t) => t.id) },
    );
  }

  const { rows: soal } = await db.query(
    `SELECT s.id, s.pertanyaan, s.opsi, s.kunci_opsi_id, s.poin
     FROM soal s JOIN lowongan_tes t ON t.id = s.lowongan_tes_id
     WHERE t.lowongan_id = $1 AND s.aktif`,
    [lowongan.id],
  );
  for (const s of soal) {
    validasiSoal({ id: s.id, pertanyaan: s.pertanyaan, opsi: s.opsi, kunciOpsiId: s.kunci_opsi_id, poin: s.poin });
  }
}

export function ruteLowongan({ pool, requireAuth }) {
  const r = Router();
  r.use(requireAuth, requireRole('rekruter'));

  r.get('/', async (req, res) => {
    const { rows } = await pool.query(`${SQL_LOWONGAN} WHERE l.dibuat_oleh = $1 ORDER BY l.dibuat_pada DESC`, [
      req.user.id,
    ]);
    res.json({ data: rows.map((l) => tampilkanLowongan(l)) });
  });

  r.post('/', async (req, res) => {
    const data = parse(skemaBuat, req.body);
    validasiDomain(data);

    const hasil = await denganTransaksi(pool, async (db) => {
      const { rows } = await db.query(
        `INSERT INTO lowongan
           (dibuat_oleh, posisi, budget_maksimal, skill_wajib, skill_opsional, kebutuhan_waktu, kata_kunci_sorot)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
          req.user.id,
          data.posisi,
          data.budgetMaksimal,
          data.skillWajib,
          data.skillOpsional,
          data.kebutuhanWaktu,
          data.kataKunciSorot,
        ],
      );
      await simpanTes(db, rows[0].id, data.tes);
      return detail(db, await ambilLowonganMilik(db, rows[0].id, req.user.id));
    });
    res.status(201).json({ data: hasil });
  });

  r.get('/:id', async (req, res) => {
    const lowongan = await ambilLowonganMilik(pool, req.params.id, req.user.id);
    res.json({ data: await detail(pool, lowongan) });
  });

  r.put('/:id', async (req, res) => {
    const data = parse(skemaUbah, req.body);

    const hasil = await denganTransaksi(pool, async (db) => {
      const lowongan = await ambilLowonganMilik(db, req.params.id, req.user.id, { kunci: true });

      if (data.tes) {
        if (lowongan.status !== 'draf') {
          throw konflik('Konfigurasi tes hanya bisa diubah saat lowongan berstatus draf');
        }
        validasiDomain(data);
      } else {
        const { rows: tes } = await db.query(SQL_TES, [lowongan.id]);
        validasiDomain({
          ...data,
          tes: tes.map((t) => ({ ...tampilkanTes(t) })),
        });
      }

      await db.query(
        `UPDATE lowongan SET posisi = $1, budget_maksimal = $2, skill_wajib = $3, skill_opsional = $4,
           kebutuhan_waktu = $5, kata_kunci_sorot = COALESCE($6, kata_kunci_sorot), diubah_pada = now()
         WHERE id = $7`,
        [
          data.posisi,
          data.budgetMaksimal,
          data.skillWajib,
          data.skillOpsional,
          data.kebutuhanWaktu,
          data.kataKunciSorot ?? null,
          lowongan.id,
        ],
      );
      if (data.tes) await simpanTes(db, lowongan.id, data.tes);
      return detail(db, await ambilLowonganMilik(db, lowongan.id, req.user.id));
    });
    res.json({ data: hasil });
  });

  r.patch('/:id/status', async (req, res) => {
    const { status } = parse(skemaStatus, req.body);

    const hasil = await denganTransaksi(pool, async (db) => {
      const lowongan = await ambilLowonganMilik(db, req.params.id, req.user.id, { kunci: true });

      if (status !== lowongan.status) {
        if (status === 'buka') await pastikanBisaDibuka(db, lowongan);
        if (status === 'tutup' && lowongan.status !== 'buka') {
          throw konflik('Hanya lowongan yang sedang dibuka yang bisa ditutup');
        }
        if (status === 'draf' && lowongan.jumlah_pelamar > 0) {
          throw konflik('Lowongan yang sudah punya pelamar tidak bisa dikembalikan ke draf');
        }
        await db.query('UPDATE lowongan SET status = $1, diubah_pada = now() WHERE id = $2', [status, lowongan.id]);
      }
      return detail(db, await ambilLowonganMilik(db, lowongan.id, req.user.id));
    });
    res.json({ data: hasil });
  });

  r.delete('/:id', async (req, res) => {
    await denganTransaksi(pool, async (db) => {
      const lowongan = await ambilLowonganMilik(db, req.params.id, req.user.id, { kunci: true });
      if (lowongan.jumlah_pelamar > 0) {
        throw konflik('Lowongan yang sudah punya pelamar tidak bisa dihapus. Tutup lowongan sebagai gantinya.');
      }
      await db.query('DELETE FROM lowongan WHERE id = $1', [lowongan.id]);
    });
    res.status(204).end();
  });

  return r;
}
