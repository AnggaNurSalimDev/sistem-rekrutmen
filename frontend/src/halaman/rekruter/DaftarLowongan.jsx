import { Link } from 'react-router-dom';
import { Memuat, Pesan, formatTanggal } from '../../komponen/umum.jsx';
import { useData } from '../../rekruter/useData.js';

export const LABEL_STATUS_LOWONGAN = { draf: 'Draf', buka: 'Dibuka', tutup: 'Ditutup' };

export default function DaftarLowongan() {
  const { data, galat } = useData('/lowongan');

  return (
    <>
      <div className="judul-halaman baris-judul">
        <div>
          <h1>Lowongan Anda</h1>
          <p>Buka lowongan untuk melihat pelamar, skor, dan bank soal tesnya.</p>
        </div>
        <Link to="/rekruter/lowongan/baru" className="tombol">
          Buat lowongan
        </Link>
      </div>

      {galat && <Pesan jenis="galat" judul="Daftar lowongan gagal dimuat">{galat.message}</Pesan>}
      {!data && !galat && <Memuat teks="Memuat lowongan…" />}
      {data?.length === 0 && (
        <div className="kosong">
          <p>Belum ada lowongan. Buat satu, isi soal tesnya, lalu buka supaya pelamar bisa melamar.</p>
          <Link to="/rekruter/lowongan/baru" className="tombol">
            Buat lowongan pertama
          </Link>
        </div>
      )}
      {data?.length > 0 && (
        <ul className="daftar-lowongan">
          {data.map((l) => (
            <li key={l.id}>
              <Link to={`/rekruter/lowongan/${l.id}`} className="baris-lowongan baris-rekruter">
                <div>
                  <h2>{l.posisi}</h2>
                  <p className="waktu">Diubah {formatTanggal(l.diubahPada)}</p>
                </div>
                <span className="status-lowongan" data-status={l.status}>
                  {LABEL_STATUS_LOWONGAN[l.status] ?? l.status}
                </span>
                <span className="jumlah-tes">
                  <b>{l.jumlahPelamar}</b> pelamar
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
