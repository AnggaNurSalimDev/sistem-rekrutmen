import { z } from 'zod';

const BULAN = /^\d{4}-(0[1-9]|1[0-2])$/;
const KUTIPAN_MAKS = 400;

export const KATEGORI_TEMUAN = Object.freeze(['sertifikat', 'ketersediaan', 'lainnya']);

/**
 * Skema JSON untuk "tool" yang wajib dipanggil Claude. Memaksa output lewat
 * tool membuat jawaban selalu berbentuk data, bukan teks bebas.
 * Setiap temuan wajib membawa kutipan persis dari CV (diverifikasi backend).
 */
export const TOOL_HASIL_CV = Object.freeze({
  name: 'simpan_hasil_cv',
  description: 'Simpan data yang diekstrak dari CV. Setiap temuan wajib disertai kutipan persis dari teks CV.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['skills', 'riwayatKerja', 'temuanLain'],
    properties: {
      skills: {
        type: 'array',
        maxItems: 100,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['nama', 'kutipan'],
          properties: {
            nama: { type: 'string', description: 'Nama skill. Jika cocok dengan skill lowongan, tulis persis seperti di daftar skill lowongan.' },
            kutipan: { type: 'string', description: 'Potongan teks persis dari CV yang menjadi bukti skill ini.' },
          },
        },
      },
      riwayatKerja: {
        type: 'array',
        maxItems: 30,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['perusahaan', 'jabatan', 'mulai', 'selesai', 'masihBekerja', 'hanyaTahun', 'kutipan'],
          properties: {
            perusahaan: { type: 'string', description: 'Nama tempat kerja persis seperti tertulis di CV.' },
            jabatan: { type: ['string', 'null'] },
            mulai: { type: ['string', 'null'], description: 'YYYY-MM, atau null jika CV tidak menyebut kapan mulai.' },
            selesai: { type: ['string', 'null'], description: 'YYYY-MM, atau null jika masih bekerja atau CV tidak menyebut.' },
            masihBekerja: { type: 'boolean', description: 'true hanya jika CV jelas menyebut masih bekerja (contoh: "sekarang", "present").' },
            hanyaTahun: { type: 'boolean', description: 'true jika CV hanya menyebut tahun tanpa bulan.' },
            kutipan: { type: 'string', description: 'Potongan teks persis dari CV yang memuat nama tempat kerja (dan tanggalnya jika ada).' },
          },
        },
      },
      temuanLain: {
        type: 'array',
        maxItems: 30,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kategori', 'label', 'kutipan'],
          properties: {
            kategori: { type: 'string', enum: [...KATEGORI_TEMUAN] },
            label: { type: 'string', description: 'Ringkasan singkat, contoh "SIM C" atau "Bersedia kerja shift".' },
            kutipan: { type: 'string' },
          },
        },
      },
    },
  },
});

const kutipan = z.string().trim().min(1).max(KUTIPAN_MAKS);
const bulan = z.string().regex(BULAN, 'format harus YYYY-MM').nullable();

/** Validasi ulang di sisi kita: skema tool tidak menjamin bentuk output 100%. */
export const skemaHasilAi = z.object({
  skills: z.array(z.object({ nama: z.string().trim().min(1).max(80), kutipan })).max(100),
  riwayatKerja: z
    .array(
      z.object({
        perusahaan: z.string().trim().min(1).max(200),
        jabatan: z.string().trim().max(120).nullable(),
        mulai: bulan,
        selesai: bulan,
        masihBekerja: z.boolean(),
        hanyaTahun: z.boolean(),
        kutipan,
      }),
    )
    .max(30),
  temuanLain: z
    .array(z.object({ kategori: z.enum(KATEGORI_TEMUAN), label: z.string().trim().min(1).max(120), kutipan }))
    .max(30),
});
