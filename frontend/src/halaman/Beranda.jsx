import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { panggil } from '../api/klien.js';
import { Memuat, Pesan } from '../komponen/umum.jsx';

export default function Beranda() {
  const [lowongan, setLowongan] = useState(null);
  const [galat, setGalat] = useState(null);
  const [ulang, setUlang] = useState(0);

  useEffect(() => {
    let batal = false;
    setGalat(null);
    panggil('/lowongan-terbuka')
      .then((r) => !batal && setLowongan(r.data))
      .catch((e) => !batal && setGalat(e.message));
    return () => {
      batal = true;
    };
  }, [ulang]);

  return (
    <>
      <div className="judul-halaman">
        <h1>Lowongan yang sedang dibuka</h1>
        <p>Pilih lowongan, kirim CV, lalu kerjakan tes pilihan ganda singkat. Semua bisa dari HP.</p>
      </div>

      {galat && (
        <Pesan jenis="galat" judul="Daftar lowongan gagal dimuat">
          <p>{galat}</p>
          <button type="button" className="tombol-teks" onClick={() => setUlang((n) => n + 1)}>
            Muat ulang
          </button>
        </Pesan>
      )}
      {!galat && lowongan === null && <Memuat teks="Memuat lowongan…" />}
      {lowongan?.length === 0 && (
        <div className="kosong">
          <p>Belum ada lowongan yang dibuka. Coba lagi beberapa hari lagi.</p>
        </div>
      )}
      {lowongan?.length > 0 && (
        <ul className="daftar-lowongan">
          {lowongan.map((l) => (
            <li key={l.id}>
              <Link to={`/lowongan/${l.id}`} className="baris-lowongan">
                <h2>{l.posisi}</h2>
                <span className="waktu">{l.kebutuhanWaktu}</span>
                <span className="jumlah-tes">
                  <b>{l.tes.length}</b> tes
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
