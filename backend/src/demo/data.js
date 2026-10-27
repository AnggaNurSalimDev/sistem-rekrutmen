/**
 * Isi data demo. SEMUA ORANG DAN PERUSAHAAN FIKTIF.
 *
 * `contohHasil` berbentuk persis seperti output parser AI, tetapi ditulis
 * tangan. Seeder menjalankannya lewat verifikasi kutipan yang sama dengan
 * hasil AI sungguhan, lalu menandainya sumber = 'contoh' supaya dashboard
 * menampilkan label "contoh hasil", bukan seolah-olah dibaca AI.
 *
 * `benar` = berapa soal yang dijawab benar per tes (sisanya salah), supaya
 * skor tes konsisten dengan jawaban yang bisa dilihat HR per soal.
 */

export const DOMAIN_DEMO = 'demo.rekrut.id';
export const PASSWORD_DEMO = 'demo12345';

export const REKRUTER = { email: `hr@${DOMAIN_DEMO}`, nama: 'HR Demo Toko Sejahtera' };

// [pertanyaan, [opsi a, b, c, d], id kunci]
const SOAL_LOGIKA = [
  ['Stok susu 48 kotak. Terjual 6 kotak per jam. Setelah 5 jam, sisa berapa kotak?', ['18', '30', '42', '24'], 'a'],
  ['Semua kasir wajib hadir pukul 07.00. Rani adalah kasir. Maka …', ['Rani boleh datang pukul 08.00', 'Rani wajib hadir pukul 07.00', 'Rani bukan kasir', 'Tidak bisa disimpulkan'], 'b'],
  ['Deret 3, 6, 12, 24, … angka berikutnya?', ['36', '30', '48', '42'], 'c'],
  ['Harga Rp20.000 diskon 15%. Harga setelah diskon?', ['Rp15.000', 'Rp18.000', 'Rp16.500', 'Rp17.000'], 'd'],
  ['Toko buka 08.00–21.00 dengan dua shift sama panjang. Shift kedua mulai pukul?', ['14.30', '15.00', '14.00', '13.30'], 'a'],
];

const SOAL_SITUASI = [
  ['Pelanggan marah karena antrean kasir panjang. Apa yang Anda lakukan pertama kali?', ['Membuka kasir tambahan dan meminta maaf atas antreannya', 'Meminta pelanggan menunggu tanpa penjelasan', 'Menyuruh kasir bekerja lebih cepat di depan pelanggan', 'Mengabaikan karena antrean wajar'], 'a'],
  ['Hasil stok opname kurang 5 barang dari catatan. Langkah pertama?', ['Langsung menyalahkan kru shift malam', 'Memeriksa ulang catatan masuk-keluar dan rekaman CCTV', 'Menutup selisih dengan uang pribadi', 'Mengubah catatan agar sesuai'], 'b'],
  ['Dua kru berselisih di depan pelanggan. Yang paling tepat?', ['Membiarkan sampai selesai sendiri', 'Ikut menegur keras di depan pelanggan', 'Memisahkan keduanya dan membahasnya setelah pelanggan sepi', 'Melapor ke pusat tanpa bicara dengan mereka'], 'c'],
  ['Kru baru sering salah memberi kembalian. Apa yang Anda lakukan?', ['Memindahkannya ke gudang tanpa penjelasan', 'Memotong gajinya', 'Membiarkan karena masih baru', 'Mendampinginya di kasir dan memberi latihan singkat'], 'd'],
  ['Pemasok datang terlambat sehingga barang promo kosong. Yang Anda lakukan?', ['Memasang pemberitahuan dan menawarkan barang pengganti', 'Menghapus promo diam-diam', 'Menyalahkan pemasok ke pelanggan', 'Menutup rak promo tanpa keterangan'], 'a'],
];

const SOAL_HITUNG = [
  ['Belanja Rp37.500, dibayar Rp50.000. Kembaliannya?', ['Rp12.500', 'Rp13.500', 'Rp22.500'], 'a'],
  ['3 roti @Rp4.500 dan 2 susu @Rp6.000. Totalnya?', ['Rp24.500', 'Rp25.500', 'Rp26.500'], 'b'],
  ['Uang di laci awal shift Rp300.000. Penjualan tunai Rp1.250.000. Uang seharusnya?', ['Rp1.500.000', 'Rp1.250.000', 'Rp1.550.000'], 'c'],
  ['Diskon 10% dari Rp45.000 adalah?', ['Rp4.500', 'Rp5.000', 'Rp450'], 'a'],
];

