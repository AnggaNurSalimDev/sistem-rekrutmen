import { createBrowserRouter, Link, Outlet, RouterProvider } from 'react-router-dom';
import { PenyediaAuth } from './auth/AuthContext.jsx';
import { Kepala, Pesan, Wajib } from './komponen/umum.jsx';
import Beranda from './halaman/Beranda.jsx';
import DetailLowongan from './halaman/DetailLowongan.jsx';
import { Masuk, Daftar } from './halaman/Auth.jsx';
import LamaranSaya from './halaman/LamaranSaya.jsx';
import Ujian from './halaman/Ujian.jsx';

function Kerangka() {
  return (
    <>
      <a href="#isi" className="sr-only">
        Lewati ke isi
      </a>
      <Kepala />
      <main id="isi">
        <div className="wadah">
          <Outlet />
        </div>
      </main>
    </>
  );
}

function DashboardRekruter() {
  return (
    <Pesan judul="Dashboard rekruter belum tersedia">
      <p>
        Halaman ini dibangun di tahap berikutnya. Untuk sementara, lowongan dan bank soal dikelola lewat API (lihat
        docs/API_CONTRACT.md).
      </p>
    </Pesan>
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
      { path: '/rekruter', element: <Wajib peran="rekruter"><DashboardRekruter /></Wajib> },
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
