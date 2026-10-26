import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Memuat, Pesan } from '../../komponen/umum.jsx';
import { formatRupiah } from '../../rekruter/kandidat.js';
import { useData } from '../../rekruter/useData.js';
import { LABEL_STATUS_LOWONGAN } from './DaftarLowongan.jsx';
import TabelKandidat from './TabelKandidat.jsx';

const TAB = { kandidat: 'Kandidat', tes: 'Tes & soal', rincian: 'Rincian lowongan' };

/** Tombol perubahan status yang masuk akal dari status sekarang (aturan sama dengan API). */
function aksiStatus(l) {
  if (l.status === 'draf') return [{ ke: 'buka', teks: 'Buka lowongan', utama: true }];
  if (l.status === 'buka') return [{ ke: 'tutup', teks: 'Tutup lowongan' }, ...(l.jumlahPelamar === 0 ? [{ ke: 'draf', teks: 'Kembalikan ke draf' }] : [])];
  return [{ ke: 'buka', teks: 'Buka lagi', utama: true }, ...(l.jumlahPelamar === 0 ? [{ ke: 'draf', teks: 'Kembalikan ke draf' }] : [])];
}

export default function LowonganRekruter() {
  const { id } = useParams();
  const { api } = useAuth();
  const navigate = useNavigate();
  const lokasi = useLocation();
  const [cari, setCari] = useSearchParams();
  const tab = TAB[cari.get('tab')] ? cari.get('tab') : 'kandidat';
  const lowongan = useData(`/lowongan/${id}`);
  const kandidat = useData(tab === 'kandidat' ? `/lowongan/${id}/kandidat` : null);
  const [pesan, setPesan] = useState(lokasi.state?.pesan ?? null);
  const [galat, setGalat] = useState(null);
  const [sibuk, setSibuk] = useState(false);
  const [yakinHapus, setYakinHapus] = useState(false);

  if (lowongan.galat) {
    return (
      <Pesan jenis="galat" judul={lowongan.galat.status === 404 ? 'Lowongan tidak ditemukan' : 'Lowongan gagal dimuat'}>
        <p>
          <Link to="/rekruter">Kembali ke daftar lowongan</Link>
        </p>
      </Pesan>
    );
  }
  const l = lowongan.data;
  if (!l) return <Memuat teks="Memuat lowongan…" />;

  async function ubahStatus(ke) {
    setSibuk(true);
    setGalat(null);
    setPesan(null);
    try {
      const r = await api(`/lowongan/${l.id}/status`, { method: 'PATCH', body: { status: ke } });
      lowongan.setData(r.data);
      setPesan(`Status lowongan sekarang: ${LABEL_STATUS_LOWONGAN[r.data.status].toLowerCase()}.`);
    } catch (e) {
      setGalat(e.message);
    } finally {
      setSibuk(false);
    }
  }

  async function hapus() {
    setSibuk(true);
    try {
      await api(`/lowongan/${l.id}`, { method: 'DELETE' });
      navigate('/rekruter', { replace: true });
    } catch (e) {
      setGalat(e.message);
      setSibuk(false);
      setYakinHapus(false);
    }
  }

  return (
    <>
      <p className="remah">
        <Link to="/rekruter">Lowongan Anda</Link>
      </p>
      <div className="judul-halaman baris-judul">
        <div>
          <h1>{l.posisi}</h1>
          <p>
            <span className="status-lowongan" data-status={l.status}>
              {LABEL_STATUS_LOWONGAN[l.status]}
            </span>{' '}
            {l.jumlahPelamar} pelamar
          </p>
        </div>
        <div className="aksi-judul">
          {aksiStatus(l).map((a) => (
            <button key={a.ke} type="button" className={a.utama ? 'tombol' : 'tombol kedua'} disabled={sibuk} onClick={() => ubahStatus(a.ke)}>
              {a.teks}
            </button>
          ))}
        </div>
      </div>

      {pesan && <Pesan jenis="sukses">{pesan}</Pesan>}
      {galat && <Pesan jenis="galat">{galat}</Pesan>}

      <nav className="tab" aria-label="Bagian lowongan">
        {Object.entries(TAB).map(([kunci, nama]) => (
          <button key={kunci} type="button" aria-current={tab === kunci ? 'page' : undefined} onClick={() => setCari(kunci === 'kandidat' ? {} : { tab: kunci }, { replace: true })}>
            {nama}
          </button>
        ))}
      </nav>

      {tab === 'kandidat' &&
        (kandidat.galat ? (
          <Pesan jenis="galat" judul="Data kandidat gagal dimuat">{kandidat.galat.message}</Pesan>
        ) : !kandidat.data ? (
          <Memuat teks="Memuat kandidat…" />
        ) : (
          <TabelKandidat kandidat={kandidat.data} lowongan={l} />
        ))}

      {tab === 'tes' && (
        <section aria-label="Tes">
          {l.status === 'draf' && l.tes.some((t) => t.jumlahSoalAktif === 0) && (
            <Pesan>
              <p>Setiap tes perlu minimal satu soal aktif sebelum lowongan bisa dibuka.</p>
            </Pesan>
          )}
          <ul className="daftar-tes-rekruter">
            {l.tes.map((t) => (
              <li key={t.id}>
                <div>
                  <h2>{t.jenisTes}</h2>
                  <p className="redup">
                    Target {t.targetSkor}, batas bawah {t.batasBawah}, bobot {Math.round(t.bobot * 1000) / 10}%
                  </p>
                </div>
                <p className={t.jumlahSoalAktif === 0 ? 'jumlah-soal kurang' : 'jumlah-soal'}>
                  {t.jumlahSoalAktif} soal aktif{t.jumlahSoal > t.jumlahSoalAktif ? ` dari ${t.jumlahSoal}` : ''}
                </p>
                <Link className="tombol kedua" to={`/rekruter/lowongan/${l.id}/tes/${t.id}/soal`}>
                  Kelola soal
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === 'rincian' && (
        <section aria-label="Rincian lowongan" className="rincian-lowongan">
          <dl>
            <dt>Budget gaji maksimal</dt>
            <dd>{formatRupiah(l.budgetMaksimal)}</dd>
            <dt>Jadwal kerja</dt>
            <dd>{l.kebutuhanWaktu}</dd>
            <dt>Skill wajib</dt>
            <dd>{l.skillWajib.join(', ')}</dd>
            <dt>Skill nilai tambah</dt>
            <dd>{l.skillOpsional.length ? l.skillOpsional.join(', ') : '–'}</dd>
            <dt>Kata kunci sorot CV</dt>
            <dd>{l.kataKunciSorot.length ? l.kataKunciSorot.join(', ') : '–'}</dd>
          </dl>
          <div className="aksi-form">
            <Link className="tombol kedua" to={`/rekruter/lowongan/${l.id}/ubah`}>
              Ubah lowongan
            </Link>
            {l.status === 'draf' && l.jumlahPelamar === 0 && !yakinHapus && (
              <button type="button" className="tombol-teks bahaya" onClick={() => setYakinHapus(true)}>
                Hapus lowongan
              </button>
            )}
          </div>
          {yakinHapus && (
            <div className="konfirmasi" role="alertdialog" aria-labelledby="judul-hapus">
              <h2 id="judul-hapus">Hapus lowongan ini?</h2>
              <p>Semua tes dan soalnya ikut terhapus. Tindakan ini tidak bisa dibatalkan.</p>
              <div className="aksi">
                <button type="button" className="tombol bahaya" disabled={sibuk} onClick={hapus}>
                  Ya, hapus
                </button>
                <button type="button" className="tombol kedua" onClick={() => setYakinHapus(false)}>
                  Batal
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}
