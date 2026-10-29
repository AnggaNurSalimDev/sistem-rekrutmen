import { Link, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { berandaPeran } from '../auth/tujuan.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useProfil } from '../merek/ProfilContext.jsx';

export function Kepala({ lebar = false }) {
  const { user, keluar } = useAuth();
  const { tampil: profil } = useProfil();
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
        <Link to="/" className="merek" aria-label={`${profil.nama}, ke daftar lowongan`}>
          {profil.logo.gambar && <img src={profil.logo.gambar} alt="" height="28" />}
          <span>
            {profil.logo.teks}
            {profil.logo.titik && <span className="titik">.</span>}
          </span>
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

/** Hanya di mode demo: ganti profil perusahaan untuk melihat fleksibilitas tampilan. */
export function PengalihDemo() {
  const { profil, daftar, demo, ganti } = useProfil();
  const { pathname } = useLocation();
  // Di editor, pengalih disembunyikan: mengganti profil di sini akan menimpa pratinjau draf.
  if (!demo || pathname === '/atur-tampilan') return null;
  return (
    <footer className="pengalih-demo">
      <div className="wadah lebar">
        <label>
          <span>Mode demo — lihat tampilan untuk</span>
          <select value={profil.id} onChange={(e) => ganti(e.target.value)}>
            {daftar.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nama}
                {p.fiktif ? ' (fiktif)' : ''}
              </option>
            ))}
          </select>
        </label>
        <p>
          Data lowongan sama untuk semua profil; yang berubah hanya merek, huruf, teks, dan gaya.{' '}
          <Link to="/atur-tampilan">Buat tampilan untuk perusahaan Anda</Link>
        </p>
      </div>
    </footer>
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
