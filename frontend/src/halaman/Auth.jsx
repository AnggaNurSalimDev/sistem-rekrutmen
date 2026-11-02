import { useId, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { MODE_SIMULASI, panggil } from '../api/klien.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Pesan } from '../komponen/umum.jsx';
import { tujuanSetelahMasuk } from '../auth/tujuan.js';
import { MODE_DEMO } from '../merek/ProfilContext.jsx';

function useFormAuth(endpoint) {
  const { masukDengan } = useAuth();
  const navigate = useNavigate();
  const [cari] = useSearchParams();
  const [galat, setGalat] = useState(null);
  const [galatField, setGalatField] = useState({});
  const [mengirim, setMengirim] = useState(false);

  async function kirim(body) {
    setMengirim(true);
    setGalat(null);
    setGalatField({});
    try {
      const hasil = await panggil(endpoint, { method: 'POST', body });
      masukDengan(hasil);
      navigate(tujuanSetelahMasuk(cari.get('ke'), hasil.user.role), { replace: true });
    } catch (err) {
      setGalat(err.message);
      setGalatField(err.perField ?? {});
      setMengirim(false);
    }
  }
  return { kirim, galat, galatField, mengirim, ke: cari.get('ke') };
}

export function Masuk() {
  const { user } = useAuth();
  const id = useId();
  const { kirim, galat, mengirim, ke } = useFormAuth('/auth/login');
  const [isian, setIsian] = useState({ email: '', password: '' });
  if (user) return <Navigate to={tujuanSetelahMasuk(ke, user.role)} replace />;

  return (
    <div className="form-sempit">
      <div className="judul-halaman">
        <h1>Masuk</h1>
      </div>
      {galat && <Pesan jenis="galat">{galat}</Pesan>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          kirim(isian);
        }}
      >
        <div className="isian">
          <label htmlFor={`${id}-email`}>Email</label>
          <input id={`${id}-email`} type="email" autoComplete="email" required value={isian.email} onChange={(e) => setIsian({ ...isian, email: e.target.value })} />
        </div>
        <div className="isian">
          <label htmlFor={`${id}-password`}>Password</label>
          <input id={`${id}-password`} type="password" autoComplete="current-password" required value={isian.password} onChange={(e) => setIsian({ ...isian, password: e.target.value })} />
        </div>
        <button type="submit" className="tombol" disabled={mengirim}>
          {mengirim ? 'Masuk…' : 'Masuk'}
        </button>
      </form>
      <p style={{ marginTop: 20 }}>
        Belum punya akun? <Link to={`/daftar${ke ? `?ke=${encodeURIComponent(ke)}` : ''}`}>Buat akun</Link>
      </p>
      {(MODE_DEMO || MODE_SIMULASI) && (
        <Pesan jenis="info">
          <p>
            Ingin mencoba sisi rekruter? Masuk dengan <code>hr@demo.rekrut.id</code> / <code>demo12345</code>.
          </p>
        </Pesan>
      )}
    </div>
  );
}

export function Daftar() {
  const { user } = useAuth();
  const id = useId();
  const { kirim, galat, galatField, mengirim, ke } = useFormAuth('/auth/register');
  const [isian, setIsian] = useState({ nama: '', email: '', password: '' });
  if (user) return <Navigate to={tujuanSetelahMasuk(ke, user.role)} replace />;

  const ubah = (k) => (e) => setIsian({ ...isian, [k]: e.target.value });

  return (
    <div className="form-sempit">
      <div className="judul-halaman">
        <h1>Buat akun pelamar</h1>
        <p>
          Untuk melamar pekerjaan. Akun rekruter dibuat langsung oleh pemilik lowongan, bukan lewat pendaftaran
          terbuka di sini.
        </p>
      </div>
      {galat && <Pesan jenis="galat">{galat}</Pesan>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          kirim({ ...isian, role: 'kandidat' });
        }}
      >
        <div className="isian">
          <label htmlFor={`${id}-nama`}>Nama</label>
          <input id={`${id}-nama`} type="text" autoComplete="name" required value={isian.nama} onChange={ubah('nama')} />
          {galatField.nama && <span className="galat">{galatField.nama}</span>}
        </div>
        <div className="isian">
          <label htmlFor={`${id}-email`}>Email</label>
          <input id={`${id}-email`} type="email" autoComplete="email" required value={isian.email} onChange={ubah('email')} />
          {galatField.email && <span className="galat">{galatField.email}</span>}
        </div>
        <div className="isian">
          <label htmlFor={`${id}-password`}>Password</label>
          <input
            id={`${id}-password`}
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            aria-describedby={`${id}-password-bantuan`}
            value={isian.password}
            onChange={ubah('password')}
          />
          <span className="bantuan" id={`${id}-password-bantuan`}>
            Minimal 8 karakter.
          </span>
          {galatField.password && <span className="galat">{galatField.password}</span>}
        </div>
        <button type="submit" className="tombol" disabled={mengirim}>
          {mengirim ? 'Membuat akun…' : 'Buat akun'}
        </button>
      </form>
      <p style={{ marginTop: 20 }}>
        Sudah punya akun? <Link to={`/masuk${ke ? `?ke=${encodeURIComponent(ke)}` : ''}`}>Masuk</Link>
      </p>
    </div>
  );
}
