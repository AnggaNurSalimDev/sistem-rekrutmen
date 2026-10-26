/**
 * Paket untuk kru outlet: toko retail, minimarket, kafe, dan restoran cepat saji.
 *
 * - skill.alias: penulisan lain yang dianggap sama (huruf besar-kecil dan
 *   tanda baca diabaikan).
 * - skill.persis: singkatan yang rawan salah tangkap, sehingga hanya cocok
 *   jika ditulis persis sama (contoh "POS" tidak cocok dengan "kantor pos").
 * - penandaPerusahaan: merek/jenis usaha yang menandai nama tempat kerja,
 *   karena pemberi kerja di bidang ini sering tidak memakai "PT".
 * - kataKunci: hal penting selain skill yang disorot untuk HR (tidak masuk skor).
 */
export default {
  id: 'kru-outlet',
  nama: 'Kru Outlet (Retail & F&B)',
  deskripsi: 'Kasir, pramuniaga, barista, dan kru toko/restoran.',

  skill: [
    { nama: 'Kasir', alias: ['Cashier', 'Kassa', 'Operator Kasir', 'Cashiering'] },
    { nama: 'Mesin POS', alias: ['Point of Sale', 'Mesin Kasir', 'Sistem Kasir', 'Aplikasi Kasir'], persis: ['POS'] },
    {
      nama: 'Cash Handling',
      alias: ['Penanganan Uang Tunai', 'Pengelolaan Uang Tunai', 'Closing Kasir', 'Setoran Kasir', 'Hitung Uang'],
    },
    {
      nama: 'Pelayanan Pelanggan',
      alias: ['Customer Service', 'Melayani Pelanggan', 'Pelayanan Konsumen', 'Service Excellence', 'Customer Handling'],
    },
    {
      nama: 'Penanganan Komplain',
      alias: ['Handling Komplain', 'Menangani Komplain', 'Complaint Handling', 'Penanganan Keluhan', 'Menangani Keluhan'],
    },
    { nama: 'Barista', alias: ['Latte Art', 'Coffee Making', 'Meracik Kopi', 'Membuat Kopi'] },
    {
      nama: 'Persiapan Makanan',
      alias: ['Food Preparation', 'Food Prep', 'Kitchen Helper', 'Cook Helper', 'Helper Dapur', 'Memasak'],
    },
    {
      nama: 'Keamanan Pangan',
      alias: ['Food Safety', 'Food Hygiene', 'Higiene Sanitasi', 'Hygiene Sanitasi', 'Sanitasi', 'HACCP'],
    },
    {
      nama: 'Stock Opname',
      alias: ['Stok Opname', 'Cek Stok', 'Pengecekan Stok', 'Penerimaan Barang', 'Receiving', 'Inventory Control'],
    },
    { nama: 'FIFO', alias: ['FEFO', 'First In First Out'] },
    {
      nama: 'Display Produk',
      alias: ['Visual Merchandising', 'Penataan Produk', 'Penataan Barang', 'Merchandising', 'Planogram', 'Display Barang'],
    },
    { nama: 'Penjualan', alias: ['Sales', 'Selling', 'Sales Promotion'], persis: ['SPG', 'SPB'] },
    { nama: 'Upselling', alias: ['Up Selling', 'Cross Selling', 'Suggestive Selling'] },
    {
      nama: 'Kebersihan Outlet',
      alias: ['Cleaning', 'Housekeeping', 'Menjaga Kebersihan', 'Kebersihan Toko'],
      persis: ['5R', '5S'],
    },
    { nama: 'Opening & Closing Toko', alias: ['Opening Toko', 'Closing Toko', 'Buka Tutup Toko', 'Opening Closing'] },
    { nama: 'Kerja Tim', alias: ['Teamwork', 'Team Work', 'Kerjasama Tim', 'Kerja Sama Tim'] },
    { nama: 'Komunikasi', alias: ['Communication', 'Communication Skill', 'Komunikasi Yang Baik'] },
  ],

  penandaPerusahaan: [
    // Jenis usaha
    'toko', 'minimarket', 'supermarket', 'swalayan', 'mart', 'store', 'outlet', 'butik', 'boutique',
    'kafe', 'cafe', 'café', 'coffee', 'kopi', 'resto', 'restoran', 'restaurant', 'rumah makan', 'warung',
    'kedai', 'bakery', 'bakeri', 'catering', 'katering', 'apotek', 'apotik',
    // Jaringan ritel & F&B yang umum di Indonesia
    'Indomaret', 'Alfamart', 'Alfamidi', 'Lawson', 'FamilyMart', 'Circle K', 'Superindo', 'Hypermart',
    'Transmart', 'Lotte Mart', 'Yogya', 'Griya', 'Borma', 'Matahari', 'Ramayana', 'Miniso', 'Guardian',
    'Watsons', 'Uniqlo', 'Ace Hardware', 'Informa', 'KFC', "McDonald's", 'McDonalds', 'Burger King',
    'Starbucks', 'Janji Jiwa', 'Kopi Kenangan', 'Fore Coffee', 'Point Coffee', 'Chatime', 'HokBen',
    'Richeese', 'Mixue', 'Mie Gacoan', 'Solaria', 'Pizza Hut', 'Domino', 'Es Teh Indonesia', 'Kebab Turki',
  ],

  kataKunci: [
    {
      label: 'Sertifikat penjamah makanan',
      kategori: 'sertifikat',
      pola: ['sertifikat\\s+(?:pelatihan\\s+)?penjamah\\s+makanan', 'food\\s+handler', 'sertifikat\\s+laik\\s+higiene'],
    },
    { label: 'SIM C', kategori: 'sertifikat', pola: ['(?<![\\p{L}])SIM[\\s-]?C(?![\\p{L}])'] },
    { label: 'SIM A', kategori: 'sertifikat', pola: ['(?<![\\p{L}])SIM[\\s-]?A(?![\\p{L}])'] },
    {
      label: 'Bersedia kerja shift',
      kategori: 'ketersediaan',
      pola: [
        'bersedia\\s+(?:untuk\\s+)?(?:bekerja\\s+)?(?:dengan\\s+|dalam\\s+)?(?:sistem\\s+)?shift',
        'siap\\s+(?:bekerja\\s+)?(?:dengan\\s+)?(?:sistem\\s+)?shift',
        'willing\\s+to\\s+work\\s+(?:in\\s+)?shifts?',
      ],
    },
    {
      label: 'Bersedia kerja akhir pekan / hari libur',
      kategori: 'ketersediaan',
      pola: ['bersedia\\s+(?:untuk\\s+)?(?:bekerja\\s+)?(?:di\\s+|pada\\s+)?(?:akhir\\s+pekan|weekend|hari\\s+libur|tanggal\\s+merah)'],
    },
    {
      label: 'Bersedia ditempatkan',
      kategori: 'ketersediaan',
      pola: ['bersedia\\s+ditempatkan', 'willing\\s+to\\s+(?:be\\s+)?relocated?'],
    },
    {
      label: 'Pengalaman jabatan kru outlet',
      kategori: 'jabatan',
      pola: [
        '(?<![\\p{L}])(?:store\\s+)?crew(?:\\s+store|\\s+outlet)?(?![\\p{L}])',
        '(?<![\\p{L}])kru(?:\\s+toko|\\s+outlet)?(?![\\p{L}])',
        '(?<![\\p{L}])(?:pramuniaga|pramusaji|waiter|waitress|server\\s+resto|barista|kasir|cashier)(?![\\p{L}])',
        '(?<![\\p{L}])(?:kepala\\s+toko|store\\s+(?:leader|manager|supervisor|keeper)|asisten\\s+kepala\\s+toko)(?![\\p{L}])',
      ],
    },
  ],
};
