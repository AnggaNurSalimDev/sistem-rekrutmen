import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { Memuat, Pesan } from '../komponen/umum.jsx';
import { useIntegritas } from '../ujian/useIntegritas.js';
import { acakBerbenih } from '../ujian/acak.js';
import { hentikanKamera, statusUntukDikirim } from '../ujian/kamera.js';

const LABEL_KAMERA = {
  menunggu: 'Kamera: menunggu izin',
  granted: 'Kamera aktif',
  denied: 'Kamera tidak diizinkan',
  hardware_not_found: 'Kamera tidak tersedia',
  not_supported: 'Kamera tidak didukung',
};

// Draf jawaban disimpan di sessionStorage supaya tidak hilang jika halaman dimuat ulang.
const draf = {
  kunci: (lamaranId, tesId) => `rekrut.jawaban.${lamaranId}.${tesId}`,
  ambil(k) {
    try {
      return JSON.parse(sessionStorage.getItem(k) ?? '{}') ?? {};
    } catch {
      return {};
    }
  },
  simpan(k, nilai) {
    try {
      sessionStorage.setItem(k, JSON.stringify(nilai));
    } catch {
      /* diabaikan */
    }
  },
  hapus(k) {
    try {
      sessionStorage.removeItem(k);
    } catch {
      /* diabaikan */
    }
  },
};

export default function Ujian() {
  const { lamaranId, tesId } = useParams();
  const { api } = useAuth();
  const navigate = useNavigate();
  const kunciDraf = draf.kunci(lamaranId, tesId);

  const [tahap, setTahap] = useState('memuat'); // memuat | siap | berlangsung | sudahDikirim | galat
  const [info, setInfo] = useState(null);
  const [sesi, setSesi] = useState(null);
  const [jawaban, setJawaban] = useState(() => draf.ambil(kunciDraf));
  const [galat, setGalat] = useState(null);
  const [konfirmasi, setKonfirmasi] = useState(false);
  const [mengirim, setMengirim] = useState(false);

  const integritas = useIntegritas(tahap === 'berlangsung', `rekrut.fokus.${lamaranId}.${tesId}`);

  useEffect(() => {
    let batal = false;
    api(`/lamaran/${lamaranId}`)
      .then((r) => {
        if (batal) return;
        const tes = r.data.tes.find((t) => t.id === tesId);
        if (!tes) throw Object.assign(new Error('Tes tidak ditemukan di lamaran ini.'), { status: 404 });
        setInfo({ lamaran: r.data, tes });
        setTahap(tes.status === 'selesai' ? 'sudahDikirim' : 'siap');
      })
      .catch((e) => {
        if (batal) return;
        setGalat(e.message);
        setTahap('galat');
      });
    return () => {
      batal = true;
    };
  }, [api, lamaranId, tesId]);

  async function mulai() {
    setGalat(null);
    try {
      const r = await api(`/lamaran/${lamaranId}/ujian/${tesId}/mulai`, { method: 'POST', body: {} });
      setSesi(r.data);
      setTahap('berlangsung');
      window.scrollTo?.(0, 0);
    } catch (e) {
      setGalat(e.message);
      if (e.status === 409 && /sudah dikirim/i.test(e.message)) setTahap('sudahDikirim');
    }
  }

  function pilih(soalId, opsiId) {
    setJawaban((j) => {
      const baru = { ...j, [soalId]: opsiId };
      draf.simpan(kunciDraf, baru);
      return baru;
    });
  }

  async function kirim() {
    setMengirim(true);
    setGalat(null);
    const ringkasan = integritas.selesaikan();
    const body = {
      jawaban: sesi.soal.map((s) => ({ soalId: s.id, opsiDipilih: jawaban[s.id] ?? null })),
      integritas: {
        statusKamera: statusUntukDikirim(integritas.kamera.status),
        episodeKeluarFokus: ringkasan.episode,
      },
    };
    try {
      await api(`/lamaran/${lamaranId}/ujian/${tesId}/kirim`, { method: 'POST', body });
      draf.hapus(kunciDraf);
      integritas.bersihkan();
      hentikanKamera(integritas.kamera.stream);
      navigate('/lamaran', { state: { tesTerkirim: sesi.jenisTes } });
    } catch (e) {
      if (e.status === 409 && /sudah dikirim/i.test(e.message)) {
        draf.hapus(kunciDraf);
        integritas.bersihkan();
        navigate('/lamaran', { state: { tesTerkirim: sesi.jenisTes } });
        return;
      }
      setGalat(`Jawaban belum terkirim. ${e.message}`);
      setMengirim(false);
    }
  }

  if (tahap === 'memuat') return <Memuat teks="Memuat tes…" />;
  if (tahap === 'galat') {
    return (
      <Pesan jenis="galat" judul="Tes tidak bisa dibuka">
        <p>{galat}</p>
        <p>
          <Link to="/lamaran">Kembali ke lamaran saya</Link>
        </p>
      </Pesan>
    );
  }
  if (tahap === 'sudahDikirim') {
    return (
      <Pesan jenis="sukses" judul="Tes ini sudah dikirim">
        <p>
          Jawaban tidak bisa diubah lagi. <Link to="/lamaran">Kembali ke lamaran saya</Link>
        </p>
      </Pesan>
    );
  }
  if (tahap === 'siap') {
    return (
      <SebelumMulai
        jenisTes={info.tes.jenisTes}
        posisi={info.lamaran.lowongan.posisi}
        lanjut={info.tes.status === 'berlangsung'}
        galat={galat}
        onMulai={mulai}
      />
    );
  }

  return (
    <SedangUjian
      lamaranId={lamaranId}
      sesi={sesi}
      jawaban={jawaban}
      onPilih={pilih}
      integritas={integritas}
      konfirmasi={konfirmasi}
      setKonfirmasi={setKonfirmasi}
      mengirim={mengirim}
      galat={galat}
      onKirim={kirim}
    />
  );
}

