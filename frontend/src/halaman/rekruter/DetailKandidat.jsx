import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Memuat, Pesan, formatTanggal } from '../../komponen/umum.jsx';
import {
  KOMPONEN,
  LABEL_FLAG,
  LABEL_KAMERA,
  LABEL_STATUS,
  LABEL_WAKTU,
  formatDurasi,
  formatRupiah,
  perluVerifikasi,
  urutkan,
} from '../../rekruter/kandidat.js';
import { useData } from '../../rekruter/useData.js';
import BacaCv from './BacaCv.jsx';
import { angkaId as angka1, rincianKomponenTes, rincianSkorAkhir } from '../../rekruter/rumus.js';
import KoreksiCv from './KoreksiCv.jsx';

const NAMA_STATUS_CV = {
  menunggu: 'Belum dibaca otomatis (fitur AI tidak aktif)',
  berhasil: 'Terbaca otomatis',
  perlu_tinjau: 'Terbaca otomatis, ada yang perlu dicek',
  gagal: 'Tidak terbaca otomatis',
};

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
/** "2022-01" → "Jan 2022" */
function formatBulan(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(ym ?? '');
  return m ? `${BULAN[Number(m[2]) - 1] ?? m[2]} ${m[1]}` : ym;
}

function angkaId(n) {
  return Number.isFinite(n) ? n.toLocaleString('id-ID', { maximumFractionDigits: 1 }) : '–';
}

