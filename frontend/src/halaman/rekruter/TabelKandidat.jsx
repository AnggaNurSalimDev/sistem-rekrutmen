import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FILTER,
  LABEL_KAMERA,
  LABEL_STATUS,
  formatRupiah,
  labelCv,
  perluVerifikasi,
  saring,
  urutkan,
} from '../../rekruter/kandidat.js';
import { unduhCsv } from '../../rekruter/ekspor.js';
import { RataRataKomponen, SebaranSkor } from './Grafik.jsx';

function angkaId(n, digit = 1) {
  if (!Number.isFinite(n)) return '–';
  return n.toLocaleString('id-ID', { maximumFractionDigits: digit });
}

function KepalaUrut({ kolom, urut, setUrut, children, className }) {
  const aktif = urut.kolom === kolom;
  const arahBaru = aktif && urut.arah === 'turun' ? 'naik' : 'turun';
  return (
    <th scope="col" className={className} aria-sort={aktif ? (urut.arah === 'naik' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="tombol-urut" onClick={() => setUrut({ kolom, arah: arahBaru })}>
        {children}
        <span aria-hidden="true" className="panah-urut">
          {aktif ? (urut.arah === 'naik' ? '▲' : '▼') : ''}
        </span>
      </button>
    </th>
  );
}

export function SelSkor({ k }) {
  if (k.skorAkhir === null) {
    return <span className="skor-kosong">{k.skor?.status === 'galat' ? 'Galat' : 'Belum lengkap'}</span>;
  }
  return (
    <span className="sel-skor">
      <b>{angkaId(k.skorAkhir)}</b>
      {k.skor?.sementara && <span className="stempel kecil" title="CV belum dicek HR">Sementara</span>}
    </span>
  );
}

function SelIntegritas({ i }) {
  if (!i) return <span className="redup">Belum tes</span>;
  const keluar = i.jumlahKeluarFokus;
  return (
    <span className="sel-integritas">
      <span>{keluar === 0 ? 'Tidak keluar halaman' : `Keluar ${keluar}× (${angkaId(i.totalDetikKeluarFokus, 0)} dtk)`}</span>
      <span className="redup">
        {LABEL_KAMERA[i.statusKamera] ?? i.statusKamera}
        {i.dibukaUlang > 0 ? `, dibuka ulang ${i.dibukaUlang}×` : ''}
      </span>
    </span>
  );
}

export default function TabelKandidat({ kandidat, lowongan }) {
  const [filter, setFilter] = useState('semua');
  const [cari, setCari] = useState('');
  const [urut, setUrut] = useState({ kolom: 'skor', arah: 'turun' });

  const jumlahPerlu = kandidat.filter(perluVerifikasi).length;
  const tampil = urutkan(saring(kandidat, filter, cari), urut.kolom, urut.arah);
  // Grafik mengikuti filter (misalnya hanya yang sudah dicek HR), tapi tidak mengikuti kotak cari nama.
  const untukGrafik = saring(kandidat, filter);

  if (kandidat.length === 0) {
    return (
      <div className="kosong">
        <p>
          {lowongan.status === 'buka'
            ? 'Belum ada pelamar. Pelamar muncul di sini begitu mengirim lamaran.'
            : 'Belum ada pelamar. Buka lowongan supaya bisa dilamar.'}
        </p>
      </div>
    );
  }

  return (
    <>
      {jumlahPerlu > 0 && (
        <div className="pesan antrean">
          <p>
            <strong>{jumlahPerlu} CV belum dicek HR.</strong> Skornya ditandai <span className="stempel kecil">Sementara</span> karena dihitung dari hasil baca otomatis.
          </p>
          {filter !== 'perlu_verifikasi' && (
            <button type="button" className="tombol kedua" onClick={() => setFilter('perlu_verifikasi')}>
              Tampilkan yang perlu dicek
            </button>
          )}
        </div>
      )}

      <div className="bilah-filter" role="search">
        <div className="segmen" role="group" aria-label="Saring kandidat">
          {Object.entries(FILTER).map(([kunci, nama]) => (
            <button key={kunci} type="button" aria-pressed={filter === kunci} onClick={() => setFilter(kunci)}>
              {nama}
            </button>
          ))}
        </div>
        <label className="cari-nama">
          <span className="sr-only">Cari nama atau email</span>
          <input type="search" placeholder="Cari nama atau email" value={cari} onChange={(e) => setCari(e.target.value)} />
        </label>
        <button type="button" className="tombol kedua" onClick={() => unduhCsv(tampil, lowongan.posisi)} disabled={tampil.length === 0}>
          Unduh CSV ({tampil.length})
        </button>
      </div>

      <div className="grafik-ganda">
        <SebaranSkor kandidat={untukGrafik} />
        <RataRataKomponen kandidat={untukGrafik} />
      </div>

      <div className="gulung-tabel" tabIndex={0} role="region" aria-label="Tabel kandidat">
        <table className="tabel-kandidat">
          <caption className="sr-only">
            {tampil.length} kandidat, diurutkan menurut {urut.kolom}
          </caption>
          <thead>
            <tr>
              <KepalaUrut kolom="nama" urut={urut} setUrut={setUrut}>
                Kandidat
              </KepalaUrut>
              <KepalaUrut kolom="skor" urut={urut} setUrut={setUrut} className="angka">
                Skor akhir
              </KepalaUrut>
              <KepalaUrut kolom="cv" urut={urut} setUrut={setUrut} className="angka">
                CV
              </KepalaUrut>
              <KepalaUrut kolom="tenure" urut={urut} setUrut={setUrut} className="angka">
                Lama kerja
              </KepalaUrut>
              <KepalaUrut kolom="tes" urut={urut} setUrut={setUrut} className="angka">
                Tes
              </KepalaUrut>
              <KepalaUrut kolom="keluarFokus" urut={urut} setUrut={setUrut}>
                Selama tes
              </KepalaUrut>
              <KepalaUrut kolom="gaji" urut={urut} setUrut={setUrut} className="angka">
                Ekspektasi gaji
              </KepalaUrut>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {tampil.map((k) => (
              <tr key={k.id}>
                <th scope="row">
                  <Link to={`/rekruter/kandidat/${k.id}`}>{k.nama}</Link>
                  <span className="redup">{labelCv(k)}</span>
                </th>
                <td className="angka">
                  <SelSkor k={k} />
                </td>
                <td className="angka">{angkaId(k.skor?.komponen?.cv)}</td>
                <td className="angka">{angkaId(k.skor?.komponen?.tenure)}</td>
                <td className="angka">{angkaId(k.skor?.komponen?.tes)}</td>
                <td>
                  <SelIntegritas i={k.integritas} />
                </td>
                <td className="angka">
                  {formatRupiah(k.ekspektasiGaji)}
                  {k.ekspektasiGaji > lowongan.budgetMaksimal && <span className="redup">di atas budget</span>}
                </td>
                <td>
                  <span className="status-kandidat" data-status={k.statusAplikasi}>
                    {LABEL_STATUS[k.statusAplikasi] ?? k.statusAplikasi}
                  </span>
                </td>
              </tr>
            ))}
            {tampil.length === 0 && (
              <tr>
                <td colSpan={8} className="kosong-tabel">
                  Tidak ada kandidat yang cocok dengan saringan ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="catatan-kaki">
        Data &quot;Selama tes&quot; dicatat browser pelamar dan hanya petunjuk, bukan bukti kecurangan. Ekspor CSV mengikuti saringan dan urutan yang tampil.
      </p>
    </>
  );
}
