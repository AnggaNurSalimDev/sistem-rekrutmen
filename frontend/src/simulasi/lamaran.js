/* Padanan backend/src/routes/lamaran.js. CV sungguhan tidak dibaca (lihat cvContoh.js). */
import { hitungRiwayatKerja } from './mesin/scoring/riwayatKerja.js';
import { nilaiJawabanPilihanGanda, soalUntukKandidat } from './mesin/scoring/soal.js';
import { verifikasiHasilAi } from './mesin/verifikasiCv.js';
import { pilihProfil } from './cvContoh.js';
import { GalatSimulasi, idParam, konflik, tidakDitemukan, validasiGagal } from './galat.js';
import { hitungUlangSkor } from './skor.js';
import { cari, cariSemua, idBaru, sekarang, tabel, tandaiBerubah, tanggalHariIni } from './toko.js';

const UKURAN_CV_MAKS = 10 * 1024 * 1024;

function bacaSebagaiDataUrl(berkas) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Berkas gagal dibaca'));
    r.readAsDataURL(berkas);
  });
}

function tampilanLamaran(k) {
  const l = cari('lowongan', (x) => x.id === k.lowongan_id);
  const tes = cariSemua('lowonganTes', (t) => t.lowongan_id === l.id)
    .sort((a, b) => a.urutan - b.urutan)
    .map((t) => {
      const selesai = cari('ujianTeknis', (u) => u.kandidat_id === k.id && u.lowongan_tes_id === t.id);
      const sesi = cari('sesiUjian', (s) => s.kandidat_id === k.id && s.lowongan_tes_id === t.id);
      return { id: t.id, jenisTes: t.jenis_tes, status: selesai ? 'selesai' : sesi ? 'berlangsung' : 'belum' };
    });
  return {
    id: k.id,
    lowongan: { id: l.id, posisi: l.posisi, status: l.status },
    statusAplikasi: k.status_aplikasi,
    dikirimPada: k.dikirim_pada,
    tes,
  };
}

function ambilLamaranMilik(id, userId) {
  idParam(id, 'Lamaran');
  const k = cari('kandidat', (x) => x.id === id && x.user_id === userId);
  if (!k) throw tidakDitemukan('Lamaran');
  return k;
}

function ambilTesLamaran(k, tesId) {
  idParam(tesId, 'Tes');
  const t = cari('lowonganTes', (x) => x.id === tesId && x.lowongan_id === k.lowongan_id);
  if (!t) throw tidakDitemukan('Tes');
  return t;
}

function soalSesi(soalIds) {
  return soalIds
    .map((id) => cari('soal', (s) => s.id === id))
    .filter(Boolean)
    .map((s) => ({ id: s.id, pertanyaan: s.pertanyaan, opsi: s.opsi, kunciOpsiId: s.kunci_opsi_id, poin: s.poin, urutan: s.urutan, aktif: true }));
}

