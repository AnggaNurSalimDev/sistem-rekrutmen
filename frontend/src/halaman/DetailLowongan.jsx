import { useEffect, useId, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { panggil } from '../api/klien.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Memuat, Pesan } from '../komponen/umum.jsx';

const UKURAN_CV_MAKS = 10 * 1024 * 1024;

export default function DetailLowongan() {
  const { id } = useParams();
  const { user } = useAuth();
  const [lowongan, setLowongan] = useState(null);
  const [galat, setGalat] = useState(null);
  const [aiAktif, setAiAktif] = useState(false);

  useEffect(() => {
    let batal = false;
    panggil(`/lowongan-terbuka/${id}`)
      .then((r) => !batal && setLowongan(r.data))
      .catch((e) => !batal && setGalat(e.status === 404 ? 'Lowongan tidak ditemukan atau sudah ditutup.' : e.message));
    panggil('/health')
      .then((r) => !batal && setAiAktif(Boolean(r.fitur?.parserAi)))
      .catch(() => {});
    return () => {
      batal = true;
    };
  }, [id]);

  if (galat) {
    return (
      <Pesan jenis="galat" judul={galat}>
        <p>
          <Link to="/">Lihat lowongan lain</Link>
        </p>
      </Pesan>
    );
  }
  if (!lowongan) return <Memuat teks="Memuat lowongan…" />;

  const totalSoal = lowongan.tes.reduce((t, x) => t + x.jumlahSoal, 0);

  return (
    <article className="ringkas-lowongan">
      <div className="judul-halaman">
        <h1>{lowongan.posisi}</h1>
        <p>{lowongan.kebutuhanWaktu}</p>
      </div>

      <section className="bagian" aria-labelledby="judul-skill">
        <h2 id="judul-skill">Yang dicari</h2>
        <ul className="daftar-skill">
          {lowongan.skillWajib.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        {lowongan.skillOpsional.length > 0 && (
          <>
            <p className="bantuan" style={{ marginTop: 12 }}>
              Nilai tambah:
            </p>
            <ul className="daftar-skill opsional">
              {lowongan.skillOpsional.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="bagian" aria-labelledby="judul-tes">
        <h2 id="judul-tes">Tes setelah melamar</h2>
        <p>
          {lowongan.tes.length} tes pilihan ganda, total {totalSoal} soal. Tes dikerjakan dari halaman Lamaran saya
          setelah CV dikirim.
        </p>
        <dl>
          {lowongan.tes.map((t) => (
            <div key={t.id} style={{ display: 'contents' }}>
              <dt style={{ textTransform: 'capitalize' }}>{t.jenisTes}</dt>
              <dd>{t.jumlahSoal} soal</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="bagian" aria-labelledby="judul-lamar">
        <h2 id="judul-lamar">Kirim lamaran</h2>
        {!user && (
          <Pesan judul="Masuk sebagai pelamar untuk melamar">
            <p>
              <Link to={`/masuk?ke=/lowongan/${lowongan.id}`}>Masuk</Link> atau{' '}
              <Link to={`/daftar?ke=/lowongan/${lowongan.id}`}>buat akun</Link>. Hanya butuh email dan password.
            </p>
          </Pesan>
        )}
        {user?.role === 'rekruter' && <Pesan>Akun rekruter tidak bisa melamar. Masuk dengan akun pelamar.</Pesan>}
        {user?.role === 'kandidat' && <FormLamaran lowongan={lowongan} namaAwal={user.nama} aiAktif={aiAktif} />}
      </section>
    </article>
  );
}

function FormLamaran({ lowongan, namaAwal, aiAktif }) {
  const { api } = useAuth();
  const navigate = useNavigate();
  const idUnik = useId();
  const [isian, setIsian] = useState({ nama: namaAwal ?? '', nomorKontak: '', ekspektasiGaji: '', ketersediaanWaktu: '' });
  const [cv, setCv] = useState(null);
  const [setuju, setSetuju] = useState(false);
  const [galatField, setGalatField] = useState({});
  const [galatUmum, setGalatUmum] = useState(null);
  const [mengirim, setMengirim] = useState(false);

  const ubah = (k) => (e) => setIsian((s) => ({ ...s, [k]: e.target.value }));

  function periksa() {
    const g = {};
    if (!isian.nama.trim()) g.nama = 'Isi nama lengkap.';
    if (!/^[0-9+\-\s()]{8,20}$/.test(isian.nomorKontak.trim())) g.nomorKontak = 'Isi nomor HP/WA, 8–20 angka.';
    if (isian.ekspektasiGaji === '' || !Number.isInteger(Number(isian.ekspektasiGaji)) || Number(isian.ekspektasiGaji) < 0) {
      g.ekspektasiGaji = 'Isi angka tanpa titik, contoh 4500000.';
    }
    if (!isian.ketersediaanWaktu) g.ketersediaanWaktu = 'Pilih salah satu.';
    if (!cv) g.cv = 'Pilih berkas CV dalam format PDF.';
    else if (cv.type !== 'application/pdf' && !cv.name.toLowerCase().endsWith('.pdf')) g.cv = 'CV harus berformat PDF.';
    else if (cv.size > UKURAN_CV_MAKS) g.cv = 'Ukuran CV maksimal 10 MB.';
    if (!setuju) g.persetujuanData = 'Centang persetujuan untuk melanjutkan.';
    return g;
  }

  async function kirim(e) {
    e.preventDefault();
    const g = periksa();
    setGalatField(g);
    setGalatUmum(null);
    if (Object.keys(g).length > 0) return;

    const form = new FormData();
    form.set('lowonganId', lowongan.id);
    form.set('nama', isian.nama.trim());
    form.set('nomorKontak', isian.nomorKontak.trim());
    form.set('ekspektasiGaji', String(Number(isian.ekspektasiGaji)));
    form.set('ketersediaanWaktu', isian.ketersediaanWaktu);
    form.set('persetujuanData', 'true');
    form.set('cv', cv);

    setMengirim(true);
    try {
      const r = await api('/lamaran', { method: 'POST', form });
      navigate('/lamaran', { state: { lamaranBaru: r.data.id } });
    } catch (err) {
      setGalatField(err.perField ?? {});
      setGalatUmum(err.status === 409 ? err.message : `Lamaran belum terkirim. ${err.message}`);
      setMengirim(false);
    }
  }

  const f = (nama) => ({
    id: `${idUnik}-${nama}`,
    'aria-invalid': galatField[nama] ? 'true' : undefined,
    'aria-describedby': galatField[nama] ? `${idUnik}-${nama}-galat` : undefined,
  });
  const galat = (nama) =>
    galatField[nama] ? (
      <span className="galat" id={`${idUnik}-${nama}-galat`}>
        {galatField[nama]}
      </span>
    ) : null;

  return (
    <form onSubmit={kirim} noValidate>
      {galatUmum && <Pesan jenis="galat">{galatUmum}</Pesan>}

      <div className="isian">
        <label htmlFor={`${idUnik}-nama`}>Nama lengkap</label>
        <input type="text" autoComplete="name" value={isian.nama} onChange={ubah('nama')} {...f('nama')} />
        {galat('nama')}
      </div>

      <div className="isian">
        <label htmlFor={`${idUnik}-nomorKontak`}>Nomor HP / WhatsApp</label>
        <input type="tel" autoComplete="tel" inputMode="tel" value={isian.nomorKontak} onChange={ubah('nomorKontak')} {...f('nomorKontak')} />
        {galat('nomorKontak')}
      </div>

      <div className="isian">
        <label htmlFor={`${idUnik}-ekspektasiGaji`}>Gaji yang diharapkan per bulan</label>
        <div className="awalan">
          <span aria-hidden="true">Rp</span>
          <input type="number" inputMode="numeric" min="0" step="1" value={isian.ekspektasiGaji} onChange={ubah('ekspektasiGaji')} {...f('ekspektasiGaji')} />
        </div>
        {galat('ekspektasiGaji')}
      </div>

      <fieldset className="isian" aria-describedby={galatField.ketersediaanWaktu ? `${idUnik}-ketersediaanWaktu-galat` : undefined}>
        <legend>Apakah Anda bisa memenuhi jadwal ini: {lowongan.kebutuhanWaktu}?</legend>
        {[
          ['penuh', 'Bisa sepenuhnya'],
          ['sebagian', 'Bisa sebagian'],
          ['tidak', 'Tidak bisa'],
        ].map(([nilai, teks]) => (
          <label key={nilai} className="pilihan">
            <input type="radio" name="ketersediaanWaktu" value={nilai} checked={isian.ketersediaanWaktu === nilai} onChange={ubah('ketersediaanWaktu')} />
            {teks}
          </label>
        ))}
        {galat('ketersediaanWaktu')}
      </fieldset>

      <div className="isian">
        <label htmlFor={`${idUnik}-cv`}>CV (PDF, maksimal 10 MB)</label>
        <div className="unggah">
          <input type="file" accept="application/pdf,.pdf" onChange={(e) => setCv(e.target.files?.[0] ?? null)} {...f('cv')} />
          {cv && (
            <span className="bantuan">
              {cv.name} ({(cv.size / 1024 / 1024).toFixed(1)} MB)
            </span>
          )}
        </div>
        {galat('cv')}
      </div>

      <div className="isian">
        <label className="pilihan">
          <input type="checkbox" checked={setuju} onChange={(e) => setSetuju(e.target.checked)} {...f('persetujuanData')} />
          <span>
            Saya setuju CV dan data kontak saya diproses untuk seleksi lowongan ini
            {aiAktif && ', termasuk dibaca oleh layanan AI pihak ketiga (Anthropic) untuk merangkum isi CV'}. Selama tes,
            halaman mencatat berapa kali saya meninggalkan halaman dan meminta akses kamera; video tidak direkam.
          </span>
        </label>
        {galat('persetujuanData')}
      </div>

      <button type="submit" className="tombol" disabled={mengirim}>
        {mengirim ? 'Mengirim lamaran…' : 'Kirim lamaran'}
      </button>
      {mengirim && aiAktif && (
        <p className="bantuan" role="status" style={{ marginTop: 8 }}>
          CV sedang dibaca. Biasanya beberapa detik.
        </p>
      )}
    </form>
  );
}
