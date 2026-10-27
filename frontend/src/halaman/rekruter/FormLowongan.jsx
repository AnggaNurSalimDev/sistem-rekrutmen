import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Isian } from '../../komponen/Isian.jsx';
import { Memuat, Pesan } from '../../komponen/umum.jsx';
import { dariLowongan, formBaru, keBody, tesKosong, totalBobot } from '../../rekruter/formLowongan.js';
import { useData } from '../../rekruter/useData.js';
import { angkaId, bagiRata, skorSatuTes } from '../../rekruter/rumus.js';
import { KOMPONEN } from '../../rekruter/kandidat.js';
import { angka } from '../../rekruter/formLowongan.js';

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
    setGalat(null);
  };

  // Tambah/hapus tes → bobot dibagi rata lagi (jumlah tetap tepat 100%). Rekruter bisa mengubahnya setelah itu.
  const aturTes = (daftar) => {
    const bobot = bagiRata(daftar.length);
    setIsian({ ...isian, tes: daftar.map((t, i) => ({ ...t, bobot: String(bobot[i]) })) });
    if (galatField.tes) setGalatField({ ...galatField, tes: undefined });
    setGalat(null);
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
        <p className="bantuan">
          Kalau ada lebih dari satu tes, bobot menentukan seberapa besar pengaruh tiap tes ke nilai Tes kandidat. Jumlahnya harus 100%. Satu tes saja otomatis 100%.
        </p>
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
                {(p) =>
                  isian.tes.length === 1 ? (
                    <input {...p} type="text" value="100" readOnly title="Hanya satu tes, jadi bobotnya selalu 100%" />
                  ) : (
                    <input {...p} type="text" inputMode="decimal" value={t.bobot} onChange={ubahTes(i, 'bobot')} />
                  )
                }
              </Isian>
              {isian.tes.length > 1 && (
                <button
                  type="button"
                  className="tombol-teks hapus-tes"
                  onClick={() => aturTes(isian.tes.filter((_, j) => j !== i))}
                  aria-label={`Hapus tes ${t.jenisTes || i + 1}`}
                >
                  Hapus
                </button>
              )}
            </div>
          ))}
          <div className="kaki-tes">
            <div className="aksi-judul">
              {isian.tes.length < 10 && (
                <button type="button" className="tombol kedua" onClick={() => aturTes([...isian.tes, tesKosong()])}>
                  Tambah tes
                </button>
              )}
              {isian.tes.length > 1 && (
                <button type="button" className="tombol-teks" onClick={() => aturTes(isian.tes)}>
                  Bagi bobot rata
                </button>
              )}
            </div>
            <span className={Math.abs(total - 100) > 0.1 ? 'total-bobot salah' : 'total-bobot'} aria-live="polite">
              Total bobot {String(total).replace('.', ',')}%
            </span>
          </div>
        </fieldset>
        <CaraHitung tes={isian.tes} />
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

/** Rumus skor dengan angka dari form, supaya rekruter tahu persis efek pengaturannya. */
function CaraHitung({ tes }) {
  const satu = tes.length === 1;
  return (
    <div className="cara-hitung" aria-live="polite">
      <h3>Cara skor dihitung</h3>
      <ol>
        <li>
          <b>Skor tiap tes (0–100).</b> Nilai sama atau di bawah batas bawah = 0, sama atau di atas target = 100. Di antaranya naik
          rata: (nilai − batas bawah) ÷ (target − batas bawah) × 100.
          <ul>
            {tes.map((t, i) => {
              const target = angka(t.targetSkor);
              const bawah = angka(t.batasBawah);
              const contoh = Math.round((target + bawah) / 2);
              const skor = skorSatuTes(contoh, target, bawah);
              return (
                <li key={t.id ?? i}>
                  {t.jenisTes || `Tes ${i + 1}`}:{' '}
                  {skor === null
                    ? 'isi target dan batas bawah (target harus lebih besar).'
                    : `nilai ${contoh} → (${contoh} − ${bawah}) ÷ (${target} − ${bawah}) × 100 = ${angkaId(skor)}`}
                </li>
              );
            })}
          </ul>
        </li>
        <li>
          <b>Nilai Tes kandidat</b> ={' '}
          {satu
            ? `skor ${tes[0].jenisTes || 'tes'} (satu-satunya tes, bobot 100%).`
            : tes.map((t, i) => `${t.jenisTes || `Tes ${i + 1}`} × ${String(t.bobot || 0).replace('.', ',')}%`).join(' + ')}
        </li>
        <li>
          <b>Skor akhir</b> = {KOMPONEN.map((k) => `${k.nama} × ${k.bobot}%`).join(' + ')}. Lima bobot ini tetap untuk semua lowongan
          supaya skor antarlowongan bisa dibandingkan.
        </li>
      </ol>
    </div>
  );
}
