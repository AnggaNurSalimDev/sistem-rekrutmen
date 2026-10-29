/**
 * Penulis PDF minimal untuk CV demo: satu halaman A4, huruf Helvetica bawaan PDF,
 * teks per baris. Tanpa library, supaya puluhan CV demo bisa dibuat saat seeding
 * tanpa menyimpan berkas PDF satu per satu di repo.
 *
 *   [{ jenis: 'judul', teks: 'Dimas Prasetyo' }, { jenis: 'teks', teks: '…' }]
 *     → stream "BT /F2 16 Tf 50 800 Td (Dimas Prasetyo) Tj ET …"
 *     → objek PDF (katalog, halaman, font, stream) + tabel xref
 *     → Buffer berawalan "%PDF-1.4"
 *
 * Hanya karakter ASCII yang dicetak (Helvetica standar tidak punya huruf di luar Latin-1);
 * karakter lain ditolak supaya teks di PDF dan teks yang diharapkan seeder tidak berbeda diam-diam.
 */

const UKURAN = Object.freeze({ judul: 16, bagian: 12, teks: 10 });
const JARAK_SESUDAH = Object.freeze({ judul: 20, bagian: 16, teks: 14 });
const JARAK_SEBELUM = Object.freeze({ judul: 0, bagian: 10, teks: 0 });
const Y_AWAL = 800;
const Y_MINIMAL = 50;
const PANJANG_BARIS_MAKS = 110;

function escapePdf(teks) {
  return teks.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** @param {{jenis: 'judul'|'bagian'|'teks', teks: string}[]} baris */
export function buatPdfCv(baris, judulDokumen = 'CV (fiktif, data demo)') {
  if (!Array.isArray(baris) || baris.length === 0) throw new TypeError('baris CV harus array yang tidak kosong');
  if (typeof judulDokumen !== 'string' || !/^[\x20-\x7e]*$/.test(judulDokumen)) throw new TypeError('judul dokumen harus ASCII');

  let y = Y_AWAL;
  const perintah = [];
  for (const [i, b] of baris.entries()) {
    if (!b || !(b.jenis in UKURAN)) throw new TypeError(`baris ${i}: jenis harus judul, bagian, atau teks`);
    if (typeof b.teks !== 'string' || b.teks.length === 0) throw new TypeError(`baris ${i}: teks kosong`);
    if (!/^[\x20-\x7e]+$/.test(b.teks)) throw new TypeError(`baris ${i}: hanya karakter ASCII yang didukung: ${JSON.stringify(b.teks)}`);
    if (b.teks.length > PANJANG_BARIS_MAKS) throw new RangeError(`baris ${i}: lebih dari ${PANJANG_BARIS_MAKS} karakter, pecah dulu`);
    y -= JARAK_SEBELUM[b.jenis];
    if (y < Y_MINIMAL) throw new RangeError('CV demo melebihi satu halaman');
    const font = b.jenis === 'teks' ? 'F1' : 'F2';
    perintah.push(`BT /${font} ${UKURAN[b.jenis]} Tf 50 ${y} Td (${escapePdf(b.teks)}) Tj ET`);
    y -= JARAK_SESUDAH[b.jenis];
  }
  const isi = perintah.join('\n');

  const objek = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(isi, 'latin1')} >>\nstream\n${isi}\nendstream`,
    `<< /Title (${escapePdf(judulDokumen)}) /Producer (seeder demo) >>`,
  ];

  let keluaran = '%PDF-1.4\n';
  const posisi = [];
  objek.forEach((o, i) => {
    posisi.push(Buffer.byteLength(keluaran, 'latin1'));
    keluaran += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const awalXref = Buffer.byteLength(keluaran, 'latin1');
  keluaran += `xref\n0 ${objek.length + 1}\n0000000000 65535 f \n`;
  for (const p of posisi) keluaran += `${String(p).padStart(10, '0')} 00000 n \n`;
  keluaran += `trailer\n<< /Size ${objek.length + 1} /Root 1 0 R /Info ${objek.length} 0 R >>\nstartxref\n${awalXref}\n%%EOF\n`;
  return Buffer.from(keluaran, 'latin1');
}
