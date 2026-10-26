/**
 * Uji ujung ke ujung alur kandidat dengan browser sungguhan (Playwright).
 *
 * Prasyarat: backend dan frontend sudah berjalan, Playwright + Chromium terpasang
 * (`npm i -D playwright && npx playwright install chromium`).
 *
 *   API_URL=http://localhost:3000 WEB_URL=http://localhost:5173 node e2e/alur-kandidat.mjs
 *
 * Skrip membuat data sendiri lewat API (akun rekruter, lowongan, soal), lalu
 * menjalankan alur kandidat di browser: daftar → melamar dengan PDF → tes
 * (dengan satu kali pindah tab dan kamera palsu) → kirim jawaban.
 * Opsional: SCREENSHOT_DIR=/folder untuk menyimpan tangkapan layar.
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const API = process.env.API_URL ?? 'http://localhost:3000';
const WEB = process.env.WEB_URL ?? 'http://localhost:5173';
const FOTO = process.env.SCREENSHOT_DIR;
const PDF = fileURLToPath(new URL('../../backend/test/fixtures/pdf/cv-dua-kolom.pdf', import.meta.url));
const unik = Date.now().toString(36);

async function api(pathname, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${API}${pathname}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${pathname} → ${res.status} ${JSON.stringify(data)}`);
  return data;
}

async function siapkanData() {
  const { token } = await api('/auth/register', {
    method: 'POST',
    body: { email: `rekruter-${unik}@contoh.id`, password: 'rahasia123', nama: 'HR Demo', role: 'rekruter' },
  });
  const { data: lowongan } = await api('/lowongan', {
    method: 'POST',
    token,
    body: {
      posisi: `Kasir Outlet ${unik}`,
      budgetMaksimal: 4_500_000,
      skillWajib: ['Pelayanan Pelanggan', 'Kasir'],
      skillOpsional: ['Barista'],
      kebutuhanWaktu: 'Shift pagi atau sore, Senin–Sabtu',
      kataKunciSorot: ['SIM C'],
      tes: [{ jenisTes: 'logika', targetSkor: 80, batasBawah: 40, bobot: 1 }],
    },
  });
  const tesId = lowongan.tes[0].id;
  const soal = [
    ['Seorang pelanggan membayar Rp50.000 untuk belanja Rp37.500. Berapa kembaliannya?', [['a', 'Rp12.500'], ['b', 'Rp13.500'], ['c', 'Rp22.500']], 'a'],
    ['Stok susu: 24 kotak. Terjual 3 kotak per jam. Setelah 5 jam, sisa berapa?', [['a', '6'], ['b', '9'], ['c', '15']], 'b'],
  ];
  for (const [pertanyaan, opsi, kunciOpsiId] of soal) {
    await api(`/tes/${tesId}/soal`, {
      method: 'POST',
      token,
      body: { pertanyaan, opsi: opsi.map(([id, teks]) => ({ id, teks })), kunciOpsiId },
    });
  }
  await api(`/lowongan/${lowongan.id}/status`, { method: 'PATCH', token, body: { status: 'buka' } });
  return { lowongan, tokenRekruter: token };
}

async function foto(halaman, nama) {
  if (FOTO) await halaman.screenshot({ path: path.join(FOTO, `${nama}.png`), fullPage: true });
}

async function main() {
  const { lowongan } = await siapkanData();
  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'] });
  const p = await context.newPage();
  const galatKonsol = [];
  p.on('pageerror', (e) => galatKonsol.push(e.message));

  // 1. Daftar lowongan → detail
  await p.goto(WEB);
  await p.getByRole('heading', { name: 'Lowongan yang sedang dibuka' }).waitFor();
  await foto(p, '01-beranda');
  await p.getByRole('link', { name: new RegExp(lowongan.posisi) }).click();
  await p.getByRole('heading', { name: lowongan.posisi }).waitFor();

  // 2. Buat akun dari tautan di detail lowongan, kembali ke lowongan yang sama
  await p.getByRole('link', { name: 'buat akun' }).click();
  await p.getByLabel('Nama').fill('Rina Kartika');
  await p.getByLabel('Email').fill(`kandidat-${unik}@contoh.id`);
  await p.getByLabel('Password').fill('rahasia123');
  await p.getByRole('button', { name: 'Buat akun' }).click();
  await p.getByRole('heading', { name: 'Kirim lamaran' }).waitFor();

  // 3. Validasi di sisi browser: kirim kosong → pesan per field, tidak terkirim
  await p.getByRole('button', { name: 'Kirim lamaran' }).click();
  await p.getByText('Isi nomor HP/WA, 8–20 angka.').waitFor();
  await foto(p, '02-form-galat');

  // 4. Isi lengkap dan kirim
  await p.getByLabel('Nomor HP / WhatsApp').fill('0812-3456-7890');
  await p.getByLabel('Gaji yang diharapkan per bulan').fill('4200000');
  await p.getByLabel('Bisa sepenuhnya').check();
  await p.getByLabel('CV (PDF, maksimal 10 MB)').setInputFiles(PDF);
  await p.getByLabel(/Saya setuju CV dan data kontak/).check();
  await p.getByRole('button', { name: 'Kirim lamaran' }).click();
  await p.getByRole('heading', { name: 'Lamaran saya' }).waitFor();
  await p.getByText('Lamaran terkirim').waitFor();
  await p.locator('.stempel', { hasText: 'Terkirim' }).waitFor();
  await foto(p, '03-lamaran-saya');

  // 5. Tes: aturan → mulai
  await p.getByRole('link', { name: 'Mulai tes logika' }).click();
  await p.getByRole('heading', { name: 'Sebelum mulai' }).waitFor();
  await foto(p, '04-sebelum-mulai');
  await p.getByRole('button', { name: 'Mulai tes' }).click();
  await p.getByText('Soal 1 dari 2').waitFor();
  await p.getByText('Kamera aktif').waitFor({ timeout: 10_000 });

  // 6. Satu kali pindah tab: blur + hidden, lalu visible + focus → harus 1 episode
  await p.evaluate(async () => {
    const atur = (v) => Object.defineProperty(document, 'visibilityState', { value: v, configurable: true });
    window.dispatchEvent(new Event('blur'));
    atur('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 1200));
    atur('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
  await p.getByText('Keluar halaman: 1 kali').waitFor();

  // 7. Jawab (satu benar, satu salah), muat ulang halaman: draf jawaban tetap ada
  await p.getByLabel('Rp12.500').check();
  await p.reload();
  await p.getByRole('button', { name: 'Lanjutkan tes' }).click();
  await p.getByText('Soal 1 dari 2').waitFor();
  assert.equal(await p.getByLabel('Rp12.500').isChecked(), true, 'draf jawaban hilang setelah muat ulang');
  // Memuat ulang halaman ikut terhitung sebagai keluar halaman, dan catatan lama tidak hilang.
  await p.getByText('Keluar halaman: 2 kali').waitFor();
  await p.getByLabel('15', { exact: true }).check();
  await foto(p, '05-sedang-tes');

  // 8. Kirim dengan konfirmasi
  await p.getByRole('button', { name: 'Kirim jawaban' }).click();
  await p.getByRole('heading', { name: 'Kirim jawaban sekarang?' }).waitFor();
  await p.getByRole('button', { name: 'Ya, kirim jawaban' }).click();
  await p.getByText('Jawaban tes logika sudah dikirim').waitFor();
  await p.locator('.stempel', { hasText: 'Tes selesai' }).waitFor();
  await foto(p, '06-selesai');

  // 9. Tes yang sudah dikirim tidak bisa dikerjakan ulang
  assert.equal(await p.getByRole('link', { name: /Mulai tes|Lanjutkan tes/ }).count(), 0);

  assert.deepEqual(galatKonsol, [], `Error JavaScript di halaman: ${galatKonsol.join(' | ')}`);
  await browser.close();
  console.log(JSON.stringify({ ok: true, lowonganId: lowongan.id, kandidat: `kandidat-${unik}@contoh.id` }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