export default function DetailKandidat() {
  const { id } = useParams();
  const { api } = useAuth();
  const kandidat = useData(`/kandidat/${id}`);
  const lowonganId = kandidat.data?.lowongan?.id;
  const rekan = useData(lowonganId ? `/lowongan/${lowonganId}/kandidat` : null);
  const [pesan, setPesan] = useState(null);
  const [galat, setGalat] = useState(null);
  const [sibuk, setSibuk] = useState(false);
  const [koreksi, setKoreksi] = useState(false);

  if (kandidat.galat) {
    return (
      <Pesan jenis="galat" judul={kandidat.galat.status === 404 ? 'Kandidat tidak ditemukan' : 'Data kandidat gagal dimuat'}>
        <p>
          <Link to="/rekruter">Kembali ke daftar lowongan</Link>
        </p>
      </Pesan>
    );
  }
  const k = kandidat.data;
  if (!k) return <Memuat teks="Memuat kandidat…" />;

  // Kandidat berikutnya yang CV-nya belum dicek, urut skor tertinggi dulu (antrean verifikasi).
  const berikutnya = rekan.data ? urutkan(rekan.data.filter((x) => x.id !== k.id && perluVerifikasi(x)), 'skor', 'turun')[0] : null;

  async function jalankan(aksi, berhasil) {
    setSibuk(true);
    setGalat(null);
    setPesan(null);
    try {
      await aksi();
      // Ambil data terbaru dulu, baru tampilkan pesan, supaya pesan dan skor di layar selalu cocok.
      const baru = await api(`/kandidat/${k.id}`);
      kandidat.setData(baru.data);
      setPesan(berhasil);
      rekan.muatUlang();
      return true;
    } catch (e) {
      setGalat(e.message);
      return false;
    } finally {
      setSibuk(false);
    }
  }

  const putuskan = (keputusan) =>
    jalankan(
      () => api(`/kandidat/${k.id}/status`, { method: 'PATCH', body: { keputusan } }),
      keputusan === null ? 'Keputusan dibatalkan.' : `Kandidat ditandai ${keputusan}.`,
    );

  const cv = k.cv;
  const bisaKonfirmasi = cv && !cv.terverifikasi && ['berhasil', 'perlu_tinjau'].includes(cv.statusEkstraksi);
  const detail = k.rincianSkor?.detail ?? {};
  // Scoring engine mencocokkan skill dalam huruf kecil; tampilkan dengan ejaan lowongan.
  const ejaan = Object.fromEntries(k.lowongan.skillWajib.map((s) => [s.toLowerCase(), s]));
  const eja = (daftar) => daftar.map((s) => ejaan[s.toLowerCase()] ?? s).join(', ');
  const sudahDiputuskan = ['diterima', 'ditolak'].includes(k.statusAplikasi);

  return (
    <>
      <p className="remah">
        <Link to="/rekruter">Lowongan Anda</Link> / <Link to={`/rekruter/lowongan/${k.lowongan.id}`}>{k.lowongan.posisi}</Link>
      </p>
      <div className="judul-halaman baris-judul">
        <div>
          <h1>{k.nama}</h1>
          <p>
            {k.email}, {k.nomorKontak}. Melamar {formatTanggal(k.dikirimPada)}.
          </p>
        </div>
        <div className="aksi-judul">
          <span className="status-kandidat" data-status={k.statusAplikasi}>
            {LABEL_STATUS[k.statusAplikasi] ?? k.statusAplikasi}
          </span>
          {sudahDiputuskan ? (
            <button type="button" className="tombol kedua" disabled={sibuk} onClick={() => putuskan(null)}>
              Batalkan keputusan
            </button>
          ) : (
            <>
              <button type="button" className="tombol" disabled={sibuk} onClick={() => putuskan('diterima')}>
                Terima
              </button>
              <button type="button" className="tombol kedua" disabled={sibuk} onClick={() => putuskan('ditolak')}>
                Tolak
              </button>
            </>
          )}
        </div>
      </div>

      {pesan && (
        <Pesan jenis="sukses">
          <p>{pesan}</p>
          {berikutnya && perluVerifikasi(k) === false && (
            <p>
              <Link to={`/rekruter/kandidat/${berikutnya.id}`}>Lanjut ke CV berikutnya yang belum dicek: {berikutnya.nama}</Link>
            </p>
          )}
        </Pesan>
      )}
      {galat && <Pesan jenis="galat">{galat}</Pesan>}

      <div className="tata-detail">
        <section className="bagian kartu-skor" aria-labelledby="judul-skor">
          <h2 id="judul-skor">Skor</h2>
          <p className="skor-besar">
            {k.skorAkhir === null ? <span className="skor-kosong">Belum lengkap</span> : <b>{angkaId(k.skorAkhir)}</b>}
            {k.skor?.sementara && k.skorAkhir !== null && <span className="stempel">Sementara</span>}
          </p>
          {k.skor?.sementara && <p className="bantuan">Dihitung dari hasil baca CV otomatis yang belum dicek HR.</p>}
          {k.rincianSkor?.dataKurang?.length > 0 && (
            <p className="bantuan">
              Menunggu: {k.rincianSkor.dataKurang.map((d) => (d === 'cv' ? 'data CV' : 'semua tes dikirim')).join(' dan ')}.
            </p>
          )}
          <table className="tabel-komponen">
            <thead>
              <tr>
                <th scope="col">Komponen</th>
                <th scope="col" className="angka">
                  Bobot
                </th>
                <th scope="col" className="angka">
                  Nilai
                </th>
              </tr>
            </thead>
            <tbody>
              {KOMPONEN.map((c) => (
                <tr key={c.kunci}>
                  <th scope="row">{c.nama}</th>
                  <td className="angka">{c.bobot}%</td>
                  <td className="angka">{angkaId(k.skor?.komponen?.[c.kunci])}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <RumusSkor k={k} />
          <ul className="rincian-komponen">
            {detail.cv && (
              <li>
                Skill wajib ditemukan: {detail.cv.ditemukan.length ? eja(detail.cv.ditemukan) : 'tidak ada'}
                {detail.cv.tidakDitemukan.length > 0 && <>. Tidak ditemukan: {eja(detail.cv.tidakDitemukan)}</>}.
              </li>
            )}
            {detail.tenure && (
              <li>
                {detail.tenure.jumlahPerusahaan} tempat kerja, total {detail.tenure.totalBulan} bulan
                {detail.tenure.rataRataBulan !== null && detail.tenure.rataRataBulan !== undefined ? `, rata-rata ${angkaId(detail.tenure.rataRataBulan)} bulan per tempat` : ''}.
              </li>
            )}
            <li>
              Ekspektasi gaji {formatRupiah(k.ekspektasiGaji)}, budget {formatRupiah(k.lowongan.budgetMaksimal)}.
            </li>
            <li>
              Jadwal "{k.lowongan.kebutuhanWaktu}": {LABEL_WAKTU[k.ketersediaanWaktu] ?? k.ketersediaanWaktu}.
            </li>
          </ul>
          {k.skor?.flags?.length > 0 && (
            <ul className="daftar-flag" aria-label="Catatan skor">
              {k.skor.flags.map((f) => (
                <li key={f}>{LABEL_FLAG[f] ?? f}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="bagian kartu-integritas" aria-labelledby="judul-integritas">
          <h2 id="judul-integritas">Selama tes</h2>
          {!k.integritasLengkap ? (
            <p className="redup">Belum ada tes yang dikirim.</p>
          ) : (
            <>
              <dl className="ringkas">
                <dt>Kamera</dt>
                <dd>{LABEL_KAMERA[k.integritasLengkap.statusKamera] ?? k.integritasLengkap.statusKamera}</dd>
                <dt>Keluar halaman</dt>
                <dd>
                  {k.integritasLengkap.jumlahKeluarFokus} kali, total {formatDurasi(k.integritasLengkap.totalDetikKeluarFokus)}
                </dd>
              </dl>
              <LogIntegritas log={k.integritasLengkap.log} tes={k.tes} />
              <p className="bantuan">Dicatat oleh browser pelamar, jadi hanya petunjuk. Pindah tab sebentar bisa karena notifikasi atau telepon masuk.</p>
            </>
          )}
        </section>
      </div>

      <section className="bagian" aria-labelledby="judul-cv">
        <div className="baris-judul">
          <h2 id="judul-cv">CV</h2>
          {cv?.urlPdf && (
            <a href={cv.urlPdf} target="_blank" rel="noreferrer noopener">
              Buka PDF asli
            </a>
          )}
        </div>
        {!cv ? (
          <p>Kandidat ini tidak punya data CV.</p>
        ) : (
          <>
            <p className="status-cv">
              {cv.terverifikasi ? (
                <>
                  <strong>Sudah dicek HR</strong>
                  {cv.sumber === 'manual' ? ' (data diisi atau dikoreksi HR)' : ''}
                  {cv.diverifikasiPada ? `, ${formatTanggal(cv.diverifikasiPada)}` : ''}.
                </>
              ) : (
                <>
                  <strong>{NAMA_STATUS_CV[cv.statusEkstraksi] ?? cv.statusEkstraksi}.</strong> Belum dicek HR.
                </>
              )}
            </p>
            {cv.sumber === 'contoh' && (
              <p className="catatan-contoh">
                Data demo: hasil baca CV ini contoh yang ditulis tangan, bukan hasil AI sungguhan. Sorotan dan skornya tetap dihitung oleh
                sistem yang sama.
              </p>
            )}
            {!cv.terverifikasi && cv.alasanTinjau?.length > 0 && (
              <ul className="daftar-flag">
                {cv.alasanTinjau.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            )}

            <div className="data-cv">
              <div>
                <h3>Skill</h3>
                <p>{cv.skills?.length ? cv.skills.join(', ') : <span className="redup">Belum ada</span>}</p>
              </div>
              <div>
                <h3>Riwayat kerja</h3>
                {cv.riwayatKerja?.length ? (
                  <ul className="riwayat">
                    {cv.riwayatKerja.map((r, i) => (
                      <li key={`${r.perusahaan}-${i}`}>
                        <b>{r.perusahaan}</b>
                        {r.jabatan ? `, ${r.jabatan}` : ''}{' '}
                        <span className="redup">
                          {r.mulai ? `${formatBulan(r.mulai)} sampai ${r.selesai ? formatBulan(r.selesai) : 'sekarang'}` : 'tanggal tidak disebut'}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="redup">Tidak ada riwayat kerja (dinilai netral).</p>
                )}
              </div>
            </div>

            {!koreksi && (
              <div className="aksi-form">
                {bisaKonfirmasi && (
                  <button
                    type="button"
                    className="tombol"
                    disabled={sibuk}
                    onClick={() => jalankan(() => api(`/kandidat/${k.id}/cv/konfirmasi`, { method: 'POST' }), 'Data CV dikonfirmasi. Label sementara hilang dan skor dihitung ulang.')}
                  >
                    Data CV sudah benar
                  </button>
                )}
                <button type="button" className={bisaKonfirmasi ? 'tombol kedua' : 'tombol'} onClick={() => setKoreksi(true)}>
                  {cv.statusEkstraksi === 'gagal' || cv.statusEkstraksi === 'menunggu' ? 'Isi data CV manual' : 'Koreksi data CV'}
                </button>
              </div>
            )}
            {koreksi && (
              <KoreksiCv
                cv={cv}
                skillWajib={k.lowongan.skillWajib}
                sibuk={sibuk}
                batal={() => setKoreksi(false)}
                simpan={async (body) => {
                  const ok = await jalankan(() => api(`/kandidat/${k.id}/cv`, { method: 'PUT', body }), 'Data CV disimpan. Skor dihitung ulang dari data Anda.');
                  if (ok) setKoreksi(false);
                }}
              />
            )}

            {cv.teks ? (
              <BacaCv teks={cv.teks} sorotan={cv.sorotan ?? []} kataKunciLowongan={k.lowongan.kataKunciSorot ?? []} />
            ) : (
              <p className="redup">Teks CV tidak bisa diambil dari PDF (kemungkinan hasil scan). Buka PDF asli untuk membacanya.</p>
            )}
          </>
        )}
      </section>

      <section className="bagian" aria-labelledby="judul-tes">
        <h2 id="judul-tes">Jawaban tes</h2>
        {k.tes.map((t) => (
          <details key={t.id} className="hasil-tes">
            <summary>
              <span className="nama-tes">{t.jenisTes}</span>
              <span>
                {t.hasil
                  ? `Skor ${angkaId(t.hasil.skor)} (target ${t.targetSkor}), ${formatDurasi(t.hasil.durasiDetik)}`
                  : 'Belum dikirim'}
              </span>
            </summary>
            {t.hasil && (
              <ol className="jawaban">
                {t.jawaban.map((j) => (
                  <li key={j.soalId} className={j.benar ? 'benar' : 'salah'}>
                    <p>{j.pertanyaan}</p>
                    <p>
                      <span className="tanda">{j.benar ? 'Benar' : 'Salah'}</span>{' '}
                      {j.opsiDipilih === null ? 'Tidak dijawab' : `Dijawab: ${j.opsi.find((o) => o.id === j.opsiDipilih)?.teks ?? j.opsiDipilih}`}
                      {!j.benar && `. Kunci: ${j.opsi.find((o) => o.id === j.kunciOpsiId)?.teks ?? j.kunciOpsiId}`}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </details>
        ))}
      </section>
    </>
  );
}

function LogIntegritas({ log, tes }) {
  if (!Array.isArray(log) || log.length === 0) return null;
  const nama = Object.fromEntries(tes.map((t) => [t.id, t.jenisTes]));
  const teks = (e) => {
    if (e.jenis === 'kamera') return `Kamera: ${LABEL_KAMERA[e.statusKamera] ?? e.statusKamera}`;
    if (e.jenis === 'keluar_fokus') return `Keluar halaman ${formatDurasi(e.detik)}`;
    if (e.jenis === 'dibuka_ulang') return `Halaman tes dibuka ulang ${e.jumlah}×`;
    if (e.jenis === 'dipotong') return `Durasi keluar halaman yang dilaporkan (${e.dilaporkan} dtk) melebihi lama tes, dipotong ke ${e.durasi} dtk`;
    return e.jenis;
  };
  return (
    <details className="log-integritas">
      <summary>Catatan per tes ({log.length})</summary>
      <ul>
        {log.map((e, i) => (
          <li key={i}>
            <span className="redup">{nama[e.tesId] ?? 'Tes'}:</span> {teks(e)}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Perhitungan skor dengan angka kandidat ini, supaya HR bisa memeriksa sendiri. */
function RumusSkor({ k }) {
  const tes = rincianKomponenTes(k.rincianSkor?.detail?.tes?.rincian);
  const akhir = rincianSkorAkhir(k.skor?.komponen);
  if (!tes && !akhir) return null;
  const konfigurasi = Object.fromEntries(k.tes.map((t) => [t.jenisTes, t]));
  return (
    <details className="rumus-skor">
      <summary>Lihat perhitungannya</summary>
      {tes && (
        <>
          <p className="judul-rumus">Nilai Tes</p>
          <ul>
            {tes.baris.map((b) => {
              const t = konfigurasi[b.jenisTes];
              return (
                <li key={b.jenisTes}>
                  {b.jenisTes}: nilai {angka1(t?.hasil?.skor)} (batas bawah {t?.batasBawah}, target {t?.targetSkor}) → skor {angka1(b.skor)} × {angka1(b.persen)}% ={' '}
                  {angka1(b.hasil)}
                </li>
              );
            })}
          </ul>
          <p>
            Nilai Tes = {tes.baris.map((b) => angka1(b.hasil)).join(' + ')} = <b>{angka1(tes.total)}</b>
          </p>
        </>
      )}
      {akhir && (
        <>
          <p className="judul-rumus">Skor akhir</p>
          <p>
            {akhir.baris.map((b) => `${b.nama} ${angka1(b.nilai)} × ${b.bobot}%`).join(' + ')}
          </p>
          <p>
            = {akhir.baris.map((b) => angka1(b.hasil)).join(' + ')} = <b>{angka1(k.skorAkhir)}</b>
          </p>
          <p className="bantuan">Tiap angka di atas dibulatkan satu desimal; perhitungan memakai angka lengkap, jadi jumlahnya bisa selisih 0,1.</p>
        </>
      )}
    </details>
  );
}
