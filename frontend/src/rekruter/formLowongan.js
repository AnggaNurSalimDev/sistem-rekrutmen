/**
 * Mengubah isian form lowongan (teks dari input) menjadi body API, dan
 * sebaliknya. Bobot tes diisi dalam persen di form supaya mudah dibaca HR,
 * lalu diubah ke pecahan (jumlah = 1) yang diminta API.
 */

export const TOLERANSI_PERSEN = 0.1; // API menerima selisih 0,001 dari 1 → 0,1%

/** "React, JavaScript,  ,react" → ["React", "JavaScript"] (tanpa dobel, tanpa beda huruf besar). */
export function pisahDaftar(teks) {
  if (typeof teks !== 'string') return [];
  const unik = new Map();
  for (const bagian of teks.split(/[,\n]/)) {
    const b = bagian.trim().replace(/\s+/g, ' ');
    if (b && !unik.has(b.toLowerCase())) unik.set(b.toLowerCase(), b);
  }
  return [...unik.values()];
}

export function angka(teks) {
  if (typeof teks === 'number') return teks;
  if (typeof teks !== 'string' || teks.trim() === '') return NaN;
  return Number(teks.trim().replace(',', '.'));
}

/** Angka rupiah dari teks "4.500.000" / "4500000". */
export function rupiah(teks) {
  if (typeof teks === 'number') return teks;
  if (typeof teks !== 'string') return NaN;
  const bersih = teks.replace(/[^\d]/g, '');
  return bersih === '' ? NaN : Number(bersih);
}

export function tesKosong() {
  return { id: undefined, jenisTes: '', targetSkor: '80', batasBawah: '40', bobot: '' };
}

export function dariLowongan(l) {
  return {
    posisi: l.posisi,
    budgetMaksimal: String(l.budgetMaksimal),
    skillWajib: l.skillWajib.join(', '),
    skillOpsional: l.skillOpsional.join(', '),
    kebutuhanWaktu: l.kebutuhanWaktu,
    kataKunciSorot: (l.kataKunciSorot ?? []).join(', '),
    tes: (l.tes ?? []).map((t) => ({
      id: t.id,
      jenisTes: t.jenisTes,
      targetSkor: String(t.targetSkor),
      batasBawah: String(t.batasBawah),
      bobot: String(Math.round(t.bobot * 1000) / 10),
    })),
  };
}

export function formBaru() {
  return {
    posisi: '',
    budgetMaksimal: '',
    skillWajib: '',
    skillOpsional: '',
    kebutuhanWaktu: '',
    kataKunciSorot: '',
    tes: [{ ...tesKosong(), jenisTes: 'logika', bobot: '100' }],
  };
}

/**
 * Validasi di browser (pesan per field) lalu bentuk body.
 * @returns {{ galat: Record<string,string>, body: object|null }}
 */
export function keBody(isian, { sertakanTes = true } = {}) {
  const galat = {};
  const posisi = isian.posisi.trim();
  if (!posisi) galat.posisi = 'Isi nama posisi.';
  const budget = rupiah(isian.budgetMaksimal);
  if (!Number.isInteger(budget) || budget <= 0) galat.budgetMaksimal = 'Isi budget gaji maksimal dalam rupiah, lebih dari 0.';
  const skillWajib = pisahDaftar(isian.skillWajib);
  if (skillWajib.length === 0) galat.skillWajib = 'Isi minimal satu skill wajib.';
  if (skillWajib.some((s) => s.length > 60)) galat.skillWajib = 'Setiap skill maksimal 60 karakter.';
  const skillOpsional = pisahDaftar(isian.skillOpsional);
  const kebutuhanWaktu = isian.kebutuhanWaktu.trim();
  if (!kebutuhanWaktu) galat.kebutuhanWaktu = 'Tulis jadwal kerja yang dibutuhkan, misalnya "Shift pagi, Senin–Sabtu".';
  const kataKunciSorot = pisahDaftar(isian.kataKunciSorot);
  if (kataKunciSorot.length > 50) galat.kataKunciSorot = 'Maksimal 50 kata kunci.';

  const body = { posisi, budgetMaksimal: budget, skillWajib, skillOpsional, kebutuhanWaktu, kataKunciSorot };

  if (sertakanTes) {
    const tes = isian.tes.map((t, i) => {
      const jenisTes = t.jenisTes.trim();
      const targetSkor = angka(t.targetSkor);
      const batasBawah = angka(t.batasBawah);
      const bobotPersen = angka(t.bobot);
      if (!jenisTes) galat[`tes.${i}.jenisTes`] = 'Isi nama tes.';
      if (!(targetSkor >= 0 && targetSkor <= 100)) galat[`tes.${i}.targetSkor`] = 'Target 0–100.';
      if (!(batasBawah >= 0 && batasBawah <= 100)) galat[`tes.${i}.batasBawah`] = 'Batas bawah 0–100.';
      else if (targetSkor >= 0 && !(targetSkor > batasBawah)) galat[`tes.${i}.batasBawah`] = 'Harus lebih kecil dari target.';
      if (!(bobotPersen > 0 && bobotPersen <= 100)) galat[`tes.${i}.bobot`] = 'Bobot lebih dari 0 sampai 100%.';
      return {
        ...(t.id ? { id: t.id } : {}),
        jenisTes,
        targetSkor,
        batasBawah,
        bobot: Math.round(bobotPersen * 100) / 10000,
      };
    });
    if (tes.length === 0) galat.tes = 'Tambahkan minimal satu tes.';
    if (tes.length > 10) galat.tes = 'Maksimal 10 tes.';
    const nama = tes.map((t) => t.jenisTes.toLowerCase()).filter(Boolean);
    const ganda = nama.find((n, i) => nama.indexOf(n) !== i);
    if (ganda) galat.tes = `Nama tes "${ganda}" dipakai lebih dari sekali.`;
    const total = isian.tes.reduce((t, x) => t + (angka(x.bobot) || 0), 0);
    if (tes.length > 0 && Math.abs(total - 100) > TOLERANSI_PERSEN) {
      galat.tes = `Jumlah bobot tes harus 100%, sekarang ${Math.round(total * 10) / 10}%.`;
    }
    body.tes = tes;
  }

  return { galat, body: Object.keys(galat).length ? null : body };
}

export function totalBobot(tes) {
  return Math.round(tes.reduce((t, x) => t + (angka(x.bobot) || 0), 0) * 10) / 10;
}
