import { Link, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { berandaPeran } from '../auth/tujuan.js';
import { useAuth } from '../auth/AuthContext.jsx';

export function Kepala({ lebar = false }) {
  const { user, keluar } = useAuth();
  const navigate = useNavigate();
  // Pindah ke halaman publik dulu, baru keluar. Kalau keluar dulu, halaman
  // berlogin yang sedang terbuka akan mengirim ke /masuk?ke=<halaman itu>,
  // dan orang berikutnya yang masuk ikut diarahkan ke sana.
  const keluarSekarang = () => {
    navigate('/', { replace: true });
    keluar();
  };
  return (
    <header className="kepala">
      <div className={lebar ? 'wadah lebar' : 'wadah'}>
        <Link to="/" className="merek" aria-label="Rekrut, ke daftar lowongan">
          Rekrut<span>.</span>
        </Link>
        <nav className="navigasi" aria-label="Utama">
          {user?.role !== 'rekruter' && (
            <NavLink to="/" end>
              Lowongan
            </NavLink>
          )}
          {user?.role === 'kandidat' && <NavLink to="/lamaran">Lamaran saya</NavLink>}
          {user?.role === 'rekruter' && <NavLink to="/rekruter">Lowongan saya</NavLink>}
          {user ? (
            <button type="button" className="tombol-teks" onClick={keluarSekarang}>
              Keluar
            </button>
          ) : (
            <NavLink to="/masuk">Masuk</NavLink>
          )}
        </nav>
      </div>
    </header>
  );
}

export function Pesan({ jenis = 'info', judul, children }) {
  return (
    <div className={`pesan ${jenis}`} role={jenis === 'galat' ? 'alert' : 'status'}>
      {judul && <strong>{judul}</strong>}
      {children}
    </div>
  );
}

export function Memuat({ teks = 'Memuat…' }) {
  return (
    <p role="status" aria-live="polite">
      {teks}
    </p>
  );
}

/** Halaman yang butuh login (dan peran tertentu). */
export function Wajib({ peran, children }) {
  const { user, memuat } = useAuth();
  const lokasi = useLocation();
  if (memuat) return <Memuat />;
  if (!user) return <Navigate to={`/masuk?ke=${encodeURIComponent(lokasi.pathname)}`} replace />;
  if (peran && user.role !== peran) {
    return (
      <Pesan jenis="galat" judul="Halaman ini bukan untuk akun Anda">
        <p>
          Anda masuk sebagai {user.role === 'rekruter' ? 'rekruter' : 'pelamar'}.{' '}
          <Link to={berandaPeran(user.role)}>{user.role === 'rekruter' ? 'Ke lowongan Anda' : 'Ke daftar lowongan'}</Link>.
        </p>
      </Pesan>
    );
  }
  return children;
}

// Dipindah ke src/format.js supaya bisa diuji tanpa React; diekspor ulang agar impor lama tetap jalan.
export { formatTanggal } from '../format.js';
