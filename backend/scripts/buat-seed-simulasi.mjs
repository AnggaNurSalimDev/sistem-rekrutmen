/**
 * Membuat frontend/src/simulasi/data/seed.json: snapshot lengkap data demo
 * (lowongan, soal, kandidat, skor — semuanya) untuk MODE SIMULASI (situs tanpa
 * backend, lihat frontend/src/simulasi/README.md).
 *
 * Tidak menyentuh database atau server. Semua dihitung langsung di Node lewat
 * modul backend yang sama dengan yang dipakai server sungguhan (scoring engine,
 * verifikasi kutipan CV, pembuat PDF) — supaya data simulasi dipercaya persis
 * seperti hasil backend/src/demo/seed.js, bukan ditulis ulang dengan tangan.
 *
 * Jalankan ulang setiap backend/src/demo/data.js atau generator.js berubah:
 *   node scripts/buat-seed-simulasi.mjs
 */
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { DOMAIN_DEMO, LOWONGAN, PASSWORD_DEMO, PELAMAR, REKRUTER } from '../src/demo/data.js';
import { buatPdfCv } from '../src/demo/pdfSederhana.js';
import { ekstrakTeksPdf } from '../src/cv/ekstrakTeks.js';
import { verifikasiHasilAi } from '../src/cv/verifikasi.js';
import { hitungRiwayatKerja } from '../src/scoring/riwayatKerja.js';
import { hitungSkorKandidat } from '../src/scoring/index.js';
import { nilaiJawabanPilihanGanda } from '../src/scoring/soal.js';

const FOLDER_CV = new URL('../src/demo/cv/', import.meta.url);
const CV_SCAN = 'bayu-saputra-scan.pdf';
const VERSI_SEED = '2026-11-01.1'; // naikkan setiap data.js/generator.js berubah isinya

const sekarang = () => new Date().toISOString();
const emailPelamar = (akun) => `${akun}@${DOMAIN_DEMO}`;
const geserHari = (hari, jam = 0) => new Date(Date.now() - hari * 86_400_000 - jam * 3_600_000).toISOString();
const yyyymmdd = (iso) => iso.slice(0, 10);

async function berkasCv(p) {
  if (p.cvBaris) return buatPdfCv(p.cvBaris, `CV ${p.nama} (fiktif, data demo)`);
  const nama = p.cvScan ? CV_SCAN : p.cv;
  return readFile(fileURLToPath(new URL(nama, FOLDER_CV)));
}

function keDataUrl(buffer) {
  return `data:application/pdf;base64,${buffer.toString('base64')}`;
}

