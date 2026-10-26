import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { Memuat, Pesan, formatTanggal } from '../komponen/umum.jsx';

const LABEL_STATUS = {
  dilamar: 'Terkirim',
  ujian: 'Sedang tes',
  selesai: 'Tes selesai',
  ditolak: 'Tidak lanjut',
  diterima: 'Diterima',
};

const LABEL_TES = { belum: 'Belum dikerjakan', berlangsung: 'Sedang dikerjakan', selesai: 'Sudah dikirim' };

export default function LamaranSaya() {
  const { api } = useAuth();
  const lokasi = useLocation();
  const [lamaran, setLamaran] = useState(null);
  const [galat, setGalat] = useState(null);
  const baru = lokasi.state?.lamaranBaru;
  const tesTerkirim = lokasi.state?.tesTerkirim;

  useEffect(() => {
    let batal = false;
    api('/lamaran')
      .then((r) => !batal && setLamaran(r.data))
      .catch((e) => !batal && setGalat(e.message));
    return () => {
      batal = true;
    };
  }, [api]);

  return (
    <>
      <div className="judul-halaman">
        <h1>Lamaran saya</h1>
        <p>Kerjakan semua tes di setiap lamaran. Hasil seleksi dikabari langsung oleh perusahaan.</p>
      </div>

      {baru && <Pesan jenis="sukses" judul="Lamaran terkirim">Lanjutkan dengan mengerjakan tes di bawah.</Pesan>}
      {tesTerkirim && <Pesan jenis="sukses" judul={`Jawaban tes ${tesTerkirim} sudah dikirim`} />}
      {galat && <Pesan jenis="galat" judul="Lamaran gagal dimuat">{galat}</Pesan>}
      {!galat && lamaran === null && <Memuat teks="Memuat lamaran…" />}
      {lamaran?.length === 0 && (
        <div className="kosong">
          <p>Anda belum melamar lowongan apa pun.</p>
          <Link to="/" className="tombol">
            Lihat lowongan
          </Link>
        </div>
      )}

      {lamaran?.length > 0 && (
        <ul className="daftar-tiket">
          {lamaran.map((l) => (
            <li key={l.id} className={`tiket${l.id === baru ? ' baru' : ''}`}>
              <div className="tiket-kepala">
                <h2>{l.lowongan.posisi}</h2>
                <p className="tanggal">Dikirim {formatTanggal(l.dikirimPada)}</p>
                <span className="stempel" data-status={l.statusAplikasi}>
                  {LABEL_STATUS[l.statusAplikasi] ?? l.statusAplikasi}
                </span>
              </div>
              <div className="tiket-sobekan" aria-hidden="true" />
              <div className="tiket-badan">
                <h3 className="sr-only">Tes</h3>
                <ul className="daftar-tes">
                  {l.tes.map((t) => (
                    <li key={t.id}>
                      <div>
                        <div className="nama-tes">{t.jenisTes}</div>
                        <div className={`status-tes ${t.status}`}>{LABEL_TES[t.status]}</div>
                      </div>
                      <AksiTes lamaran={l} tes={t} />
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function AksiTes({ lamaran, tes }) {
  if (tes.status === 'selesai') return null;
  if (tes.status === 'belum' && lamaran.lowongan.status !== 'buka') {
    return <span className="status-tes">Lowongan sudah ditutup</span>;
  }
  return (
    <Link to={`/lamaran/${lamaran.id}/tes/${tes.id}`} className={`tombol${tes.status === 'belum' ? '' : ' kedua'}`}>
      {tes.status === 'belum' ? `Mulai tes ${tes.jenisTes}` : 'Lanjutkan tes'}
    </Link>
  );
}
