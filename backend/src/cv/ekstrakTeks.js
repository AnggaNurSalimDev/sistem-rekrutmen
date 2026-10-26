import { extractText, getDocumentProxy } from 'unpdf';

export const BATAS_PDF = Object.freeze({
  ukuranMaks: 10 * 1024 * 1024,
  halamanMaks: 20,
  karakterMaks: 50_000,
  hurufMinimal: 30,
});

const PESAN = Object.freeze({
  bukanPdf: 'Berkas bukan PDF yang valid',
  rusak: 'PDF rusak, terenkripsi, atau tidak bisa dibuka',
  tanpaTeks: 'PDF tidak berisi teks yang bisa dibaca (kemungkinan hasil scan atau foto). Perlu tinjauan manual.',
});

/** Merapikan teks tanpa menghilangkan baris (parser regex bergantung pada baris). */
export function rapikanTeks(teks) {
  return teks
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00A0\u2007\u202F\t]/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .split('\n')
    .map((baris) => baris.replace(/ {2,}/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * PDF (Buffer) → { ok: true, teks, jumlahHalaman, terpotong } atau { ok: false, alasan }.
 * Tidak pernah melempar untuk PDF yang buruk: lamaran tetap diterima,
 * CV-nya saja yang masuk antrean tinjauan.
 */
export async function ekstrakTeksPdf(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return { ok: false, alasan: PESAN.bukanPdf };
  if (buffer.length > BATAS_PDF.ukuranMaks) return { ok: false, alasan: 'PDF melebihi 10 MB' };
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') return { ok: false, alasan: PESAN.bukanPdf };

  let halaman;
  let jumlahHalaman;
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    jumlahHalaman = pdf.numPages;
    const { text } = await extractText(pdf, { mergePages: false });
    halaman = text.slice(0, BATAS_PDF.halamanMaks);
  } catch {
    return { ok: false, alasan: PESAN.rusak };
  }

  let teks = rapikanTeks(halaman.join('\n\n'));
  let terpotong = jumlahHalaman > BATAS_PDF.halamanMaks;
  if (teks.length > BATAS_PDF.karakterMaks) {
    teks = teks.slice(0, BATAS_PDF.karakterMaks);
    terpotong = true;
  }

  const jumlahHuruf = (teks.match(/\p{L}/gu) ?? []).length;
  if (jumlahHuruf < BATAS_PDF.hurufMinimal) return { ok: false, alasan: PESAN.tanpaTeks };

  return { ok: true, teks, jumlahHalaman, terpotong };
}
