"""Membuat ulang PDF contoh untuk test parser (butuh: pip install reportlab).

Semua isi CV fiktif.
"""
from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

TUJUAN = Path(__file__).resolve().parent.parent / 'test' / 'fixtures' / 'pdf'
TUJUAN.mkdir(parents=True, exist_ok=True)


def cv_dua_kolom():
    # Tata letak umum: jabatan + tanggal di satu baris, perusahaan di BAWAHNYA.
    c = canvas.Canvas(str(TUJUAN / 'cv-dua-kolom.pdf'), pagesize=A4)
    c.setFont('Helvetica-Bold', 14); c.drawString(50, 800, 'Rina Kartika')
    c.setFont('Helvetica', 10); c.drawString(50, 785, 'rina@contoh.id | 0812-3456-7890')
    c.setFont('Helvetica-Bold', 12); c.drawString(50, 755, 'Pengalaman Kerja')
    c.setFont('Helvetica', 10)
    c.drawString(50, 740, 'Frontend Developer'); c.drawString(350, 740, 'Januari 2022 - Sekarang')
    c.drawString(50, 727, 'PT Solusi Digital Nusantara')
    c.drawString(50, 710, 'Staf IT'); c.drawString(350, 710, 'Mar 2020 – Des 2021')
    c.drawString(50, 697, 'CV Maju Bersama')
    c.setFont('Helvetica-Bold', 12); c.drawString(50, 670, 'Keahlian')
    c.setFont('Helvetica', 10); c.drawString(50, 655, 'React.js, JavaScript, Git, Tailwind CSS')
    c.showPage()
    c.setFont('Helvetica-Bold', 12); c.drawString(50, 800, 'Pendidikan')
    c.setFont('Helvetica', 10)
    c.drawString(50, 785, 'Universitas Padjadjaran'); c.drawString(350, 785, '2016 - 2020')
    c.save()


def cv_scan():
    # Hanya gambar/kotak, tanpa lapisan teks: meniru CV hasil scan.
    c = canvas.Canvas(str(TUJUAN / 'cv-scan-tanpa-teks.pdf'), pagesize=A4)
    c.setFillGray(0.3); c.rect(50, 500, 400, 200, fill=1)
    c.save()


if __name__ == '__main__':
    cv_dua_kolom()
    cv_scan()
    print(f'PDF contoh dibuat di {TUJUAN}')