const opsi = (daftar) => daftar.map((teks, i) => ({ id: 'abcd'[i], teks }));
const bank = (daftar) => daftar.map(([pertanyaan, o, kunciOpsiId]) => ({ pertanyaan, opsi: opsi(o), kunciOpsiId }));

export const LOWONGAN = [
  {
    kunci: 'kepala-toko',
    status: 'buka',
    body: {
      posisi: 'Kepala Toko',
      budgetMaksimal: 6_000_000,
      skillWajib: ['Manajemen Stok', 'Kepemimpinan Tim', 'Pelayanan Pelanggan', 'Laporan Penjualan'],
      skillOpsional: ['Microsoft Excel'],
      kebutuhanWaktu: 'Senin–Sabtu, shift pagi atau malam bergantian',
      kataKunciSorot: ['SIM A', 'bersedia kerja shift', 'stok opname'],
      tes: [
        { jenisTes: 'logika', targetSkor: 80, batasBawah: 40, bobot: 0.6 },
        { jenisTes: 'situasi kerja', targetSkor: 80, batasBawah: 40, bobot: 0.4 },
      ],
    },
    soal: { logika: bank(SOAL_LOGIKA), 'situasi kerja': bank(SOAL_SITUASI) },
  },
  {
    kunci: 'kasir',
    status: 'buka',
    body: {
      posisi: 'Kasir Outlet',
      budgetMaksimal: 3_800_000,
      skillWajib: ['Kasir', 'Pelayanan Pelanggan'],
      skillOpsional: [],
      kebutuhanWaktu: 'Shift pagi 07.00–15.00, Senin–Sabtu',
      kataKunciSorot: ['kembalian', 'shift pagi'],
      tes: [{ jenisTes: 'hitung', targetSkor: 75, batasBawah: 25, bobot: 1 }],
    },
    soal: { hitung: bank(SOAL_HITUNG) },
  },
];

const skill = (nama, kutipan = nama) => ({ nama, kutipan });
const kerja = (perusahaan, jabatan, mulai, selesai, kutipan) => ({
  perusahaan,
  jabatan,
  mulai,
  selesai,
  masihBekerja: mulai !== null && selesai === null,
  hanyaTahun: false,
  kutipan,
});

