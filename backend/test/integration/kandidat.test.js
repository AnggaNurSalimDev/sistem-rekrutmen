import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { siapkan, request, contohLowongan, PDF_SCAN, ALASAN_LEWATI } from './helper.js';

const aiJujur = async () => ({
  skills: [
    { nama: 'React', kutipan: 'React.js' },
    { nama: 'JavaScript', kutipan: 'JavaScript' },
  ],
  riwayatKerja: [
    { perusahaan: 'PT Solusi Digital Nusantara', jabatan: null, mulai: '2022-01', selesai: null, masihBekerja: true, hanyaTahun: false, kutipan: 'Januari 2022 - Sekarang PT Solusi Digital Nusantara' },
  ],
  temuanLain: [],
});

describe('Tahap 5: data kandidat untuk rekruter', { skip: ALASAN_LEWATI }, () => {
  let api;
  let rekruter;
  let rekruterLain;
  let lowongan;

  before(async () => {
    api = await siapkan({}, { parserAi: aiJujur });
    rekruter = await api.daftar('rekruter');
    rekruterLain = await api.daftar('rekruter');
    lowongan = await api.lowonganTerbuka(rekruter);
  });
  after(() => api?.tutup());

  const kirim = (metode, url, akun, body) => request(api.app)[metode](url).set(akun.auth).send(body);

  async function pelamar(opsi) {
    const akun = await api.daftar('kandidat');
    const res = await api.lamar(akun, lowongan.id, opsi);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return { akun, id: res.body.data.id };
  }

  async function kerjakanSemuaTes(akun, lamaranId) {
    for (const t of lowongan.tes) {
      const m = await request(api.app).post(`/lamaran/${lamaranId}/ujian/${t.id}/mulai`).set(akun.auth).send({});
      await request(api.app)
        .post(`/lamaran/${lamaranId}/ujian/${t.id}/kirim`)
        .set(akun.auth)
        .send({
          jawaban: m.body.data.soal.map((s) => ({ soalId: s.id, opsiDipilih: 'a' })),
          integritas: { statusKamera: 'denied', episodeKeluarFokus: [{ detik: 0.5 }] },
        });
    }
  }

  test('daftar kandidat per lowongan: skor sementara, status CV, integritas setelah tes', async () => {
    const p = await pelamar();
    let res = await kirim('get', `/lowongan/${lowongan.id}/kandidat`, rekruter);
    assert.equal(res.status, 200);
    let baris = res.body.data.find((k) => k.id === p.id);
    assert.equal(baris.skorAkhir, null);
    assert.equal(baris.skor.status, 'belum_lengkap');
    assert.equal(baris.skor.sementara, true);
    assert.deepEqual(baris.cv, { statusEkstraksi: 'berhasil', terverifikasi: false, sumber: 'ai' });
    assert.equal(baris.integritas, null);

    await kerjakanSemuaTes(p.akun, p.id);
    res = await kirim('get', `/lowongan/${lowongan.id}/kandidat`, rekruter);
    baris = res.body.data.find((k) => k.id === p.id);
    assert.equal(baris.skor.status, 'lengkap');
    assert.ok(baris.skorAkhir > 0);
    assert.equal(baris.statusAplikasi, 'selesai');
    assert.deepEqual(baris.integritas, { statusKamera: 'denied', jumlahKeluarFokus: 2, totalDetikKeluarFokus: baris.integritas.totalDetikKeluarFokus, dibukaUlang: 0 });
    assert.equal(baris.ujian.length, 2);
  });

  test('detail kandidat: teks CV, sorotan, kata kunci lowongan, PDF bisa dibuka, jawaban tes', async () => {
    const p = await pelamar();
    await kerjakanSemuaTes(p.akun, p.id);
    const res = await kirim('get', `/kandidat/${p.id}`, rekruter);
    assert.equal(res.status, 200);
    const d = res.body.data;
    assert.ok(d.cv.teks.includes('PT Solusi Digital Nusantara'));
    assert.ok(d.cv.sorotan.some((s) => s.kategori === 'perusahaan'));
    assert.deepEqual(d.lowongan.kataKunciSorot, []);
    assert.equal(d.tes.length, 2);
    assert.equal(d.tes[0].jawaban[0].kunciOpsiId, 'a');
    assert.equal(d.tes[0].hasil.skor, 100);
    assert.ok(Array.isArray(d.integritasLengkap.log));

    const url = new URL(d.cv.urlPdf);
    const pdf = await request(api.app).get(url.pathname + url.search);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers['content-type'], 'application/pdf');
  });

  test('kandidat lowongan rekruter lain → 404; pelamar → 403', async () => {
    const p = await pelamar();
    assert.equal((await kirim('get', `/kandidat/${p.id}`, rekruterLain)).status, 404);
    assert.equal((await kirim('get', `/lowongan/${lowongan.id}/kandidat`, rekruterLain)).status, 404);
    assert.equal((await kirim('post', `/kandidat/${p.id}/cv/konfirmasi`, rekruterLain)).status, 404);
    assert.equal((await kirim('get', `/kandidat/${p.id}`, p.akun)).status, 403);
  });

  test('konfirmasi CV: label sementara hilang; idempoten', async () => {
    const p = await pelamar();
    const r1 = await kirim('post', `/kandidat/${p.id}/cv/konfirmasi`, rekruter);
    assert.equal(r1.status, 200);
    assert.equal(r1.body.data.sementara, false);
    const r2 = await kirim('post', `/kandidat/${p.id}/cv/konfirmasi`, rekruter);
    assert.equal(r2.status, 200);
    const { rows } = await api.pool.query('SELECT terverifikasi, sumber_ekstraksi, diverifikasi_oleh FROM cv_data WHERE kandidat_id = $1', [p.id]);
    assert.deepEqual(rows[0], { terverifikasi: true, sumber_ekstraksi: 'ai', diverifikasi_oleh: rekruter.user.id });
  });

  test('CV gagal dibaca: konfirmasi → 409; koreksi manual → data terisi, terverifikasi, skor CV terhitung', async () => {
    const p = await pelamar({ pdf: PDF_SCAN });
    assert.equal((await kirim('post', `/kandidat/${p.id}/cv/konfirmasi`, rekruter)).status, 409);

    const res = await kirim('put', `/kandidat/${p.id}/cv`, rekruter, {
      skills: ['React', 'react', 'JavaScript'],
      riwayatKerja: [
        { perusahaan: 'Toko Maju', mulai: '2021-01', selesai: '2022-12' },
        { perusahaan: 'Warung Sari', mulai: null, selesai: null },
      ],
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.sementara, false);
    assert.equal(res.body.data.komponen.cv, 100);
    assert.equal(res.body.data.komponen.tenure, 100);
    assert.ok(res.body.data.flags.includes('lama_kerja_tidak_disebut'));

    const { rows } = await api.pool.query('SELECT * FROM cv_data WHERE kandidat_id = $1', [p.id]);
    assert.equal(rows[0].status_ekstraksi, 'berhasil');
    assert.equal(rows[0].sumber_ekstraksi, 'manual');
    assert.deepEqual(rows[0].skills_mentah, ['React', 'JavaScript']);
    assert.equal(rows[0].total_bulan_kerja, 24);
    assert.ok(rows[0].dikoreksi_pada);
  });

  test('koreksi tidak valid → 400 dengan pesan jelas', async () => {
    const p = await pelamar();
    const kasus = [
      [{ perusahaan: 'A', mulai: '2023-05', selesai: '2023-01' }, /sebelum tanggal mulai/],
      [{ perusahaan: 'A', mulai: null, selesai: '2023-01' }, /isi tanggal mulai/],
      [{ perusahaan: 'A', mulai: '2099-01', selesai: null }, /setelah tanggal lamaran/],
      [{ perusahaan: 'A', mulai: 'Januari 2023', selesai: null }, /YYYY-MM/],
    ];
    for (const [entri, pesan] of kasus) {
      const res = await kirim('put', `/kandidat/${p.id}/cv`, rekruter, { skills: [], riwayatKerja: [entri] });
      assert.equal(res.status, 400, JSON.stringify(entri));
      assert.match(JSON.stringify(res.body), pesan);
    }
  });

  test('keputusan diterima/ditolak terlihat oleh pelamar; dibatalkan → kembali ke status progres', async () => {
    const p = await pelamar();
    await kirim('post', `/kandidat/${p.id}/cv/konfirmasi`, rekruter);
    const r = await kirim('patch', `/kandidat/${p.id}/status`, rekruter, { keputusan: 'ditolak' });
    assert.equal(r.body.data.statusAplikasi, 'ditolak');
    const dilihat = await request(api.app).get(`/lamaran/${p.id}`).set(p.akun.auth);
    assert.equal(dilihat.body.data.statusAplikasi, 'ditolak');

    // Pelamar tetap mengerjakan tes: keputusan rekruter tidak tertimpa.
    await kerjakanSemuaTes(p.akun, p.id);
    const { rows } = await api.pool.query('SELECT status_aplikasi FROM kandidat WHERE id = $1', [p.id]);
    assert.equal(rows[0].status_aplikasi, 'ditolak');

    const batal = await kirim('patch', `/kandidat/${p.id}/status`, rekruter, { keputusan: null });
    assert.equal(batal.body.data.statusAplikasi, 'selesai');
    assert.equal((await kirim('patch', `/kandidat/${p.id}/status`, rekruter, { keputusan: 'lulus' })).status, 400);
  });

  test('terima/tolak ditolak selama CV belum dicek HR; membatalkan tetap boleh', async () => {
    const p = await pelamar();
    for (const keputusan of ['diterima', 'ditolak']) {
      const res = await kirim('patch', `/kandidat/${p.id}/status`, rekruter, { keputusan });
      assert.equal(res.status, 409, keputusan);
      assert.match(res.body.error.pesan, /belum dicek HR/);
    }
    const { rows } = await api.pool.query('SELECT status_aplikasi FROM kandidat WHERE id = $1', [p.id]);
    assert.equal(rows[0].status_aplikasi, 'dilamar');
    assert.equal((await kirim('patch', `/kandidat/${p.id}/status`, rekruter, { keputusan: null })).status, 200);

    // CV scan (tidak terbaca): baru bisa diputuskan setelah HR mengisi datanya manual.
    const scan = await pelamar({ pdf: PDF_SCAN });
    assert.equal((await kirim('patch', `/kandidat/${scan.id}/status`, rekruter, { keputusan: 'ditolak' })).status, 409);
    await kirim('put', `/kandidat/${scan.id}/cv`, rekruter, { skills: ['React'], riwayatKerja: [] });
    assert.equal((await kirim('patch', `/kandidat/${scan.id}/status`, rekruter, { keputusan: 'ditolak' })).status, 200);
  });

  test('mengubah budget lowongan menghitung ulang skor semua pelamar', async () => {
    const p = await pelamar(); // ekspektasi 7.000.000, budget 8.000.000
    const sebelum = await kirim('get', `/kandidat/${p.id}`, rekruter);
    assert.equal(sebelum.body.data.rincianSkor.komponen.anggaran, 100);

    const { tes, ...umum } = contohLowongan();
    assert.ok(tes);
    const ubah = await kirim('put', `/lowongan/${lowongan.id}`, rekruter, { ...umum, budgetMaksimal: 6_000_000 });
    assert.equal(ubah.status, 200);
    const sesudah = await kirim('get', `/kandidat/${p.id}`, rekruter);
    assert.equal(sesudah.body.data.rincianSkor.komponen.anggaran, 0);

    await kirim('put', `/lowongan/${lowongan.id}`, rekruter, umum);
  });
});
