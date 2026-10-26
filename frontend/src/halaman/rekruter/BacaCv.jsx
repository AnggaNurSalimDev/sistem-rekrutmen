import { useState } from 'react';
import { bagiSegmen, hitungKataKunci, rapikanKataKunci } from '../../rekruter/sorotan.js';

const NAMA_KATEGORI = {
  perusahaan: 'Tempat kerja',
  skill: 'Skill',
  sertifikat: 'Sertifikat',
  ketersediaan: 'Ketersediaan',
  lainnya: 'Temuan lain',
};

/**
 * Teks CV dengan dua lapis sorotan: temuan AI (garis bawah biru) dan kata
 * kunci dari rekruter (stabilo). Pencarian kata kunci sepenuhnya di browser.
 */
export default function BacaCv({ teks, sorotan, kataKunciLowongan }) {
  const [tambahan, setTambahan] = useState([]);
  const [ketik, setKetik] = useState('');
  const [mati, setMati] = useState([]); // kata kunci lowongan yang disembunyikan sementara
  const [tampilAi, setTampilAi] = useState(true);

  const semua = rapikanKataKunci([...kataKunciLowongan, ...tambahan]);
  const aktif = semua.filter((k) => !mati.includes(k));
  // Teks CV hanya beberapa KB; dihitung ulang setiap render tanpa memo masih jauh di bawah 1 ms.
  const segmen = bagiSegmen(teks, tampilAi ? sorotan : [], aktif);
  const jumlah = hitungKataKunci(teks, semua);

  function tambah(e) {
    e.preventDefault();
    const baru = rapikanKataKunci(ketik.split(','));
    if (baru.length) setTambahan(rapikanKataKunci([...tambahan, ...baru]));
    setMati(mati.filter((m) => !baru.some((b) => b.toLowerCase() === m.toLowerCase())));
    setKetik('');
  }

  const dariLowongan = new Set(kataKunciLowongan.map((k) => k.toLowerCase()));

  return (
    <div className="baca-cv">
      <form className="cari-cv" onSubmit={tambah} role="search">
        <label htmlFor="cari-kata-cv">Cari kata atau kalimat di CV</label>
        <div className="baris-cari">
          <input id="cari-kata-cv" type="search" value={ketik} onChange={(e) => setKetik(e.target.value)} placeholder="misalnya: shift malam, SIM C" maxLength={200} />
          <button type="submit" className="tombol kedua">
            Sorot
          </button>
        </div>
      </form>

      {semua.length > 0 && (
        <ul className="daftar-kata" aria-label="Kata kunci yang disorot">
          {semua.map((k) => {
            const nyala = !mati.includes(k);
            const n = jumlah[k] ?? 0;
            return (
              <li key={k}>
                <button
                  type="button"
                  className={n === 0 ? 'chip tidak-ada' : 'chip'}
                  aria-pressed={nyala}
                  onClick={() => setMati(nyala ? [...mati, k] : mati.filter((m) => m !== k))}
                  title={nyala ? 'Klik untuk berhenti menyorot' : 'Klik untuk menyorot lagi'}
                >
                  {k} <span className="hitungan">{n === 0 ? 'tidak ada' : `${n}×`}</span>
                </button>
                {!dariLowongan.has(k.toLowerCase()) && (
                  <button type="button" className="tombol-teks hapus-chip" onClick={() => setTambahan(tambahan.filter((t) => t !== k))} aria-label={`Hapus kata kunci ${k}`}>
                    ×
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="legenda-cv">
        <label>
          <input type="checkbox" checked={tampilAi} onChange={(e) => setTampilAi(e.target.checked)} /> <span className="contoh-ai">Ditemukan AI</span>
        </label>
        <span>
          <mark className="contoh-kata">Kata kunci Anda</mark>
        </span>
      </div>

      <div className="teks-cv" tabIndex={0} role="region" aria-label="Teks CV">
        {segmen.map((s) => {
          if (!s.ai && s.kata.length === 0) return <span key={s.awal}>{s.teks}</span>;
          const judul = [s.ai ? `${NAMA_KATEGORI[s.ai.kategori] ?? s.ai.kategori}: ${s.ai.label}` : null, s.kata.length ? `Kata kunci: ${s.kata.join(', ')}` : null]
            .filter(Boolean)
            .join('\n');
          const kelas = [s.ai ? `sorot-ai kategori-${s.ai.kategori}` : '', s.kata.length ? 'sorot-kata' : ''].join(' ').trim();
          return s.kata.length ? (
            <mark key={s.awal} className={kelas} title={judul}>
              {s.teks}
            </mark>
          ) : (
            <span key={s.awal} className={kelas} title={judul}>
              {s.teks}
            </span>
          );
        })}
      </div>
    </div>
  );
}