async function main() {
  const toko = {
    versi: VERSI_SEED,
    users: [],
    lowongan: [],
    lowonganTes: [],
    soal: [],
    kandidat: [],
    cvData: [],
    jawabanKandidat: [],
    ujianTeknis: [],
    integritas: [],
    sesiUjian: [],
  };

  // ---------------------------------------------------------------- akun
  toko.users.push({ id: randomUUID(), email: REKRUTER.email, password: PASSWORD_DEMO, nama: REKRUTER.nama, role: 'rekruter', dibuat_pada: sekarang() });
  const userIdPelamar = new Map();
  for (const p of PELAMAR) {
    const id = randomUUID();
    userIdPelamar.set(p.akun, id);
    toko.users.push({ id, email: emailPelamar(p.akun), password: PASSWORD_DEMO, nama: p.nama, role: 'kandidat', dibuat_pada: sekarang() });
  }
  const rekruterId = toko.users[0].id;

  // ---------------------------------------------------------------- lowongan + soal
  const lowonganId = new Map(); // kunci → id
  const tesId = new Map(); // "kunci/jenisTes" → id
  const soalIdPerTes = new Map(); // "kunci/jenisTes" → [{id, kunciOpsiId, opsi}]

  for (const l of LOWONGAN) {
    const id = randomUUID();
    lowonganId.set(l.kunci, id);
    toko.lowongan.push({
      id,
      dibuat_oleh: rekruterId,
      posisi: l.body.posisi,
      budget_maksimal: l.body.budgetMaksimal,
      skill_wajib: l.body.skillWajib,
      skill_opsional: l.body.skillOpsional,
      kebutuhan_waktu: l.body.kebutuhanWaktu,
      kata_kunci_sorot: l.body.kataKunciSorot,
      status: l.status,
      dibuat_pada: sekarang(), // dibackdate di bawah, setelah tanggal pelamar diketahui
      diubah_pada: sekarang(),
    });

    l.body.tes.forEach((t, urutan) => {
      const idTes = randomUUID();
      tesId.set(`${l.kunci}/${t.jenisTes}`, idTes);
      toko.lowonganTes.push({ id: idTes, lowongan_id: id, jenis_tes: t.jenisTes, target_skor: t.targetSkor, batas_bawah: t.batasBawah, bobot: t.bobot, urutan });

      const soalBank = l.soal[t.jenisTes];
      const daftar = soalBank.map((s, i) => {
        const idSoal = randomUUID();
        toko.soal.push({ id: idSoal, lowongan_tes_id: idTes, pertanyaan: s.pertanyaan, opsi: s.opsi, kunci_opsi_id: s.kunciOpsiId, poin: 1, urutan: i, aktif: true, dibuat_pada: sekarang() });
        return { id: idSoal, opsi: s.opsi, kunciOpsiId: s.kunciOpsiId };
      });
      soalIdPerTes.set(`${l.kunci}/${t.jenisTes}`, daftar);
    });
  }

  // ---------------------------------------------------------------- pelamar
  for (const [indeks, p] of PELAMAR.entries()) {
    const idLowongan = lowonganId.get(p.lowongan);
    const idKandidat = randomUUID();
    const dikirimPada = geserHari(p.hariLalu, (indeks * 7) % 10);

    const pdf = await berkasCv(p);
    const ekstraksi = await ekstrakTeksPdf(pdf);

    let cvData = {
      kandidat_id: idKandidat,
      kunci_berkas: keDataUrl(pdf),
      status_ekstraksi: 'gagal',
      sumber_ekstraksi: null,
      teks_cv: ekstraksi.ok ? ekstraksi.teks : null,
      skills_mentah: [],
      riwayat_kerja: [],
      rincian_ai: null,
      sorotan: [],
      alasan_tinjau: ekstraksi.ok ? [] : [ekstraksi.alasan],
      total_bulan_kerja: null,
      jumlah_perusahaan: null,
      terverifikasi: false,
      diverifikasi_oleh: null,
      diverifikasi_pada: null,
      dikoreksi_oleh: null,
      dikoreksi_pada: null,
    };

    if (ekstraksi.ok && p.contohHasil) {
      const v = verifikasiHasilAi(ekstraksi.teks, p.contohHasil);
      const riwayat = hitungRiwayatKerja(v.riwayatKerja, yyyymmdd(dikirimPada));
      cvData = {
        ...cvData,
        status_ekstraksi: v.alasanTinjau.length === 0 ? 'berhasil' : 'perlu_tinjau',
        sumber_ekstraksi: 'contoh',
        skills_mentah: [...new Set(v.skills.map((s) => s.nama))],
        riwayat_kerja: v.riwayatKerja.map(({ perusahaan, mulai, selesai }) => ({ perusahaan, mulai, selesai })),
        rincian_ai: { skills: v.skills, riwayatKerja: v.riwayatKerja, temuanLain: v.temuanLain },
        sorotan: v.sorotan,
        alasan_tinjau: v.alasanTinjau,
        total_bulan_kerja: riwayat.totalBulan,
        jumlah_perusahaan: riwayat.jumlahPerusahaan,
      };
    }

    if (p.isiManual) {
      const riwayat = hitungRiwayatKerja(p.isiManual.riwayatKerja, yyyymmdd(dikirimPada));
      cvData = {
        ...cvData,
        status_ekstraksi: 'berhasil',
        sumber_ekstraksi: 'manual',
        skills_mentah: p.isiManual.skills,
        riwayat_kerja: p.isiManual.riwayatKerja,
        alasan_tinjau: [],
        total_bulan_kerja: riwayat.totalBulan,
        jumlah_perusahaan: riwayat.jumlahPerusahaan,
        terverifikasi: true,
        diverifikasi_oleh: rekruterId,
        diverifikasi_pada: dikirimPada,
        dikoreksi_oleh: rekruterId,
        dikoreksi_pada: dikirimPada,
      };
    } else if (p.konfirmasiHr && ['berhasil', 'perlu_tinjau'].includes(cvData.status_ekstraksi)) {
      cvData.terverifikasi = true;
      cvData.diverifikasi_oleh = rekruterId;
      cvData.diverifikasi_pada = dikirimPada;
    }
    toko.cvData.push(cvData);

    // ---- ujian
    const jumlahTesLowongan = LOWONGAN.find((l) => l.kunci === p.lowongan).body.tes.length;
    let selesaiDikerjakan = 0;
    let adaSesi = false;
    const integritasAgregat = { status_kamera: null, jumlah_keluar_fokus: 0, total_detik_keluar_fokus: 0, log_pelanggaran: [] };

    for (const [jenisTes, u] of Object.entries(p.ujian)) {
      adaSesi = true;
      const idTes = tesId.get(`${p.lowongan}/${jenisTes}`);
      const soal = soalIdPerTes.get(`${p.lowongan}/${jenisTes}`);
      const jawaban = soal.map((s, i) => ({ soalId: s.id, opsiDipilih: i < u.benar ? s.kunciOpsiId : s.opsi.find((o) => o.id !== s.kunciOpsiId).id }));
      const nilai = nilaiJawabanPilihanGanda(soal.map((s) => ({ id: s.id, pertanyaan: '-', opsi: s.opsi, kunciOpsiId: s.kunciOpsiId })), jawaban);

      const dikirimUjian = dikirimPada;
      const dimulaiUjian = new Date(new Date(dikirimUjian).getTime() - u.menit * 60_000).toISOString();
      for (const r of nilai.rincian) {
        toko.jawabanKandidat.push({ kandidat_id: idKandidat, soal_id: r.soalId, opsi_dipilih: r.opsiDipilih, benar: r.benar, dijawab_pada: dikirimUjian });
      }
      toko.ujianTeknis.push({ kandidat_id: idKandidat, lowongan_tes_id: idTes, skor_pencapaian: Math.round(nilai.skorPencapaian * 100) / 100, durasi_pengerjaan_detik: u.menit * 60, dimulai_pada: dimulaiUjian, dikirim_pada: dikirimUjian });
      toko.sesiUjian.push({ kandidat_id: idKandidat, lowongan_tes_id: idTes, soal_ids: soal.map((s) => s.id), dimulai_pada: dimulaiUjian, jumlah_dibuka_ulang: u.dibukaUlang ?? 0 });

      selesaiDikerjakan++;
      integritasAgregat.status_kamera = u.kamera;
      integritasAgregat.jumlah_keluar_fokus += u.keluar.length;
      integritasAgregat.total_detik_keluar_fokus += Math.round(u.keluar.reduce((t, d) => t + d, 0));
      integritasAgregat.log_pelanggaran.push({ tesId: idTes, jenis: 'kamera', statusKamera: u.kamera });
      for (const detik of u.keluar) integritasAgregat.log_pelanggaran.push({ tesId: idTes, jenis: 'keluar_fokus', detik: Math.round(detik) });
      if (u.dibukaUlang) integritasAgregat.log_pelanggaran.push({ tesId: idTes, jenis: 'dibuka_ulang', jumlah: u.dibukaUlang });
    }
    if (adaSesi) toko.integritas.push({ kandidat_id: idKandidat, ...integritasAgregat });

    const statusAplikasi = p.keputusan ?? (selesaiDikerjakan === 0 ? 'dilamar' : selesaiDikerjakan >= jumlahTesLowongan ? 'selesai' : 'ujian');

    toko.kandidat.push({
      id: idKandidat,
      user_id: userIdPelamar.get(p.akun),
      lowongan_id: idLowongan,
      nama: p.nama,
      email: emailPelamar(p.akun),
      nomor_kontak: `0800-1111-${String(indeks + 1).padStart(4, '0')}`,
      ekspektasi_gaji: p.gaji,
      ketersediaan_waktu: p.waktu,
      persetujuan_data: true,
      persetujuan_pada: dikirimPada,
      status_aplikasi: statusAplikasi,
      skor_akhir: null,
      rincian_skor: null,
      skor_dihitung_pada: null,
      dikirim_pada: dikirimPada,
    });
  }

  // ---------------------------------------------------------------- hitung skor semua kandidat
  function hitungSkor(k) {
    const l = toko.lowongan.find((x) => x.id === k.lowongan_id);
    const tes = toko.lowonganTes.filter((t) => t.lowongan_id === l.id);
    const cv = toko.cvData.find((c) => c.kandidat_id === k.id);
    const ujian = toko.ujianTeknis.filter((u) => u.kandidat_id === k.id);
    const hasil = hitungSkorKandidat(
      { budgetMaksimal: l.budget_maksimal, skillWajib: l.skill_wajib, tes: tes.map((t) => ({ id: t.id, jenisTes: t.jenis_tes, targetSkor: t.target_skor, batasBawah: t.batas_bawah, bobot: t.bobot })) },
      {
        tanggalLamaran: yyyymmdd(k.dikirim_pada),
        ekspektasiGaji: k.ekspektasi_gaji,
        ketersediaanWaktu: k.ketersediaan_waktu,
        cv: cv ? { statusEkstraksi: cv.status_ekstraksi, terverifikasi: cv.terverifikasi, skills: cv.skills_mentah, riwayatKerja: cv.riwayat_kerja } : null,
        hasilUjian: ujian.map((u) => ({ lowonganTesId: u.lowongan_tes_id, skorPencapaian: u.skor_pencapaian })),
      },
    );
    k.skor_akhir = hasil.skorAkhir;
    k.rincian_skor = hasil;
    k.skor_dihitung_pada = sekarang();
  }
  for (const k of toko.kandidat) hitungSkor(k);

  // ---------------------------------------------------------------- keputusan berdasarkan peringkat
  // Sama persis urutannya dengan backend/src/demo/seed.js: keputusan per-pelamar yang
  // sudah ditulis tangan (p.keputusan, lihat di atas) duluan, baru peringkat per lowongan
  // mengisi sisanya yang belum diputuskan.
  for (const l of LOWONGAN) {
    if (!l.keputusan) continue;
    const { diterima = 0, ditolakTerbawah = 0, ditolakSisanya = false } = l.keputusan;
    const AMBANG_TOLAK = 60;
    const idLowongan = lowonganId.get(l.kunci);
    const urut = toko.kandidat
      .filter((k) => k.lowongan_id === idLowongan && !['diterima', 'ditolak'].includes(k.status_aplikasi))
      .filter((k) => toko.cvData.find((c) => c.kandidat_id === k.id)?.terverifikasi && k.skor_akhir !== null)
      .sort((a, b) => b.skor_akhir - a.skor_akhir);
    urut.forEach((k, i) => {
      if (i < diterima) k.status_aplikasi = 'diterima';
      else if (ditolakSisanya) k.status_aplikasi = 'ditolak';
      else if (i >= Math.max(diterima, urut.length - ditolakTerbawah) && k.skor_akhir < AMBANG_TOLAK) k.status_aplikasi = 'ditolak';
    });
  }

  // ---------------------------------------------------------------- tanggal lowongan dibackdate
  for (const l of LOWONGAN) {
    const idLowongan = lowonganId.get(l.kunci);
    const hariPelamar = toko.kandidat.filter((k) => k.lowongan_id === idLowongan).map((k) => Math.round((Date.now() - new Date(k.dikirim_pada).getTime()) / 86_400_000));
    const dibuat = (hariPelamar.length ? Math.max(...hariPelamar) : 0) + 3;
    const diubah = l.status === 'tutup' ? Math.max((hariPelamar.length ? Math.min(...hariPelamar) : 0) - 4, 0) : hariPelamar.length ? Math.min(...hariPelamar) : 1;
    const baris = toko.lowongan.find((x) => x.id === idLowongan);
    baris.dibuat_pada = geserHari(dibuat);
    baris.diubah_pada = geserHari(Math.min(diubah, dibuat));
  }

  // ---------------------------------------------------------------- tulis berkas
  const tujuan = new URL('../../frontend/src/simulasi/data/seed.json', import.meta.url);
  await mkdir(new URL('.', tujuan), { recursive: true });
  const isi = JSON.stringify({ versi: VERSI_SEED, toko }, null, 0);
  await writeFile(tujuan, isi);
  console.log(`seed.json ditulis: ${toko.lowongan.length} lowongan, ${toko.kandidat.length} kandidat, ${(isi.length / 1024).toFixed(0)} KB`);
  console.log(`Rekruter demo: ${REKRUTER.email} / ${PASSWORD_DEMO}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
