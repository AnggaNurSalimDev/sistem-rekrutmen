/*
 * Mode simulasi tidak bisa benar-benar membaca isi PDF yang diunggah pengunjung
 * (itu butuh AI sungguhan di server). Jadi saat seseorang melamar, hasil "baca CV"
 * diambil dari salah satu profil contoh di bawah — persis prinsip yang sama dengan
 * data demo backend (sumber = 'contoh', bukan 'ai'), hanya saja dipilih saat itu juga.
 *
 * Berkas PDF yang sungguh diunggah TETAP bisa dibuka lewat "Buka PDF asli" (dibuat
 * jadi blob URL di browser); yang disimulasikan hanya bagian "pembacaan AI"-nya.
 *
 *   nama pelamar ──hash sederhana──▶ pilih salah satu PROFIL
 *                                         │
 *                       teks (dipakai sebagai "teks CV")
 *                       contohHasil (skills/riwayatKerja/temuanLain dengan kutipan
 *                                    yang PERSIS ada di teks di atas)
 *                                         │
 *                       verifikasiHasilAi(teks, contohHasil)  ← fungsi asli, sama
 *                       dengan yang dipakai backend sungguhan
 */

const baris = (arr) => arr.join('\n');

export const PROFIL_CV = [
  {
    teks: baris([
      'Ringkasan',
      'Berpengalaman di ritel dengan tanggung jawab memimpin tim kecil.',
      'Memiliki SIM A dan bersedia kerja shift.',
      'Pengalaman Kerja',
      'Kepala Kasir, Toko Makmur Sentosa',
      'Maret 2022 - Sekarang',
      'Mengawasi stok opname mingguan dan menyusun laporan penjualan.',
      'Kasir, Minimarket Cahaya',
      'Januari 2020 - Februari 2022',
      'Keahlian',
      'Kasir, Pelayanan Pelanggan, Manajemen Stok, Laporan Penjualan, Kepemimpinan Tim',
    ]),
    skills: ['Kasir', 'Pelayanan Pelanggan', 'Manajemen Stok', 'Laporan Penjualan', 'Kepemimpinan Tim'],
    riwayat: [
      { perusahaan: 'Toko Makmur Sentosa', jabatan: 'Kepala Kasir', mulai: '2022-03', selesai: null, kutipan: 'Kepala Kasir, Toko Makmur Sentosa Maret 2022 - Sekarang' },
      { perusahaan: 'Minimarket Cahaya', jabatan: 'Kasir', mulai: '2020-01', selesai: '2022-02', kutipan: 'Kasir, Minimarket Cahaya Januari 2020 - Februari 2022' },
    ],
    temuan: [{ kategori: 'sertifikat', label: 'SIM A', kutipan: 'Memiliki SIM A' }],
  },
  {
    teks: baris([
      'Pendidikan',
      'SMK Pemasaran, lulus 2025',
      'Organisasi',
      'Anggota OSIS, 2023 - 2024',
      'Panitia bazar sekolah: mengatur stok barang titipan dan kasir.',
      'Keahlian',
      'Pelayanan Pelanggan, Microsoft Excel, Komunikasi',
      'Bersedia kerja shift.',
    ]),
    skills: ['Pelayanan Pelanggan', 'Microsoft Excel', 'Komunikasi'],
    riwayat: [],
    temuan: [{ kategori: 'ketersediaan', label: 'bersedia kerja shift', kutipan: 'Bersedia kerja shift' }],
  },
  {
    teks: baris([
      'Pengalaman Kerja',
      'Staf Gudang, Distributor Makmur Abadi',
      'Juni 2021 - Sekarang',
      'Mencatat barang masuk dan keluar, menyusun barang sesuai kode rak.',
      'Keahlian',
      'Manajemen Stok, Bongkar Muat, Forklift',
      'Memiliki SIM C.',
    ]),
    skills: ['Manajemen Stok', 'Bongkar Muat', 'Forklift'],
    riwayat: [{ perusahaan: 'Distributor Makmur Abadi', jabatan: 'Staf Gudang', mulai: '2021-06', selesai: null, kutipan: 'Staf Gudang, Distributor Makmur Abadi Juni 2021 - Sekarang' }],
    temuan: [{ kategori: 'sertifikat', label: 'SIM C', kutipan: 'Memiliki SIM C' }],
  },
  {
    teks: baris([
      'Pengalaman Kerja',
      'Admin Penjualan, Toko Elektronik Terang',
      'Februari 2023 - Sekarang',
      'Membuat rekap penjualan harian dan mengarsipkan faktur.',
      'Pramuniaga, Toko Serba Ada Makmur',
      'Agustus 2021 - Januari 2023',
      'Keahlian',
      'Microsoft Excel, Administrasi, Laporan Penjualan, Pelayanan Pelanggan',
    ]),
    skills: ['Microsoft Excel', 'Administrasi', 'Laporan Penjualan', 'Pelayanan Pelanggan'],
    riwayat: [
      { perusahaan: 'Toko Elektronik Terang', jabatan: 'Admin Penjualan', mulai: '2023-02', selesai: null, kutipan: 'Admin Penjualan, Toko Elektronik Terang Februari 2023 - Sekarang' },
      { perusahaan: 'Toko Serba Ada Makmur', jabatan: 'Pramuniaga', mulai: '2021-08', selesai: '2023-01', kutipan: 'Pramuniaga, Toko Serba Ada Makmur Agustus 2021 - Januari 2023' },
    ],
    temuan: [],
  },
  {
    teks: baris([
      'Pengalaman Kerja',
      'Barista, Kedai Kopi Senja',
      'Mei 2022 - Sekarang',
      'Menyeduh kopi manual dan espresso, melatih kru baru membuat latte art.',
      'Keahlian',
      'Menyeduh Kopi, Latte Art, Pelayanan Pelanggan',
    ]),
    skills: ['Menyeduh Kopi', 'Latte Art', 'Pelayanan Pelanggan'],
    riwayat: [{ perusahaan: 'Kedai Kopi Senja', jabatan: 'Barista', mulai: '2022-05', selesai: null, kutipan: 'Barista, Kedai Kopi Senja Mei 2022 - Sekarang' }],
    temuan: [],
  },
];

/** String apa pun → indeks 0..n-1, stabil untuk input yang sama (bukan untuk keamanan). */
export function pilihProfil(kunci) {
  let h = 0;
  for (const ch of String(kunci)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PROFIL_CV[h % PROFIL_CV.length];
}