export const PELAMAR = [
  {
    // A: skor tinggi, tapi sering keluar halaman saat tes.
    akun: 'dimas',
    nama: 'Dimas Prasetyo',
    lowongan: 'kepala-toko',
    cv: 'dimas-prasetyo.pdf',
    gaji: 5_500_000,
    waktu: 'penuh',
    contohHasil: {
      skills: [skill('Manajemen Stok'), skill('Kepemimpinan Tim'), skill('Pelayanan Pelanggan'), skill('Laporan Penjualan'), skill('Microsoft Excel')],
      riwayatKerja: [
        kerja('Minimarket Berkah Jaya', 'Asisten Kepala Toko', '2023-02', null, 'Asisten Kepala Toko, Minimarket Berkah Jaya Februari 2023 - Sekarang'),
        kerja('Toko Sinar Abadi', 'Supervisor Toko', '2020-01', '2022-12', 'Supervisor Toko, Toko Sinar Abadi Januari 2020 - Desember 2022'),
      ],
      temuanLain: [
        { kategori: 'sertifikat', label: 'SIM A', kutipan: 'Memiliki SIM A' },
        { kategori: 'ketersediaan', label: 'Bersedia kerja shift', kutipan: 'bersedia kerja shift' },
      ],
    },
    ujian: {
      logika: { benar: 5, menit: 9, kamera: 'granted', keluar: [12, 25, 8, 31, 14, 6, 19] },
      'situasi kerja': { benar: 3, menit: 7, kamera: 'granted', keluar: [22, 9], dibukaUlang: 1 },
    },
  },
  {
    // B: skor sedang, bersih, CV sudah dicek HR.
    akun: 'rina',
    nama: 'Rina Marlina',
    lowongan: 'kepala-toko',
    cv: 'rina-marlina.pdf',
    gaji: 5_000_000,
    waktu: 'penuh',
    konfirmasiHr: true,
    contohHasil: {
      skills: [skill('Pelayanan Pelanggan'), skill('Manajemen Stok'), skill('Laporan Penjualan')],
      riwayatKerja: [
        kerja('Swalayan Mekar Sari', 'Koordinator Shift', '2021-09', null, 'Koordinator Shift, Swalayan Mekar Sari September 2021 - Sekarang'),
        kerja('Toko Serba Ada Makmur', 'Kasir', '2019-03', '2021-08', 'Kasir, Toko Serba Ada Makmur Maret 2019 - Agustus 2021'),
      ],
      temuanLain: [],
    },
    ujian: {
      logika: { benar: 3, menit: 12, kamera: 'granted', keluar: [] },
      'situasi kerja': { benar: 4, menit: 8, kamera: 'granted', keluar: [] },
    },
  },
  {
    // C: fresh graduate tanpa riwayat kerja, kamera ditolak.
    akun: 'putri',
    nama: 'Putri Ananda',
    lowongan: 'kepala-toko',
    cv: 'putri-ananda.pdf',
    gaji: 4_200_000,
    waktu: 'penuh',
    contohHasil: {
      skills: [skill('Pelayanan Pelanggan'), skill('Microsoft Excel')],
      riwayatKerja: [],
      temuanLain: [{ kategori: 'ketersediaan', label: 'Bersedia kerja shift', kutipan: 'Bersedia kerja shift' }],
    },
    ujian: {
      logika: { benar: 4, menit: 10, kamera: 'denied', keluar: [5] },
      'situasi kerja': { benar: 3, menit: 9, kamera: 'denied', keluar: [] },
    },
  },
  {
    // D: CV hasil scan, tidak bisa dibaca → HR perlu mengisi manual.
    akun: 'bayu',
    nama: 'Bayu Saputra',
    lowongan: 'kepala-toko',
    cv: 'bayu-saputra-scan.pdf',
    gaji: 6_500_000,
    waktu: 'sebagian',
    contohHasil: null,
    ujian: {
      logika: { benar: 2, menit: 14, kamera: 'hardware_not_found', keluar: [40] },
      'situasi kerja': { benar: 4, menit: 6, kamera: 'hardware_not_found', keluar: [] },
    },
  },
  {
    // E: pengalaman kerja tanpa tanggal, gaji di atas budget.
    akun: 'sari',
    nama: 'Sari Wulandari',
    lowongan: 'kepala-toko',
    cv: 'sari-wulandari.pdf',
    gaji: 7_000_000,
    waktu: 'penuh',
    contohHasil: {
      skills: [skill('Pelayanan Pelanggan'), skill('Kepemimpinan Tim')],
      riwayatKerja: [
        kerja('Toko Kain Sejahtera', 'Pramuniaga', null, null, 'pramuniaga di Toko Kain Sejahtera'),
        kerja('Rumah Makan Bu Tini', 'Kepala Kasir', null, null, 'kepala kasir di Rumah Makan Bu Tini'),
      ],
      temuanLain: [],
    },
    ujian: {
      logika: { benar: 3, menit: 11, kamera: 'granted', keluar: [7] },
      'situasi kerja': { benar: 5, menit: 7, kamera: 'granted', keluar: [] },
    },
  },
  {
    // Kasir: baru melamar, belum tes.
    akun: 'fajar',
    nama: 'Fajar Nugroho',
    lowongan: 'kasir',
    cv: 'fajar-nugroho.pdf',
    gaji: 3_500_000,
    waktu: 'penuh',
    contohHasil: {
      skills: [skill('Kasir'), skill('Pelayanan Pelanggan')],
      riwayatKerja: [kerja('Kedai Kopi Senja', 'Kasir', '2024-01', '2024-08', 'Kasir, Kedai Kopi Senja Januari 2024 - Agustus 2024')],
      temuanLain: [],
    },
    ujian: {},
  },
  {
    // Kasir: sudah tes, ditolak HR.
    akun: 'lestari',
    nama: 'Lestari Dewi',
    lowongan: 'kasir',
    cv: 'lestari-dewi.pdf',
    gaji: 3_600_000,
    waktu: 'sebagian',
    keputusan: 'ditolak',
    konfirmasiHr: true,
    contohHasil: {
      skills: [skill('Pelayanan Pelanggan')],
      riwayatKerja: [kerja('Toko Sepatu Langkah', 'Pramuniaga', '2023-05', '2023-07', 'Pramuniaga, Toko Sepatu Langkah Mei 2023 - Juli 2023')],
      temuanLain: [],
    },
    ujian: { hitung: { benar: 2, menit: 5, kamera: 'granted', keluar: [] } },
  },
];