export const rute = {
  async buat(user, form) {
    if (!(form instanceof FormData)) throw validasiGagal('Form lamaran tidak valid');
    const lowonganId = form.get('lowonganId');
    const nama = (form.get('nama') ?? '').toString().trim();
    const nomorKontak = (form.get('nomorKontak') ?? '').toString().trim();
    const ekspektasiGaji = Number(form.get('ekspektasiGaji'));
    const ketersediaanWaktu = form.get('ketersediaanWaktu');
    const persetujuanData = form.get('persetujuanData');
    const berkas = form.get('cv');

    if (!nama) throw validasiGagal('Data tidak valid', { detail: [{ field: 'nama', pesan: 'wajib diisi' }] });
    if (!/^[0-9+\-\s()]{8,20}$/.test(nomorKontak)) {
      throw validasiGagal('Data tidak valid', { detail: [{ field: 'nomorKontak', pesan: 'format nomor tidak valid' }] });
    }
    if (!Number.isInteger(ekspektasiGaji) || ekspektasiGaji < 0) {
      throw validasiGagal('Data tidak valid', { detail: [{ field: 'ekspektasiGaji', pesan: 'harus angka ≥ 0' }] });
    }
    if (!['penuh', 'sebagian', 'tidak'].includes(ketersediaanWaktu)) {
      throw validasiGagal('Data tidak valid', { detail: [{ field: 'ketersediaanWaktu', pesan: 'tidak valid' }] });
    }
    if (persetujuanData !== 'true') {
      throw validasiGagal('Data tidak valid', { detail: [{ field: 'persetujuanData', pesan: 'wajib dicentang' }] });
    }
    if (!berkas || typeof berkas === 'string' || berkas.size === 0) throw validasiGagal('CV wajib diunggah dalam format PDF', { field: 'cv' });
    if (berkas.size > UKURAN_CV_MAKS) throw new GalatSimulasi(413, 'TERLALU_BESAR', 'CV maksimal 10 MB');

    const l = cari('lowongan', (x) => x.id === lowonganId);
    if (!l || l.status === 'draf') throw tidakDitemukan('Lowongan');
    if (l.status !== 'buka') throw konflik('Lowongan ini sudah ditutup');
    if (cari('kandidat', (k) => k.user_id === user.id && k.lowongan_id === l.id)) throw konflik('Anda sudah melamar lowongan ini');

    // CV sungguhan disimpan sebagai data URL supaya "Buka PDF asli" tetap berfungsi,
    // tapi ISINYA tidak dibaca — lihat cvContoh.js untuk kenapa.
    const kunciBerkas = await bacaSebagaiDataUrl(berkas).catch(() => null);
    const profil = pilihProfil(nama + nomorKontak);
    // Kutipan = nama skill itu sendiri: di cvContoh.js setiap skill memang muncul
    // verbatim di teks CV contohnya, jadi verifikasiHasilAi akan menemukannya.
    const hasilAi = { skills: profil.skills.map((s) => ({ nama: s, kutipan: s })), riwayatKerja: profil.riwayat, temuanLain: profil.temuan };
    const v = verifikasiHasilAi(profil.teks, hasilAi);
    const riwayat = hitungRiwayatKerja(v.riwayatKerja, tanggalHariIni());

    const k = {
      id: idBaru(),
      user_id: user.id,
      lowongan_id: l.id,
      nama,
      email: user.email,
      nomor_kontak: nomorKontak,
      ekspektasi_gaji: ekspektasiGaji,
      ketersediaan_waktu: ketersediaanWaktu,
      persetujuan_data: true,
      persetujuan_pada: sekarang(),
      status_aplikasi: 'dilamar',
      skor_akhir: null,
      rincian_skor: null,
      skor_dihitung_pada: null,
      dikirim_pada: sekarang(),
    };
    tabel('kandidat').push(k);
    tabel('cvData').push({
      kandidat_id: k.id,
      kunci_berkas: kunciBerkas,
      status_ekstraksi: v.alasanTinjau.length === 0 ? 'berhasil' : 'perlu_tinjau',
      sumber_ekstraksi: 'contoh',
      teks_cv: profil.teks,
      skills_mentah: [...new Set(v.skills.map((s) => s.nama))],
      riwayat_kerja: v.riwayatKerja.map(({ perusahaan, mulai, selesai }) => ({ perusahaan, mulai, selesai })),
      rincian_ai: { skills: v.skills, riwayatKerja: v.riwayatKerja, temuanLain: v.temuanLain },
      sorotan: v.sorotan,
      alasan_tinjau: v.alasanTinjau,
      total_bulan_kerja: riwayat.totalBulan,
      jumlah_perusahaan: riwayat.jumlahPerusahaan,
      terverifikasi: false,
      diverifikasi_oleh: null,
      diverifikasi_pada: null,
    });
    tandaiBerubah();
    hitungUlangSkor(k.id);
    return { status: 201, data: { data: tampilanLamaran(k) } };
  },

  daftar(user) {
    const data = cariSemua('kandidat', (k) => k.user_id === user.id)
      .sort((a, b) => new Date(b.dikirim_pada) - new Date(a.dikirim_pada))
      .map(tampilanLamaran);
    return { status: 200, data: { data } };
  },

  detail(user, id) {
    return { status: 200, data: { data: tampilanLamaran(ambilLamaranMilik(id, user.id)) } };
  },

  mulai(user, id, tesId) {
    const k = ambilLamaranMilik(id, user.id);
    const t = ambilTesLamaran(k, tesId);
    if (cari('ujianTeknis', (u) => u.kandidat_id === k.id && u.lowongan_tes_id === t.id)) throw konflik('Ujian ini sudah dikirim');

    let sesi = cari('sesiUjian', (s) => s.kandidat_id === k.id && s.lowongan_tes_id === t.id);
    if (sesi) {
      sesi.jumlah_dibuka_ulang += 1;
      tandaiBerubah();
    } else {
      const l = cari('lowongan', (x) => x.id === k.lowongan_id);
      if (l.status !== 'buka') throw konflik('Lowongan sudah ditutup; ujian tidak bisa dimulai');
      const soalAktif = cariSemua('soal', (s) => s.lowongan_tes_id === t.id && s.aktif).sort((a, b) => a.urutan - b.urutan);
      if (soalAktif.length === 0) throw konflik('Tes ini belum punya soal');
      sesi = { kandidat_id: k.id, lowongan_tes_id: t.id, soal_ids: soalAktif.map((s) => s.id), dimulai_pada: sekarang(), jumlah_dibuka_ulang: 0 };
      tabel('sesiUjian').push(sesi);
      if (k.status_aplikasi === 'dilamar') k.status_aplikasi = 'ujian';
      tandaiBerubah();
    }
    return {
      status: 200,
      data: { data: { tesId: t.id, jenisTes: t.jenis_tes, dimulaiPada: sesi.dimulai_pada, soal: soalUntukKandidat(soalSesi(sesi.soal_ids)) } },
    };
  },

  kirim(user, id, tesId, body) {
    const k = ambilLamaranMilik(id, user.id);
    const t = ambilTesLamaran(k, tesId);
    const sesi = cari('sesiUjian', (s) => s.kandidat_id === k.id && s.lowongan_tes_id === t.id);
    if (!sesi) throw konflik('Ujian belum dimulai');
    if (cari('ujianTeknis', (u) => u.kandidat_id === k.id && u.lowongan_tes_id === t.id)) throw konflik('Ujian ini sudah dikirim');

    const durasi = Math.max(0, Math.floor((Date.now() - new Date(sesi.dimulai_pada).getTime()) / 1000));
    const daftarSoal = soalSesi(sesi.soal_ids);
    const idSesi = new Set(sesi.soal_ids);
    const idAda = new Set(daftarSoal.map((s) => s.id));
    const jawabanDiterima = Array.isArray(body?.jawaban) ? body.jawaban : [];
    const jawaban = jawabanDiterima.filter((j) => !idSesi.has(j?.soalId) || idAda.has(j.soalId));

    let nilai;
    try {
      nilai = nilaiJawabanPilihanGanda(daftarSoal, jawaban);
    } catch (err) {
      throw validasiGagal(err.message, { field: 'jawaban' });
    }
    for (const r of nilai.rincian) {
      tabel('jawabanKandidat').push({ kandidat_id: k.id, soal_id: r.soalId, opsi_dipilih: r.opsiDipilih, benar: r.benar, dijawab_pada: sekarang() });
    }
    const dikirimPada = sekarang();
    tabel('ujianTeknis').push({ kandidat_id: k.id, lowongan_tes_id: t.id, skor_pencapaian: Math.round(nilai.skorPencapaian * 100) / 100, durasi_pengerjaan_detik: durasi, dimulai_pada: sesi.dimulai_pada, dikirim_pada: dikirimPada });

    const statusKamera = body?.integritas?.statusKamera ?? 'not_supported';
    const episode = Array.isArray(body?.integritas?.episodeKeluarFokus) ? body.integritas.episodeKeluarFokus : [];
    const dilaporkan = Math.round(episode.reduce((tot, e) => tot + (e?.detik ?? 0), 0));
    const totalDetik = Math.min(dilaporkan, durasi);
    const log = [
      { tesId: t.id, jenis: 'kamera', statusKamera },
      ...episode.map((e) => ({ tesId: t.id, jenis: 'keluar_fokus', detik: Math.round(e?.detik ?? 0) })),
      ...(dilaporkan > durasi ? [{ tesId: t.id, jenis: 'dipotong', dilaporkan, durasi }] : []),
      ...(sesi.jumlah_dibuka_ulang > 0 ? [{ tesId: t.id, jenis: 'dibuka_ulang', jumlah: sesi.jumlah_dibuka_ulang }] : []),
    ];
    const existing = cari('integritas', (i) => i.kandidat_id === k.id);
    if (existing) {
      existing.status_kamera = statusKamera;
      existing.jumlah_keluar_fokus += episode.length;
      existing.total_detik_keluar_fokus += totalDetik;
      existing.log_pelanggaran.push(...log);
    } else {
      tabel('integritas').push({ kandidat_id: k.id, status_kamera: statusKamera, jumlah_keluar_fokus: episode.length, total_detik_keluar_fokus: totalDetik, log_pelanggaran: log });
    }

    const jumlahTes = cariSemua('lowonganTes', (x) => x.lowongan_id === k.lowongan_id).length;
    const terkirim = cariSemua('ujianTeknis', (u) => u.kandidat_id === k.id).length;
    if (terkirim >= jumlahTes && ['dilamar', 'ujian'].includes(k.status_aplikasi)) k.status_aplikasi = 'selesai';
    tandaiBerubah();
    hitungUlangSkor(k.id);
    return { status: 200, data: { data: { terkirim: true, dikirimPada } } };
  },
};
