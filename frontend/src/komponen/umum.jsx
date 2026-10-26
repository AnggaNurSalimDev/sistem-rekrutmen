import { Link, NavLink, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

export function Kepala({ lebar = false }) {
  const { user, keluar } = useAuth();
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
            <button type="button" className="tombol-teks" onClick={keluar}>
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
          Anda masuk sebagai {user.role}. <Link to="/">Kembali ke daftar lowongan</Link>.
        </p>
      </Pesan>
    );
  }
  return children;
}

export function formatTanggal(iso) {
  try {
    return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return '';
  }
}
