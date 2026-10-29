import { createBrowserRouter, Link, Outlet, RouterProvider, useLocation } from 'react-router-dom';
import { PenyediaAuth } from './auth/AuthContext.jsx';
import { Kepala, PengalihDemo, Pesan, Wajib } from './komponen/umum.jsx';
import Beranda from './halaman/Beranda.jsx';
import DetailLowongan from './halaman/DetailLowongan.jsx';
import { Masuk, Daftar } from './halaman/Auth.jsx';
import LamaranSaya from './halaman/LamaranSaya.jsx';
import Ujian from './halaman/Ujian.jsx';
import DaftarLowongan from './halaman/rekruter/DaftarLowongan.jsx';
import FormLowongan from './halaman/rekruter/FormLowongan.jsx';
import LowonganRekruter from './halaman/rekruter/LowonganRekruter.jsx';
import KelolaSoal from './halaman/rekruter/KelolaSoal.jsx';
import DetailKandidat from './halaman/rekruter/DetailKandidat.jsx';
import AturTampilan from './halaman/AturTampilan.jsx';
import { MODE_DEMO } from './merek/ProfilContext.jsx';

function Kerangka() {
  // Halaman rekruter berisi tabel lebar; halaman pelamar tetap satu kolom sempit.
  const { pathname } = useLocation();
  const lebar = pathname.startsWith('/rekruter') || pathname === '/atur-tampilan';
  return (
    <>
      <a href="#isi" className="sr-only">
        Lewati ke isi
      </a>
      <Kepala lebar={lebar} />
      <main id="isi">
        <div className={lebar ? 'wadah lebar' : 'wadah'}>
          <Outlet />
        </div>
      </main>
      <PengalihDemo />
    </>
  );
}

function TidakDitemukan() {
  return (
    <Pesan jenis="galat" judul="Halaman tidak ditemukan">
      <p>
        <Link to="/">Kembali ke daftar lowongan</Link>
      </p>
    </Pesan>
  );
}

const router = createBrowserRouter([
  {
    element: <Kerangka />,
    children: [
      { path: '/', element: <Beranda /> },
      { path: '/lowongan/:id', element: <DetailLowongan /> },
      { path: '/masuk', element: <Masuk /> },
      { path: '/daftar', element: <Daftar /> },
      { path: '/lamaran', element: <Wajib peran="kandidat"><LamaranSaya /></Wajib> },
      { path: '/lamaran/:lamaranId/tes/:tesId', element: <Wajib peran="kandidat"><Ujian /></Wajib> },
      { path: '/rekruter', element: <Wajib peran="rekruter"><DaftarLowongan /></Wajib> },
      { path: '/rekruter/lowongan/baru', element: <Wajib peran="rekruter"><FormLowongan /></Wajib> },
      { path: '/rekruter/lowongan/:id', element: <Wajib peran="rekruter"><LowonganRekruter /></Wajib> },
      { path: '/rekruter/lowongan/:id/ubah', element: <Wajib peran="rekruter"><FormLowongan /></Wajib> },
      { path: '/rekruter/lowongan/:lowonganId/tes/:tesId/soal', element: <Wajib peran="rekruter"><KelolaSoal /></Wajib> },
      { path: '/rekruter/kandidat/:id', element: <Wajib peran="rekruter"><DetailKandidat /></Wajib> },
      // Editor tampilan hanya ada di demo portofolio; di situs klien profil terkunci.
      { path: '/atur-tampilan', element: MODE_DEMO ? <AturTampilan /> : <TidakDitemukan /> },
      { path: '*', element: <TidakDitemukan /> },
    ],
  },
]);

export default function App() {
  return (
    <PenyediaAuth>
      <RouterProvider router={router} />
    </PenyediaAuth>
  );
}