function SebelumMulai({ jenisTes, posisi, lanjut, galat, onMulai }) {
  return (
    <>
      <div className="judul-halaman">
        <h1 style={{ textTransform: 'capitalize' }}>Tes {jenisTes}</h1>
        <p>Untuk lamaran {posisi}.</p>
      </div>
      {galat && <Pesan jenis="galat">{galat}</Pesan>}
      <h2 style={{ marginBottom: 12 }}>Sebelum mulai</h2>
      <ul className="aturan">
        <li>Semua soal pilihan ganda. Soal yang tidak dijawab dihitung salah.</li>
        <li>Jawaban hanya bisa dikirim sekali dan tidak bisa diubah setelahnya.</li>
        <li>
          Halaman ini mencatat berapa kali dan berapa lama Anda meninggalkan halaman tes (pindah tab, pindah aplikasi,
          atau memuat ulang halaman). Catatan ini ditunjukkan ke perusahaan apa adanya, tanpa mengurangi nilai.
        </li>
        <li>
          Browser akan meminta izin kamera. Video hanya tampil di layar Anda, tidak direkam dan tidak dikirim. Tes tetap
          bisa dikerjakan tanpa kamera.
        </li>
        <li>Jika halaman tidak sengaja tertutup, buka lagi dari Lamaran saya. Jawaban yang sudah dipilih tetap tersimpan di perangkat ini.</li>
      </ul>
      <button type="button" className="tombol" onClick={onMulai}>
        {lanjut ? 'Lanjutkan tes' : 'Mulai tes'}
      </button>
    </>
  );
}

function SedangUjian({ lamaranId, sesi, jawaban, onPilih, integritas, konfirmasi, setKonfirmasi, mengirim, galat, onKirim }) {
  const video = useRef(null);
  const { stream, status } = integritas.kamera;

  useEffect(() => {
    if (video.current && stream) video.current.srcObject = stream;
  }, [stream]);

  const soal = useMemo(
    () => sesi.soal.map((s) => ({ ...s, opsi: acakBerbenih(s.opsi, `${lamaranId}:${s.id}`) })),
    [sesi.soal, lamaranId],
  );
  const terjawab = soal.filter((s) => jawaban[s.id]).length;
  const belum = soal.length - terjawab;

  return (
    <>
      <div className="bilah-ujian" role="region" aria-label="Status tes">
        <div className="wadah">
          <div>
          <strong>
            Terjawab {terjawab} dari {soal.length}
          </strong>
          <div className="indikator">
            <span className="item">
              <span className={`titik ${integritas.jumlahKeluar > 0 ? 'peringatan' : 'aktif'}`} aria-hidden="true" />
              Keluar halaman: {integritas.jumlahKeluar} kali
            </span>
            <span className="item">
              <span className={`titik ${status === 'granted' ? 'aktif' : ''}`} aria-hidden="true" />
              {LABEL_KAMERA[status] ?? 'Kamera'}
            </span>
          </div>
          </div>
          {stream && (
            <div className="pratinjau-kamera">
              <video ref={video} autoPlay muted playsInline aria-label="Pratinjau kamera Anda (tidak direkam)" />
            </div>
          )}
        </div>
        <div className="kemajuan" aria-hidden="true">
          <div style={{ width: `${(terjawab / soal.length) * 100}%` }} />
        </div>
      </div>

      <div className="judul-halaman" style={{ marginTop: 24 }}>
        <h1 style={{ textTransform: 'capitalize', fontSize: '2rem' }}>Tes {sesi.jenisTes}</h1>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setKonfirmasi(true);
        }}
      >
        {soal.map((s, i) => (
          <fieldset key={s.id} className="soal">
            <legend>
              <span className="nomor">
                Soal {i + 1} dari {soal.length}
              </span>
              <span className="pertanyaan">{s.pertanyaan}</span>
            </legend>
            {s.opsi.map((o) => (
              <label key={o.id} className="pilihan">
                <input type="radio" name={`soal-${s.id}`} value={o.id} checked={jawaban[s.id] === o.id} onChange={() => onPilih(s.id, o.id)} />
                {o.teks}
              </label>
            ))}
          </fieldset>
        ))}

        {galat && <Pesan jenis="galat">{galat}</Pesan>}

        {!konfirmasi ? (
          <button type="submit" className="tombol">
            Kirim jawaban
          </button>
        ) : (
          <div className="konfirmasi" role="alertdialog" aria-labelledby="judul-konfirmasi">
            <h3 id="judul-konfirmasi">Kirim jawaban sekarang?</h3>
            <p style={{ marginTop: 6 }}>
              {belum > 0 ? `${belum} soal belum dijawab dan akan dihitung salah. ` : 'Semua soal sudah dijawab. '}
              Jawaban tidak bisa diubah setelah dikirim.
            </p>
            <div className="aksi">
              <button type="button" className="tombol" onClick={onKirim} disabled={mengirim} autoFocus>
                {mengirim ? 'Mengirim…' : 'Ya, kirim jawaban'}
              </button>
              <button type="button" className="tombol kedua" onClick={() => setKonfirmasi(false)} disabled={mengirim}>
                Periksa lagi
              </button>
            </div>
          </div>
        )}
      </form>

    </>
  );
}
