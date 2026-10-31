/* Padanan backend/src/routes/kandidat.js. */
import { hitungRiwayatKerja } from './mesin/scoring/riwayatKerja.js';
import { idParam, konflik, tidakDitemukan, validasiGagal } from './galat.js';
import { hitungUlangSkor } from './skor.js';
import { cari, cariSemua, sekarang, tandaiBerubah, tanggalHariIni } from './toko.js';
import { ambilLowonganMilik } from './lowongan.js';

const POLA_BULAN = /^\d{4}-(0[1-9]|1[0-2])$/;

const ringkasSkor = (r) =>
  r ? { status: r.status, sementara: Boolean(r.sementara), komponen: r.komponen ?? null, flags: r.flags ?? [], galat: r.galat } : null;

function tampilkanBaris(k) {
  const cv = cari('cvData', (c) => c.kandidat_id === k.id);
  const i = cari('integritas', (x) => x.kandidat_id === k.id);
  const ujian = cariSemua('ujianTeknis', (u) => u.kandidat_id === k.id).map((u) => ({ tesId: u.lowongan_tes_id, skor: u.skor_pencapaian, durasiDetik: u.durasi_pengerjaan_detik }));
  const dibukaUlang = cariSemua('sesiUjian', (s) => s.kandidat_id === k.id).reduce((t, s) => t + s.jumlah_dibuka_ulang, 0);
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
    cv: { statusEkstraksi: cv?.status_ekstraksi ?? null, terverifikasi: cv?.terverifikasi === true, sumber: cv?.sumber_ekstraksi ?? null },
    integritas: i ? { statusKamera: i.status_kamera, jumlahKeluarFokus: i.jumlah_keluar_fokus, totalDetikKeluarFokus: i.total_detik_keluar_fokus, dibukaUlang } : null,
    ujian,
  };
}

function ambilKandidatMilik(id, userId) {
  idParam(id, 'Kandidat');
  const k = cari('kandidat', (x) => x.id === id);
  if (!k) throw tidakDitemukan('Kandidat');
  const l = cari('lowongan', (x) => x.id === k.lowongan_id && x.dibuat_oleh === userId);
  if (!l) throw tidakDitemukan('Kandidat');
  return { k, l };
}

function statusProgres(k) {
  const jumlahTes = cariSemua('lowonganTes', (t) => t.lowongan_id === k.lowongan_id).length;
  const terkirim = cariSemua('ujianTeknis', (u) => u.kandidat_id === k.id).length;
  if (jumlahTes > 0 && terkirim >= jumlahTes) return 'selesai';
  return cariSemua('sesiUjian', (s) => s.kandidat_id === k.id).length > 0 ? 'ujian' : 'dilamar';
}

export const rutePerLowongan = {
  daftar(user, lowonganId) {
    const l = ambilLowonganMilik(lowonganId, user.id);
    const data = cariSemua('kandidat', (k) => k.lowongan_id === l.id)
      .sort((a, b) => new Date(b.dikirim_pada) - new Date(a.dikirim_pada))
      .map(tampilkanBaris);
    return { status: 200, data: { data } };
  },
};

