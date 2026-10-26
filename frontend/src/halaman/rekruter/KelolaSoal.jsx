import { useId, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Isian } from '../../komponen/Isian.jsx';
import { Memuat, Pesan } from '../../komponen/umum.jsx';
import { OPSI_MAKS, OPSI_MIN, dariSoal, geser, hapusOpsi, keBodySoal, soalKosong, tambahOpsi } from '../../rekruter/formSoal.js';
import { useData } from '../../rekruter/useData.js';

export default function KelolaSoal() {
  const { lowonganId, tesId } = useParams();
  const { api } = useAuth();
  const lowongan = useData(`/lowongan/${lowonganId}`);
  const soal = useData(`/tes/${tesId}/soal`);
  const [sunting, setSunting] = useState(null); // null | 'baru' | id soal
  const [pratinjau, setPratinjau] = useState(null);
  const [pesan, setPesan] = useState(null);
  const [galat, setGalat] = useState(null);
  const [sibuk, setSibuk] = useState(false);

  const galatMuat = lowongan.galat ?? soal.galat;
  if (galatMuat) {
    return (
      <Pesan jenis="galat" judul={galatMuat.status === 404 ? 'Tes tidak ditemukan' : 'Bank soal gagal dimuat'}>
        <p>
          <Link to="/rekruter">Kembali ke daftar lowongan</Link>
        </p>
      </Pesan>
    );
  }
  if (!lowongan.data || !soal.data) return <Memuat teks="Memuat bank soal…" />;
  const tes = lowongan.data.tes.find((t) => t.id === tesId);
  if (!tes) return <Pesan jenis="galat" judul="Tes ini bukan bagian dari lowongan tersebut" />;
  const daftar = soal.data;
  const jumlahAktif = daftar.filter((s) => s.aktif).length;

  async function jalankan(aksi, berhasil) {
    setSibuk(true);
    setGalat(null);
    setPesan(null);
    try {
      await aksi();
      if (berhasil) setPesan(berhasil);
      return true;
    } catch (e) {
      setGalat(e.message);
      return false;
    } finally {
      // Selalu ambil ulang: setelah gagal, tampilan kembali ke data server (misalnya urutan yang digeser).
      soal.muatUlang();
      lowongan.muatUlang();
      setSibuk(false);
    }
  }

  const pindah = (i, arah) => {
    const baru = geser(daftar, i, arah);
    if (baru === daftar) return;
    soal.setData(baru); // tampil langsung; dikembalikan dari server jika gagal
    jalankan(() => api(`/tes/${tesId}/soal/urutan`, { method: 'PUT', body: { urutan: baru.map((s) => s.id) } }));
  };

  async function lihatPratinjau() {
    if (pratinjau) {
      setPratinjau(null);
      return;
    }
    try {
      const r = await api(`/tes/${tesId}/soal/pratinjau`);
      setPratinjau(r.data);
    } catch (e) {
      setGalat(e.message);
    }
  }

  return (
    <>
      <p className="remah">
        <Link to="/rekruter">Lowongan Anda</Link> / <Link to={`/rekruter/lowongan/${lowonganId}?tab=tes`}>{lowongan.data.posisi}</Link>
      </p>
      <div className="judul-halaman baris-judul">
        <div>
          <h1>Soal tes {tes.jenisTes}</h1>
          <p>
            {jumlahAktif} soal aktif{daftar.length > jumlahAktif ? `, ${daftar.length - jumlahAktif} nonaktif` : ''}. Pelamar melihat soal aktif dengan urutan pilihan jawaban diacak.
          </p>
        </div>
        <div className="aksi-judul">
          <button type="button" className="tombol kedua" onClick={lihatPratinjau} disabled={jumlahAktif === 0}>
            {pratinjau ? 'Tutup pratinjau' : 'Pratinjau seperti pelamar'}
          </button>
          {sunting !== 'baru' && (
            <button type="button" className="tombol" onClick={() => setSunting('baru')}>
              Tambah soal
            </button>
          )}
        </div>
      </div>

      {pesan && <Pesan jenis="sukses">{pesan}</Pesan>}
      {galat && <Pesan jenis="galat">{galat}</Pesan>}

      {pratinjau && (
        <section className="pratinjau-soal" aria-label="Pratinjau soal">
          <p className="bantuan">Pratinjau: tanpa kunci jawaban dan tanpa soal nonaktif. Urutan pilihan di sini belum diacak.</p>
          <ol>
            {pratinjau.map((s) => (
              <li key={s.id}>
                <p>{s.pertanyaan}</p>
                <ul>
                  {s.opsi.map((o) => (
                    <li key={o.id}>{o.teks}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </section>
      )}

      {sunting === 'baru' && (
        <FormSoal
          judul="Soal baru"
          awal={soalKosong()}
          sibuk={sibuk}
          batal={() => setSunting(null)}
          simpan={async (body) => {
            const ok = await jalankan(() => api(`/tes/${tesId}/soal`, { method: 'POST', body }), 'Soal ditambahkan di urutan terakhir.');
            if (ok) setSunting(null);
          }}
        />
      )}

      {daftar.length === 0 && sunting !== 'baru' && (
        <div className="kosong">
          <p>Belum ada soal. Tambahkan minimal satu soal aktif supaya lowongan bisa dibuka.</p>
        </div>
      )}

      <ol className="daftar-soal">
        {daftar.map((s, i) =>
          sunting === s.id ? (
            <li key={s.id}>
              <FormSoal
                judul={`Ubah soal ${i + 1}`}
                awal={dariSoal(s)}
                sibuk={sibuk}
                batal={() => setSunting(null)}
                simpan={async (body) => {
                  const ok = await jalankan(() => api(`/soal/${s.id}`, { method: 'PUT', body: { ...body, urutan: s.urutan } }), 'Soal disimpan.');
                  if (ok) setSunting(null);
                }}
              />
            </li>
          ) : (
            <li key={s.id} className={s.aktif ? 'kartu-soal' : 'kartu-soal nonaktif'}>
              <div className="kepala-soal">
                <span className="nomor-soal">{i + 1}</span>
                <p className="teks-soal">{s.pertanyaan}</p>
              </div>
              <ul className="opsi-soal">
                {s.opsi.map((o) => (
                  <li key={o.id} className={o.id === s.kunciOpsiId ? 'kunci' : undefined}>
                    {o.teks}
                    {o.id === s.kunciOpsiId && <span className="sr-only"> (jawaban benar)</span>}
                  </li>
                ))}
              </ul>
              <div className="kaki-soal">
                <span className="redup">
                  {s.poin} poin{!s.aktif ? ', nonaktif' : ''}
                  {s.terkunci ? ', sudah dijawab pelamar' : ''}
                </span>
                <div className="aksi-soal">
                  <button type="button" className="tombol-teks" onClick={() => pindah(i, -1)} disabled={sibuk || i === 0} aria-label={`Naikkan soal ${i + 1}`}>
                    Naik
                  </button>
                  <button type="button" className="tombol-teks" onClick={() => pindah(i, 1)} disabled={sibuk || i === daftar.length - 1} aria-label={`Turunkan soal ${i + 1}`}>
                    Turun
                  </button>
                  <button
                    type="button"
                    className="tombol-teks"
                    disabled={sibuk}
                    onClick={() => jalankan(() => api(`/soal/${s.id}/aktif`, { method: 'PATCH', body: { aktif: !s.aktif } }), s.aktif ? 'Soal dinonaktifkan.' : 'Soal diaktifkan.')}
                  >
                    {s.aktif ? 'Nonaktifkan' : 'Aktifkan'}
                  </button>
                  {s.terkunci ? (
                    <span className="label-kunci" title="Soal yang sudah dijawab tidak bisa diubah supaya skor pelamar tetap adil. Nonaktifkan lalu buat soal baru.">
                      Terkunci
                    </span>
                  ) : (
                    <>
                      <button type="button" className="tombol-teks" disabled={sibuk} onClick={() => setSunting(s.id)}>
                        Ubah
                      </button>
                      <button type="button" className="tombol-teks bahaya" disabled={sibuk} onClick={() => jalankan(() => api(`/soal/${s.id}`, { method: 'DELETE' }), 'Soal dihapus.')}>
                        Hapus
                      </button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ),
        )}
      </ol>
    </>
  );
}

function FormSoal({ judul, awal, simpan, batal, sibuk }) {
  const namaKunci = useId();
  const [isian, setIsian] = useState(awal);
  const [galat, setGalat] = useState({});

  return (
    <form
      className="form-soal"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const { galat: g, body } = keBodySoal(isian);
        setGalat(g);
        if (body) simpan(body);
      }}
    >
      <h2>{judul}</h2>
      <Isian label="Pertanyaan" galat={galat.pertanyaan}>
        {(p) => <textarea {...p} rows={3} maxLength={2000} value={isian.pertanyaan} onChange={(e) => setIsian({ ...isian, pertanyaan: e.target.value })} />}
      </Isian>
      <fieldset className="isian">
        <legend>Pilihan jawaban</legend>
        <span className="bantuan">Pilih tombol bulat di samping jawaban yang benar. {OPSI_MIN}–{OPSI_MAKS} pilihan.</span>
        {isian.opsi.map((o, i) => (
          <div className="baris-opsi" key={o.id}>
            <input
              type="radio"
              name={namaKunci}
              checked={isian.kunciOpsiId === o.id}
              onChange={() => setIsian({ ...isian, kunciOpsiId: o.id })}
              aria-label={`Pilihan ${i + 1} adalah jawaban benar`}
            />
            <input
              type="text"
              maxLength={500}
              value={o.teks}
              aria-label={`Pilihan ${i + 1}`}
              onChange={(e) => setIsian({ ...isian, opsi: isian.opsi.map((x) => (x.id === o.id ? { ...x, teks: e.target.value } : x)) })}
            />
            {isian.opsi.length > OPSI_MIN && (
              <button type="button" className="tombol-teks" onClick={() => setIsian(hapusOpsi(isian, o.id))} aria-label={`Hapus pilihan ${i + 1}`}>
                Hapus
              </button>
            )}
          </div>
        ))}
        {isian.opsi.length < OPSI_MAKS && (
          <button type="button" className="tombol-teks" onClick={() => setIsian(tambahOpsi(isian))}>
            Tambah pilihan
          </button>
        )}
        {galat.opsi && <span className="galat">{galat.opsi}</span>}
        {galat.kunciOpsiId && <span className="galat">{galat.kunciOpsiId}</span>}
      </fieldset>
      <Isian label="Poin" className="isian-pendek" galat={galat.poin}>
        {(p) => <input {...p} type="text" inputMode="decimal" value={isian.poin} onChange={(e) => setIsian({ ...isian, poin: e.target.value })} />}
      </Isian>
      <div className="aksi-form">
        <button type="submit" className="tombol" disabled={sibuk}>
          {sibuk ? 'Menyimpan…' : 'Simpan soal'}
        </button>
        <button type="button" className="tombol kedua" onClick={batal}>
          Batal
        </button>
      </div>
    </form>
  );
}
