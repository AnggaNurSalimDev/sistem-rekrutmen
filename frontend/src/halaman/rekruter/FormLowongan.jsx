import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Isian } from '../../komponen/Isian.jsx';
import { Memuat, Pesan } from '../../komponen/umum.jsx';
import { dariLowongan, formBaru, keBody, tesKosong, totalBobot } from '../../rekruter/formLowongan.js';
import { useData } from '../../rekruter/useData.js';

/** /rekruter/lowongan/baru dan /rekruter/lowongan/:id/ubah */
export default function FormLowongan() {
  const { id } = useParams();
  const { data, galat } = useData(id ? `/lowongan/${id}` : null);
  if (!id) return <IsiForm awal={formBaru()} />;
  if (galat) return <Pesan jenis="galat" judul="Lowongan gagal dimuat">{galat.message}</Pesan>;
  if (!data) return <Memuat />;
  return <IsiForm key={data.id} lowongan={data} awal={dariLowongan(data)} />;
}

function IsiForm({ lowongan = null, awal }) {
  const { api } = useAuth();
  const navigate = useNavigate();
  const [isian, setIsian] = useState(awal);
  const [galatField, setGalatField] = useState({});
  const [galat, setGalat] = useState(null);
  const [mengirim, setMengirim] = useState(false);

  // Konfigurasi tes hanya boleh diubah saat draf (aturan API). Di luar draf, bagian tes hanya dibaca.
  const tesBisaDiubah = !lowongan || lowongan.status === 'draf';
  const ubah = (kunci) => (e) => setIsian({ ...isian, [kunci]: e.target.value });
  const ubahTes = (i, kunci) => (e) => {
    setIsian({ ...isian, tes: isian.tes.map((t, j) => (j === i ? { ...t, [kunci]: e.target.value } : t)) });
    // Pesan jumlah bobot dihitung ulang saat menyimpan; jangan biarkan pesan lama menyesatkan.
    if (galatField.tes) setGalatField({ ...galatField, tes: undefined });
  };

  async function simpan(e) {
    e.preventDefault();
    const { galat: g, body } = keBody(isian, { sertakanTes: tesBisaDiubah });
    setGalatField(g);
    setGalat(null);
    if (!body) {
      setGalat('Periksa isian yang ditandai.');
      return;
    }
    setMengirim(true);
    try {
      const r = lowongan
        ? await api(`/lowongan/${lowongan.id}`, { method: 'PUT', body })
        : await api('/lowongan', { method: 'POST', body });
      navigate(`/rekruter/lowongan/${r.data.id}${lowongan ? '' : '?tab=tes'}`, { state: { pesan: lowongan ? 'Perubahan disimpan.' : 'Lowongan dibuat sebagai draf. Isi soal tiap tes, lalu buka lowongannya.' } });
    } catch (err) {
      setGalat(err.message);
      setGalatField(err.perField ?? {});
      setMengirim(false);
    }
  }

  const total = totalBobot(isian.tes);

  return (
    <form className="form-lowongan" onSubmit={simpan} noValidate>
      <div className="judul-halaman">
        <h1>{lowongan ? `Ubah ${lowongan.posisi}` : 'Lowongan baru'}</h1>
        <p>{lowongan ? 'Mengubah budget atau skill wajib akan menghitung ulang skor semua pelamar.' : 'Lowongan baru disimpan sebagai draf dan belum terlihat oleh pelamar.'}</p>
      </div>
      {galat && <Pesan jenis="galat">{galat}</Pesan>}

      <section className="bagian" aria-labelledby="judul-umum">
        <h2 id="judul-umum">Posisi</h2>
        <Isian label="Nama posisi" galat={galatField.posisi}>
          {(p) => <input {...p} type="text" maxLength={120} value={isian.posisi} onChange={ubah('posisi')} />}
        </Isian>
        <Isian label="Budget gaji maksimal per bulan" bantuan="Ekspektasi gaji sampai 15% di atas budget masih mendapat nilai sebagian." galat={galatField.budgetMaksimal}>
          {(p) => (
            <div className="awalan">
              <span aria-hidden="true">Rp</span>
              <input {...p} type="text" inputMode="numeric" value={isian.budgetMaksimal} onChange={ubah('budgetMaksimal')} />
            </div>
          )}
        </Isian>
        <Isian label="Jadwal kerja yang dibutuhkan" bantuan="Pelamar akan menjawab bisa sepenuhnya, sebagian, atau tidak." galat={galatField.kebutuhanWaktu}>
          {(p) => <input {...p} type="text" maxLength={300} value={isian.kebutuhanWaktu} onChange={ubah('kebutuhanWaktu')} />}
        </Isian>
      </section>

      <section className="bagian" aria-labelledby="judul-skill">
        <h2 id="judul-skill">Skill</h2>
        <Isian label="Skill wajib" bantuan="Pisahkan dengan koma. Dipakai untuk nilai CV." galat={galatField.skillWajib}>
          {(p) => <textarea {...p} rows={2} value={isian.skillWajib} onChange={ubah('skillWajib')} />}
        </Isian>
        <Isian label="Skill nilai tambah (opsional)" bantuan="Ditampilkan ke pelamar, tidak memengaruhi skor.">
          {(p) => <textarea {...p} rows={2} value={isian.skillOpsional} onChange={ubah('skillOpsional')} />}
        </Isian>
        <Isian
          label="Kata kunci yang disorot di CV (opsional)"
          bantuan='Pisahkan dengan koma, misalnya "SIM C, bersedia kerja shift". Disorot saat Anda membaca CV; tidak memengaruhi skor.'
          galat={galatField.kataKunciSorot}
        >
          {(p) => <textarea {...p} rows={2} value={isian.kataKunciSorot} onChange={ubah('kataKunciSorot')} />}
        </Isian>
      </section>

      <section className="bagian" aria-labelledby="judul-tes">
        <h2 id="judul-tes">Tes</h2>
        {!tesBisaDiubah && (
          <Pesan>
            <p>Tes tidak bisa diubah karena lowongan ini sudah {lowongan.status === 'buka' ? 'dibuka' : 'ditutup'}. Ubah status ke draf dulu (hanya bisa jika belum ada pelamar).</p>
          </Pesan>
        )}
        <p className="bantuan">Bobot dalam persen, jumlahnya harus 100%. Skor tes kandidat = target tercapai bernilai 100, di bawah batas bawah bernilai 0.</p>
        {galatField.tes && <p className="galat-blok" role="alert">{galatField.tes}</p>}
        <fieldset className="daftar-isian-tes" disabled={!tesBisaDiubah}>
          <legend className="sr-only">Daftar tes</legend>
          {isian.tes.map((t, i) => (
            <div className="isian-tes" key={t.id ?? `baru-${i}`}>
              <Isian label="Nama tes" galat={galatField[`tes.${i}.jenisTes`]}>
                {(p) => <input {...p} type="text" maxLength={60} value={t.jenisTes} onChange={ubahTes(i, 'jenisTes')} />}
              </Isian>
              <Isian label="Target" galat={galatField[`tes.${i}.targetSkor`]}>
                {(p) => <input {...p} type="number" min={0} max={100} value={t.targetSkor} onChange={ubahTes(i, 'targetSkor')} />}
              </Isian>
              <Isian label="Batas bawah" galat={galatField[`tes.${i}.batasBawah`]}>
                {(p) => <input {...p} type="number" min={0} max={100} value={t.batasBawah} onChange={ubahTes(i, 'batasBawah')} />}
              </Isian>
              <Isian label="Bobot %" galat={galatField[`tes.${i}.bobot`]}>
                {(p) => <input {...p} type="text" inputMode="decimal" value={t.bobot} onChange={ubahTes(i, 'bobot')} />}
              </Isian>
              {isian.tes.length > 1 && (
                <button
                  type="button"
                  className="tombol-teks hapus-tes"
                  onClick={() => setIsian({ ...isian, tes: isian.tes.filter((_, j) => j !== i) })}
                  aria-label={`Hapus tes ${t.jenisTes || i + 1}`}
                >
                  Hapus
                </button>
              )}
            </div>
          ))}
          <div className="kaki-tes">
            {isian.tes.length < 10 && (
              <button type="button" className="tombol kedua" onClick={() => setIsian({ ...isian, tes: [...isian.tes, tesKosong()] })}>
                Tambah tes
              </button>
            )}
            <span className={Math.abs(total - 100) > 0.1 ? 'total-bobot salah' : 'total-bobot'} aria-live="polite">
              Total bobot {String(total).replace('.', ',')}%
            </span>
          </div>
        </fieldset>
      </section>

      <div className="aksi-form">
        <button type="submit" className="tombol" disabled={mengirim}>
          {mengirim ? 'Menyimpan…' : lowongan ? 'Simpan perubahan' : 'Simpan sebagai draf'}
        </button>
        <Link to={lowongan ? `/rekruter/lowongan/${lowongan.id}` : '/rekruter'}>Batal</Link>
      </div>
    </form>
  );
}
