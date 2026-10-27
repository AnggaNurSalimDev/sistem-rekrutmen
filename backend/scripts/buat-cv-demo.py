"""Membuat ulang PDF CV untuk data demo (butuh: pip install reportlab).

SEMUA ORANG, PERUSAHAAN, DAN KONTAK DI SINI FIKTIF. Nomor HP memakai pola
0800-xxxx yang tidak dipakai operator, email memakai domain demo.rekrut.id.

    python3 scripts/buat-cv-demo.py
"""
from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

TUJUAN = Path(__file__).resolve().parent.parent / 'src' / 'demo' / 'cv'
TUJUAN.mkdir(parents=True, exist_ok=True)

# Setiap CV: daftar (jenis, teks). 'judul' = nama besar, 'bagian' = subjudul, 'teks' = baris biasa.
CV = {
    'dimas-prasetyo': [
        ('judul', 'Dimas Prasetyo'),
        ('teks', 'dimas@demo.rekrut.id | 0800-1111-0001 | Bandung'),
        ('bagian', 'Ringkasan'),
        ('teks', 'Asisten kepala toko dengan pengalaman lima tahun di ritel minimarket.'),
        ('teks', 'Memiliki SIM A dan bersedia kerja shift.'),
        ('bagian', 'Pengalaman Kerja'),
        ('teks', 'Asisten Kepala Toko, Minimarket Berkah Jaya'),
        ('teks', 'Februari 2023 - Sekarang'),
        ('teks', 'Memimpin 6 kru per shift dan menyusun laporan penjualan harian.'),
        ('teks', 'Supervisor Toko, Toko Sinar Abadi'),
        ('teks', 'Januari 2020 - Desember 2022'),
        ('teks', 'Bertanggung jawab atas manajemen stok gudang dan opname bulanan.'),
        ('bagian', 'Keahlian'),
        ('teks', 'Manajemen Stok, Kepemimpinan Tim, Pelayanan Pelanggan, Laporan Penjualan, Microsoft Excel'),
    ],
    'rina-marlina': [
        ('judul', 'Rina Marlina'),
        ('teks', 'rina@demo.rekrut.id | 0800-1111-0002 | Cimahi'),
        ('bagian', 'Pengalaman Kerja'),
        ('teks', 'Koordinator Shift, Swalayan Mekar Sari'),
        ('teks', 'September 2021 - Sekarang'),
        ('teks', 'Mengatur jadwal kasir dan merekap laporan penjualan per shift.'),
        ('teks', 'Kasir, Toko Serba Ada Makmur'),
        ('teks', 'Maret 2019 - Agustus 2021'),
        ('bagian', 'Keahlian'),
        ('teks', 'Pelayanan Pelanggan, Manajemen Stok, Laporan Penjualan'),
        ('bagian', 'Pendidikan'),
        ('teks', 'SMK Bisnis Ritel, lulus 2018'),
    ],
    'putri-ananda': [
        ('judul', 'Putri Ananda'),
        ('teks', 'putri@demo.rekrut.id | 0800-1111-0003 | Bandung'),
        ('bagian', 'Pendidikan'),
        ('teks', 'SMK Pemasaran, lulus 2025'),
        ('bagian', 'Organisasi'),
        ('teks', 'Bendahara OSIS, 2023 - 2024'),
        ('teks', 'Panitia bazar sekolah: mengatur stok barang titipan dan kasir.'),
        ('bagian', 'Keahlian'),
        ('teks', 'Pelayanan Pelanggan, Microsoft Excel'),
        ('teks', 'Bersedia kerja shift.'),
    ],
    'sari-wulandari': [
        ('judul', 'Sari Wulandari'),
        ('teks', 'sari@demo.rekrut.id | 0800-1111-0005 | Sumedang'),
        ('bagian', 'Pengalaman'),
        ('teks', 'Pernah bekerja sebagai pramuniaga di Toko Kain Sejahtera,'),
        ('teks', 'kemudian sebagai kepala kasir di Rumah Makan Bu Tini.'),
        ('teks', 'Terbiasa memimpin tim kecil dan melayani pelanggan saat ramai.'),
        ('bagian', 'Keahlian'),
        ('teks', 'Pelayanan Pelanggan, Kepemimpinan Tim'),
    ],
    'fajar-nugroho': [
        ('judul', 'Fajar Nugroho'),
        ('teks', 'fajar@demo.rekrut.id | 0800-1111-0006 | Bandung'),
        ('bagian', 'Pengalaman Kerja'),
        ('teks', 'Kasir, Kedai Kopi Senja'),
        ('teks', 'Januari 2024 - Agustus 2024'),
        ('bagian', 'Keahlian'),
        ('teks', 'Kasir, Pelayanan Pelanggan'),
    ],
    'lestari-dewi': [
        ('judul', 'Lestari Dewi'),
        ('teks', 'lestari@demo.rekrut.id | 0800-1111-0007 | Bandung'),
        ('bagian', 'Pengalaman Kerja'),
        ('teks', 'Pramuniaga, Toko Sepatu Langkah'),
        ('teks', 'Mei 2023 - Juli 2023'),
        ('bagian', 'Keahlian'),
        ('teks', 'Pelayanan Pelanggan'),
    ],
}


def tulis(nama, isi):
    c = canvas.Canvas(str(TUJUAN / f'{nama}.pdf'), pagesize=A4)
    c.setTitle(f'CV {nama} (fiktif, data demo)')
    y = 800
    for jenis, teks in isi:
        if jenis == 'judul':
            c.setFont('Helvetica-Bold', 16); c.drawString(50, y, teks); y -= 20
        elif jenis == 'bagian':
            y -= 10; c.setFont('Helvetica-Bold', 12); c.drawString(50, y, teks); y -= 16
        else:
            c.setFont('Helvetica', 10); c.drawString(50, y, teks); y -= 14
    c.save()


def cv_scan():
    # Meniru CV hasil foto/scan: hanya gambar, tanpa lapisan teks.
    c = canvas.Canvas(str(TUJUAN / 'bayu-saputra-scan.pdf'), pagesize=A4)
    c.setFillGray(0.85); c.rect(40, 420, 515, 380, fill=1, stroke=0)
    c.setFillGray(0.45)
    for i in range(14):
        c.rect(60, 760 - i * 24, 300 + (i * 37) % 160, 8, fill=1, stroke=0)
    c.save()


if __name__ == '__main__':
    for nama, isi in CV.items():
        tulis(nama, isi)
    cv_scan()
    print(f'{len(CV) + 1} PDF ditulis ke {TUJUAN}')