export const rute = {
  detail(user, id) {
    const { k, l } = ambilKandidatMilik(id, user.id);
    const cv = cari('cvData', (c) => c.kandidat_id === k.id);
    const i = cari('integritas', (x) => x.kandidat_id === k.id);
    const tes = cariSemua('lowonganTes', (t) => t.lowongan_id === l.id)
      .sort((a, b) => a.urutan - b.urutan)
      .map((t) => {
        const u = cari('ujianTeknis', (x) => x.kandidat_id === k.id && x.lowongan_tes_id === t.id);
        const jawaban = cariSemua('jawabanKandidat', (j) => j.kandidat_id === k.id)
          .map((j) => ({ j, s: cari('soal', (s) => s.id === j.soal_id) }))
          .filter(({ s }) => s && s.lowongan_tes_id === t.id)
          .sort((a, b) => a.s.urutan - b.s.urutan)
          .map(({ j, s }) => ({ soalId: j.soal_id, pertanyaan: s.pertanyaan, opsi: s.opsi, kunciOpsiId: s.kunci_opsi_id, opsiDipilih: j.opsi_dipilih, benar: j.benar }));
        return {
          id: t.id,
          jenisTes: t.jenis_tes,
          targetSkor: t.target_skor,
          batasBawah: t.batas_bawah,
          bobot: t.bobot,
          hasil: u ? { skor: u.skor_pencapaian, durasiDetik: u.durasi_pengerjaan_detik, dikirimPada: u.dikirim_pada } : null,
          jawaban,
        };
      });
    return {
      status: 200,
      data: {
        data: {
          ...tampilkanBaris(k),
          lowongan: { id: l.id, posisi: l.posisi, kataKunciSorot: l.kata_kunci_sorot, skillWajib: l.skill_wajib, skillOpsional: l.skill_opsional, budgetMaksimal: l.budget_maksimal, kebutuhanWaktu: l.kebutuhan_waktu },
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
                urlPdf: cv.kunci_berkas,
              }
            : null,
          tes,
          integritasLengkap: i ? { statusKamera: i.status_kamera, jumlahKeluarFokus: i.jumlah_keluar_fokus, totalDetikKeluarFokus: i.total_detik_keluar_fokus, log: i.log_pelanggaran } : null,
        },
      },
    };
  },

  konfirmasi(user, id) {
    const { k } = ambilKandidatMilik(id, user.id);
    const cv = cari('cvData', (c) => c.kandidat_id === k.id);
    if (!cv) throw konflik('Kandidat ini tidak punya data CV');
    if (!['berhasil', 'perlu_tinjau'].includes(cv.status_ekstraksi)) {
      throw konflik('CV belum punya data yang bisa dikonfirmasi. Isi data CV lewat koreksi.');
    }
    if (!cv.terverifikasi) {
      cv.terverifikasi = true;
      cv.diverifikasi_oleh = user.id;
      cv.diverifikasi_pada = sekarang();
      tandaiBerubah();
    }
    return { status: 200, data: { data: ringkasSkor(hitungUlangSkor(k.id)) } };
  },

  koreksiCv(user, id, body) {
    const { k } = ambilKandidatMilik(id, user.id);
    const skills = Array.isArray(body?.skills) ? body.skills.map((s) => `${s}`.trim()).filter(Boolean) : [];
    const unik = new Map();
    for (const s of skills) if (!unik.has(s.toLowerCase())) unik.set(s.toLowerCase(), s);

    const riwayatMentah = Array.isArray(body?.riwayatKerja) ? body.riwayatKerja : [];
    for (const [i, r] of riwayatMentah.entries()) {
      if (!r?.perusahaan?.trim()) throw validasiGagal(`Riwayat kerja ke-${i + 1}: nama perusahaan wajib diisi`, { field: `riwayatKerja.${i}` });
      if ((r.mulai !== null && !POLA_BULAN.test(r.mulai)) || (r.selesai !== null && !POLA_BULAN.test(r.selesai))) {
        throw validasiGagal(`Riwayat kerja ke-${i + 1}: tanggal harus format YYYY-MM`, { field: `riwayatKerja.${i}` });
      }
      if (r.mulai === null && r.selesai !== null) {
        throw validasiGagal(`Riwayat kerja ke-${i + 1}: isi tanggal mulai, atau kosongkan keduanya`, { field: `riwayatKerja.${i}.mulai` });
      }
    }

    const riwayat = hitungRiwayatKerja(riwayatMentah, tanggalHariIni());
    if (riwayat.entriDibuang.length > 0) {
      const e = riwayat.entriDibuang[0];
      throw validasiGagal(`Riwayat kerja ke-${e.indeks + 1}: ${e.alasan}`, { field: `riwayatKerja.${e.indeks}` });
    }

    const cv = cari('cvData', (c) => c.kandidat_id === k.id);
    if (!cv) throw konflik('Kandidat ini tidak punya data CV');
    Object.assign(cv, {
      skills_mentah: [...unik.values()],
      riwayat_kerja: riwayatMentah,
      total_bulan_kerja: riwayat.totalBulan,
      jumlah_perusahaan: riwayat.jumlahPerusahaan,
      status_ekstraksi: 'berhasil',
      sumber_ekstraksi: 'manual',
      alasan_tinjau: [],
      terverifikasi: true,
      diverifikasi_oleh: user.id,
      diverifikasi_pada: sekarang(),
      dikoreksi_oleh: user.id,
      dikoreksi_pada: sekarang(),
    });
    tandaiBerubah();
    return { status: 200, data: { data: ringkasSkor(hitungUlangSkor(k.id)) } };
  },

  ubahStatus(user, id, body) {
    const { k } = ambilKandidatMilik(id, user.id);
    const keputusan = body?.keputusan ?? null;
    if (keputusan !== null && !['diterima', 'ditolak'].includes(keputusan)) {
      throw validasiGagal('Data tidak valid', { detail: [{ field: 'keputusan', pesan: 'harus diterima, ditolak, atau null' }] });
    }
    if (keputusan !== null) {
      const cv = cari('cvData', (c) => c.kandidat_id === k.id);
      if (cv?.terverifikasi !== true) {
        throw konflik('CV kandidat ini belum dicek HR, jadi skornya masih sementara. Konfirmasi, koreksi, atau isi data CV dulu sebelum menerima atau menolak.');
      }
    }
    k.status_aplikasi = keputusan ?? statusProgres(k);
    tandaiBerubah();
    return { status: 200, data: { data: { statusAplikasi: k.status_aplikasi } } };
  },
};
