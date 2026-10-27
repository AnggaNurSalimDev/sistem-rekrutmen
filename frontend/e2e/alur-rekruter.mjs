/**
 * Uji ujung ke ujung alur rekruter dengan browser sungguhan (Playwright).
 *
 * Prasyarat: backend dengan parser AI palsu dan frontend sudah berjalan:
 *   cd backend && PORT=3100 CORS_ORIGIN=http://localhost:4173 PUBLIC_BASE_URL=http://localhost:3100 node scripts/server-ai-palsu.js
 *   cd frontend && VITE_API_URL=http://localhost:3100 npm run build && npx vite preview --port 4173
 *   API_URL=http://localhost:3100 WEB_URL=http://localhost:4173 node e2e/alur-rekruter.mjs
 *
 * Alur: masuk → buat lowongan lewat form → isi bank soal → buka lowongan →
 * (pelamar melamar & tes lewat API) → tabel kandidat, filter, ekspor CSV →
 * detail kandidat: sorotan CV, cari kata kunci, konfirmasi CV, isi CV manual,
 * keputusan. Opsional: SCREENSHOT_DIR=/folder.
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const API = process.env.API_URL ?? 'http://localhost:3000';
const WEB = process.env.WEB_URL ?? 'http://localhost:5173';
const FOTO = process.env.SCREENSHOT_DIR;
const PDF = fileURLToPath(new URL('../../backend/test/fixtures/pdf/cv-dua-kolom.pdf', import.meta.url));
const PDF_SCAN = fileURLToPath(new URL('../../backend/test/fixtures/pdf/cv-scan-tanpa-teks.pdf', import.meta.url));
const unik = Date.now().toString(36);
const POSISI = `Frontend Developer ${unik}`;

async function api(pathname, { method = 'GET', body, form, token } = {}) {
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  if (body) headers['content-type'] = 'application/json';
  const res = await fetch(`${API}${pathname}`, { method, headers, body: form ?? (body ? JSON.stringify(body) : undefined) });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${pathname} → ${res.status} ${JSON.stringify(data)}`);
  return data;
}

async function akun(role, nama) {
  const email = `${role}-${nama.split(' ')[0].toLowerCase()}-${unik}@contoh.id`;
  const r = await api('/auth/register', { method: 'POST', body: { email, password: 'rahasia123', nama, role } });
  return { ...r, email };
}

async function lamar(token, lowonganId, nama, pdf, gaji) {
  const form = new FormData();
  form.set('lowonganId', lowonganId);
  form.set('nama', nama);
  form.set('nomorKontak', '0812-0000-1111');
  form.set('ekspektasiGaji', String(gaji));
  form.set('ketersediaanWaktu', 'penuh');
  form.set('persetujuanData', 'true');
  form.set('cv', new Blob([await readFile(pdf)], { type: 'application/pdf' }), 'cv.pdf');
  return (await api('/lamaran', { method: 'POST', form, token })).data;
}

async function kerjakanTes(token, lamaranId, tesId, benarSemua, episode) {
  const { data } = await api(`/lamaran/${lamaranId}/ujian/${tesId}/mulai`, { method: 'POST', token });
  // Tanpa kunci di sisi kandidat: jawab opsi pertama (soal di uji ini selalu berkunci "a" kecuali yang ditandai).
  const jawaban = data.soal.map((s) => ({ soalId: s.id, opsiDipilih: benarSemua ? 'a' : 'b' }));
  await api(`/lamaran/${lamaranId}/ujian/${tesId}/kirim`, {
    method: 'POST',
    token,
    body: { jawaban, integritas: { statusKamera: 'granted', episodeKeluarFokus: episode } },
  });
}

async function foto(p, nama) {
  if (FOTO) await p.screenshot({ path: path.join(FOTO, `rekruter-${nama}.png`), fullPage: true });
}

async function main() {
  const rekruter = await akun('rekruter', 'HR Demo');
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const p = await context.newPage();
  const galatHalaman = [];
  p.on('pageerror', (e) => galatHalaman.push(e.message));

  // 1. Masuk → dashboard kosong
  await p.goto(`${WEB}/masuk`);
  await p.getByLabel('Email').fill(rekruter.email);
  await p.getByLabel('Password').fill('rahasia123');
  await p.getByRole('button', { name: 'Masuk' }).click();
  await p.getByRole('heading', { name: 'Lowongan Anda' }).waitFor();
  await p.getByText('Belum ada lowongan').waitFor();

  // 2. Buat lowongan; validasi bobot di browser
  await p.getByRole('link', { name: 'Buat lowongan pertama' }).click();
  await p.getByLabel('Nama posisi').fill(POSISI);
  await p.getByLabel('Budget gaji maksimal per bulan').fill('8.000.000');
  await p.getByLabel('Jadwal kerja yang dibutuhkan').fill('Senin–Jumat 09.00–17.00');
  await p.getByLabel('Skill wajib').fill('React, JavaScript, TypeScript');
  await p.getByLabel('Kata kunci yang disorot di CV (opsional)').fill('Tailwind, Universitas Padjadjaran');
  // Satu tes: bobot terkunci 100%
  assert.equal(await p.getByLabel('Bobot %').getAttribute('readonly'), '');
  await p.getByRole('button', { name: 'Tambah tes' }).click();
  await p.getByLabel('Nama tes').nth(1).fill('coding');
  // Tambah tes → bobot dibagi rata otomatis
  assert.equal(await p.getByLabel('Bobot %').nth(0).inputValue(), '50');
  assert.equal(await p.getByLabel('Bobot %').nth(1).inputValue(), '50');
  await p.getByLabel('Bobot %').nth(1).fill('30');
  await p.getByText('Total bobot 80%').waitFor();
  await p.getByRole('button', { name: 'Simpan sebagai draf' }).click();
  await p.getByText('Periksa isian yang ditandai.').waitFor();
  await p.getByText('Jumlah bobot tes harus 100%, sekarang 80%.').waitFor();
  await p.getByLabel('Bobot %').nth(0).fill('60');
  await p.getByLabel('Bobot %').nth(1).fill('40');
  await p.getByText('Total bobot 100%').waitFor();
  await p.getByText('logika × 60% + coding × 40%').waitFor();
  await p.getByText('nilai 60 → (60 − 40) ÷ (80 − 40) × 100 = 50').first().waitFor();
  await foto(p, '01-form-lowongan');
  await p.getByRole('button', { name: 'Simpan sebagai draf' }).click();
  await p.getByText('Lowongan dibuat sebagai draf').waitFor();
  await p.getByText('Setiap tes perlu minimal satu soal aktif').waitFor();

  // 3. Membuka lowongan tanpa soal ditolak server dengan pesan yang jelas
  await p.getByRole('button', { name: 'Buka lowongan' }).click();
  await p.locator('.pesan.galat').waitFor();

  // 4. Bank soal: validasi, tambah, urutkan, pratinjau
  const soal = {
    logika: [
      ['Jika semua A adalah B dan semua B adalah C, maka semua A adalah …', ['C', 'Bukan C', 'Tidak bisa ditentukan']],
      ['Deret 2, 4, 8, 16, … berikutnya?', ['32', '24', '18']],
    ],
    coding: [['Hasil [1,2,3].map(x => x * 2) adalah …', ['[2,4,6]', '[1,2,3,1,2,3]', '6']]],
  };
  for (const [tes, daftar] of Object.entries(soal)) {
    await p.getByRole('listitem').filter({ hasText: new RegExp(`^${tes}`, 'i') }).getByRole('link', { name: 'Kelola soal' }).click();
    await p.getByRole('heading', { name: `Soal tes ${tes}` }).waitFor();
    for (const [pertanyaan, opsi] of daftar) {
      await p.getByRole('button', { name: 'Tambah soal' }).click();
      await p.getByLabel('Pertanyaan').fill(pertanyaan);
      for (let i = 0; i < opsi.length; i++) await p.getByLabel(`Pilihan ${i + 1}`, { exact: true }).fill(opsi[i]);
      if (tes === 'logika' && pertanyaan.startsWith('Jika')) {
        await p.getByRole('button', { name: 'Simpan soal' }).click();
        await p.getByText('Tandai satu jawaban yang benar.').waitFor();
      }
      await p.getByLabel('Pilihan 1 adalah jawaban benar').check();
      await p.getByRole('button', { name: 'Simpan soal' }).click();
      await p.getByText('Soal ditambahkan di urutan terakhir.').waitFor();
    }
    if (tes === 'logika') {
      await p.getByRole('button', { name: 'Turunkan soal 1' }).click();
      await p.locator('.kartu-soal').first().getByText('Deret 2, 4, 8').waitFor();
      await p.getByRole('button', { name: 'Pratinjau seperti pelamar' }).click();
      await p.getByLabel('Pratinjau soal').waitFor();
      assert.equal(await p.getByLabel('Pratinjau soal').getByText('jawaban benar').count(), 0, 'pratinjau membocorkan kunci');
      await foto(p, '02-bank-soal');
    }
    await p.getByRole('link', { name: POSISI }).click();
  }

  // 5. Buka lowongan
  await p.getByRole('button', { name: 'Buka lowongan' }).click();
  await p.getByText('Status lowongan sekarang: dibuka.').waitFor();
  const lowonganId = p.url().split('/lowongan/')[1].split(/[?#]/)[0];

  // 6. Pelamar lewat API: Rina (CV terbaca, semua tes), Budi (CV terbaca, belum tes), Sari (PDF scan, semua tes)
  const { data: lowongan } = await api(`/lowongan/${lowonganId}`, { token: rekruter.token });
  const tes = Object.fromEntries(lowongan.tes.map((t) => [t.jenisTes, t.id]));
  const rina = await akun('kandidat', 'Rina Kartika');
  const budi = await akun('kandidat', 'Budi Santoso');
  const sari = await akun('kandidat', 'Sari Wulandari');
  const lRina = await lamar(rina.token, lowonganId, 'Rina Kartika', PDF, 7_500_000);
  await lamar(budi.token, lowonganId, '=HYPERLINK("http://contoh.invalid")', PDF, 9_000_000);
  const lSari = await lamar(sari.token, lowonganId, 'Sari Wulandari', PDF_SCAN, 6_000_000);
  await kerjakanTes(rina.token, lRina.id, tes.logika, true, [{ detik: 4 }, { detik: 10 }]);
  await kerjakanTes(rina.token, lRina.id, tes.coding, true, []);
  await kerjakanTes(sari.token, lSari.id, tes.logika, false, []);
  await kerjakanTes(sari.token, lSari.id, tes.coding, true, []);

  // 7. Tabel kandidat
  await p.getByRole('button', { name: 'Kandidat' }).click();
  await p.reload();
  await p.getByText('3 CV belum dicek HR.').waitFor();
  const barisRina = p.getByRole('row').filter({ hasText: 'Rina Kartika' });
  await barisRina.locator('.stempel', { hasText: 'Sementara' }).waitFor();
  await barisRina.getByText(/^Keluar 2× \(\d+ dtk\)$/).waitFor();
  await p.getByRole('row').filter({ hasText: 'HYPERLINK' }).getByText('di atas budget').waitFor();
  await p.getByRole('row').filter({ hasText: 'Sari Wulandari' }).getByText('Belum lengkap').waitFor();
  // Skor tertinggi di atas, yang belum punya skor akhir di bawah
  const pertama = await p.locator('.tabel-kandidat tbody tr').first().locator('th').innerText();
  assert.match(pertama, /Rina Kartika/);
  await p.getByRole('figure', { name: /Sebaran skor akhir/ }).waitFor();
  await foto(p, '03-tabel-kandidat');

  // Ekspor CSV: data pelamar yang berbentuk rumus dinetralkan
  const [unduhan] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: /Unduh CSV \(3\)/ }).click()]);
  const csv = await readFile(await unduhan.path(), 'utf8');
  assert.ok(csv.includes(`"'=HYPERLINK(""http://contoh.invalid"")"`), 'nama berbentuk rumus tidak dinetralkan di CSV');
  assert.ok(/Rina Kartika;[^\r\n]*;Ya;/.test(csv), 'label skor sementara tidak ada di CSV');
  assert.match(unduhan.suggestedFilename(), /^kandidat-frontend-developer-/);

  // Filter & cari
  await p.getByRole('button', { name: 'Sudah dicek HR' }).click();
  await p.getByText('Tidak ada kandidat yang cocok dengan saringan ini.').waitFor();
  await p.getByRole('button', { name: 'Semua' }).click();
  await p.getByPlaceholder('Cari nama atau email').fill('sari');
  assert.equal(await p.locator('.tabel-kandidat tbody tr').count(), 1);
  await p.getByPlaceholder('Cari nama atau email').fill('');

  // 8. Detail Rina: sorotan, kata kunci, konfirmasi
  await p.getByRole('link', { name: 'Rina Kartika' }).click();
  await p.getByRole('heading', { name: 'Rina Kartika' }).waitFor();
  await p.locator('.skor-besar .stempel', { hasText: 'Sementara' }).waitFor();
  await p.locator('.teks-cv .sorot-ai', { hasText: 'PT Solusi Digital Nusantara' }).waitFor();
  await p.getByRole('button', { name: /Tailwind\s+1×/ }).waitFor();
  await p.getByRole('button', { name: /Universitas Padjadjaran\s+1×/ }).waitFor();
  await p.getByLabel('Cari kata atau kalimat di CV').fill('Docker');
  await p.getByRole('button', { name: 'Sorot' }).click();
  await p.getByRole('button', { name: /Docker\s+tidak ada/ }).waitFor();
  await p.getByLabel('Cari kata atau kalimat di CV').fill('react');
  await p.getByRole('button', { name: 'Sorot' }).click();
  await p.locator('.teks-cv mark', { hasText: 'React' }).first().waitFor();
  await p.getByText('Skill wajib ditemukan: React, JavaScript. Tidak ditemukan: TypeScript.', { exact: true }).waitFor();
  await p.getByText('Jan 2022 sampai sekarang').waitFor();
  await p.getByText('Keluar halaman', { exact: true }).waitFor();
  await p.getByText('Lihat perhitungannya').click();
  await p.getByText(/^Nilai Tes = 60 \+ 40 = 100$/).waitFor();
  await foto(p, '04-detail-kandidat');
  // Keputusan terkunci selama CV belum dicek
  assert.equal(await p.getByRole('button', { name: 'Terima' }).isDisabled(), true, 'Terima aktif padahal CV belum dicek');
  await p.getByText('Terima dan Tolak aktif setelah CV dicek').waitFor();
  await p.getByRole('button', { name: 'Data CV sudah benar' }).click();
  await p.getByText('Data CV dikonfirmasi.').waitFor();
  assert.equal(await p.getByRole('button', { name: 'Terima' }).isDisabled(), false);
  assert.equal(await p.locator('.skor-besar .stempel').count(), 0, 'label sementara masih ada setelah konfirmasi');
  await p.getByText('Sudah dicek HR', { exact: true }).waitFor();

  // 9. Antrean: lanjut ke CV berikutnya yang belum dicek
  await p.getByRole('link', { name: /Lanjut ke CV berikutnya yang belum dicek/ }).waitFor();

  // 10. Sari: PDF scan → isi data CV manual
  await p.goto(`${WEB}/rekruter/lowongan/${lowonganId}`);
  await p.getByRole('link', { name: 'Sari Wulandari' }).click();
  await p.getByText('Tidak terbaca otomatis.').waitFor();
  await p.getByRole('button', { name: 'Isi data CV manual' }).click();
  await p.getByLabel('Skill', { exact: true }).fill('React, JavaScript, TypeScript');
  await p.getByRole('button', { name: 'Tambah tempat kerja' }).click();
  await p.getByLabel('Tempat kerja 1', { exact: true }).fill('Toko Kopi Senja');
  await p.getByRole('button', { name: 'Simpan data CV' }).click();
  await p.getByText('Isi bulan mulai').waitFor();
  await p.getByLabel('Tanggal tidak disebut').check();
  await p.getByRole('button', { name: 'Simpan data CV' }).click();
  await p.getByText('Data CV disimpan.').waitFor();
  await p.getByText('Ada pekerjaan tanpa tanggal (nilai lama kerja netral 50)').waitFor();
  await p.locator('.skor-besar b').waitFor();

  // 11. Keputusan
  await p.getByRole('button', { name: 'Tolak' }).click();
  await p.getByText('Kandidat ditandai ditolak.').waitFor();
  await p.locator('.aksi-judul .status-kandidat', { hasText: 'Ditolak' }).waitFor();
  await p.getByRole('button', { name: 'Batalkan keputusan' }).click();
  await p.locator('.aksi-judul .status-kandidat', { hasText: 'Tes selesai' }).waitFor();

  // 12. Tampilan HP: tabel bisa digeser di dalam kotaknya, halaman tidak melebar
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(`${WEB}/rekruter/lowongan/${lowonganId}`);
  await p.locator('.tabel-kandidat').waitFor();
  const lebarHalaman = await p.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(lebarHalaman <= 390, `halaman melebar di HP: ${lebarHalaman}px`);
  await foto(p, '05-hp');

  // 13. Keluar dari halaman rekruter lalu pelamar masuk: tidak boleh diarahkan ke halaman rekruter
  await p.getByRole('button', { name: 'Keluar' }).click();
  await p.goto(`${WEB}/masuk?ke=%2Frekruter`);
  await p.getByLabel('Email').fill(rina.email);
  await p.getByLabel('Password').fill('rahasia123');
  await p.getByRole('button', { name: 'Masuk' }).click();
  await p.getByRole('heading', { name: 'Lowongan yang sedang dibuka' }).waitFor();
  assert.equal(await p.getByText('bukan untuk akun Anda').count(), 0);

  assert.deepEqual(galatHalaman, [], `Error JavaScript di halaman: ${galatHalaman.join(' | ')}`);
  await browser.close();
  console.log(JSON.stringify({ ok: true, lowonganId }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
