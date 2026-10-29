import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Isian } from '../komponen/Isian.jsx';
import { Pesan } from '../komponen/umum.jsx';
import { useProfil } from '../merek/ProfilContext.jsx';
import { bacaTeksProfil, validasiProfil } from '../merek/profil.js';
import { kontras, tintaDiAtas } from '../merek/warna.js';
import { MAKS_BYTE_GAMBAR, draftKeMentah, galatPerField, namaFileUnduhan, periksaBerkasGambar, profilKeDraf } from '../merek/editor.js';

/*
 * Editor tampilan untuk demo portofolio. Dipakai Angga saat bertemu calon klien,
 * atau dicoba langsung oleh calon klien. Tanpa ketik kode:
 *
 *   isi form ──▶ draf ──▶ validasi ──▶ seluruh halaman berubah langsung (pratinjau)
 *                                  ├──▶ "Pakai di demo ini"  → tersimpan di browser ini
 *                                  └──▶ "Unduh file profil"  → bahan deploy untuk klien
 */

const KUNCI_DRAF = 'profil-draf';

// Nama field di pesan validasi → label yang dilihat pengguna di form.
const LABEL_FIELD = {
  nama: 'Nama perusahaan',
  'logo.teks': 'Tulisan di logo',
  'logo.gambar': 'Gambar logo',
  favicon: 'Gambar logo',
  'warna.utama': 'Warna utama',
  'warna.aksen': 'Warna aksen',
  'teks.judulBeranda': 'Judul',
  'teks.deskripsiBeranda': 'Kalimat pembuka',
  'teks.tentang': 'Tentang perusahaan',
  'teks.tombolLamar': 'Tulisan tombol melamar',
};

const PILIHAN = {
  huruf: [
    ['jakarta', 'Modern', 'Plus Jakarta Sans'],
    ['fraunces', 'Hangat', 'Fraunces'],
    ['grotesk', 'Teknis', 'Space Grotesk'],
  ],
  tema: [
    ['terang', 'Terang'],
    ['gelap', 'Gelap'],
  ],
  sudut: [
    ['tajam', 'Tajam'],
    ['sedang', 'Sedang'],
    ['bulat', 'Bulat'],
  ],
  kerapatan: [
    ['rapat', 'Rapat'],
    ['normal', 'Normal'],
    ['lega', 'Lega'],
  ],
};

function bacaDraf() {
  try {
    const teks = window.localStorage.getItem(KUNCI_DRAF);
    if (!teks) return null;
    const { profil } = bacaTeksProfil(teks);
    return profil ? profilKeDraf(profil) : null;
  } catch {
    return null;
  }
}

function Segmen({ label, nilai, pilihan, ubah }) {
  return (
    <fieldset className="isian">
      <legend>{label}</legend>
      <div className="segmen">
        {pilihan.map(([v, teks]) => (
          <button key={v} type="button" aria-pressed={nilai === v} onClick={() => ubah(v)}>
            {teks}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function IsianWarna({ label, bantuan, nilai, galat, ubah }) {
  // Teks hex disimpan terpisah supaya pengguna bisa mengetik "#b44" tanpa langsung ditolak.
  const [ketik, setKetik] = useState(nilai);
  useEffect(() => setKetik(nilai), [nilai]);
  return (
    <Isian label={label} bantuan={bantuan} galat={galat}>
      {(p) => (
        <div className="baris-warna">
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(nilai) ? nilai : '#000000'} aria-label={`${label}, pemilih`} onChange={(e) => ubah(e.target.value)} />
          <input
            {...p}
            type="text"
            inputMode="text"
            spellCheck="false"
            maxLength={7}
            value={ketik}
            onChange={(e) => {
              const v = e.target.value.trim();
              setKetik(v);
              if (/^#[0-9a-f]{6}$/i.test(v)) ubah(v.toLowerCase());
            }}
          />
        </div>
      )}
    </Isian>
  );
}

export default function AturTampilan() {
  const { profil, daftar, kustom, simpanKustom, hapusKustom, setPratinjau } = useProfil();
  const navigate = useNavigate();
  const [draf, setDraf] = useState(() => bacaDraf() ?? profilKeDraf(profil));
  const [pesan, setPesan] = useState(null);
  const [galatLogo, setGalatLogo] = useState(null);
  const masukanFile = useRef(null);

  const mentah = useMemo(() => draftKeMentah(draf), [draf]);
  const { profil: hasil, masalah } = useMemo(() => validasiProfil(mentah), [mentah]);
  const galat = galatPerField(masalah);
  const bisaDipakai = masalah.length === 0;

  // Pratinjau: seluruh halaman (termasuk kepala) memakai draf. Saat keluar, pratinjau dilepas
  // dan profil yang aktif kembali tampil.
  useEffect(() => {
    setPratinjau(hasil);
  }, [hasil, setPratinjau]);
  useEffect(() => () => setPratinjau(null), [setPratinjau]);

  // Draf disimpan di browser supaya tidak hilang kalau halaman tertutup.
  useEffect(() => {
    try {
      window.localStorage.setItem(KUNCI_DRAF, JSON.stringify(mentah));
    } catch {
      /* penuh atau tidak tersedia: draf hanya hidup selama halaman terbuka */
    }
  }, [mentah]);

  const ubah = (jalur) => (nilai) =>
    setDraf((d) => {
      const [a, b] = jalur.split('.');
      return b ? { ...d, [a]: { ...d[a], [b]: nilai } } : { ...d, [a]: nilai };
    });
  const ubahTeks = (jalur) => (e) => ubah(jalur)(e.target.value);

  function mulaiDari(id) {
    const p = daftar.find((x) => x.id === id);
    if (!p) return;
    setDraf(profilKeDraf(p));
    setPesan({ jenis: 'info', teks: `Memulai dari tampilan ${p.nama}.` });
  }

  function pilihLogo(e) {
    const berkas = e.target.files?.[0];
    e.target.value = '';
    const salah = periksaBerkasGambar(berkas);
    setGalatLogo(salah);
    if (salah) return;
    const pembaca = new FileReader();
    pembaca.onload = () => ubah('logo.gambar')(String(pembaca.result));
    pembaca.onerror = () => setGalatLogo('Logo gagal dibaca. Coba berkas lain.');
    pembaca.readAsDataURL(berkas);
  }

  function bukaFile(e) {
    const berkas = e.target.files?.[0];
    e.target.value = '';
    if (!berkas) return;
    berkas
      .text()
      .then((teks) => {
        const { profil: p, masalah: m } = bacaTeksProfil(teks);
        if (!p) {
          setPesan({ jenis: 'galat', teks: `File tidak bisa dibuka: ${m.join('; ')}` });
          return;
        }
        setDraf(profilKeDraf(p));
        setPesan({ jenis: m.length ? 'info' : 'sukses', teks: m.length ? `Dibuka dengan ${m.length} catatan; bagian yang salah diganti nilai bawaan.` : `${p.nama} dibuka.` });
      })
      .catch(() => setPesan({ jenis: 'galat', teks: 'File gagal dibaca.' }));
  }

  function unduh() {
    const blob = new Blob([JSON.stringify(mentah, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = namaFileUnduhan(mentah);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setPesan({ jenis: 'sukses', teks: `${a.download} diunduh. Simpan file ini untuk deploy situs klien.` });
  }

  function pakai() {
    if (!bisaDipakai) return;
    setPratinjau(null);
    if (!simpanKustom(mentah)) {
      setPesan({ jenis: 'galat', teks: 'Tidak bisa disimpan di browser ini (mungkin mode privat atau penyimpanan penuh). Gunakan "Unduh file profil".' });
      return;
    }
    navigate('/');
  }

  const diAtasUtama = /^#[0-9a-f]{6}$/i.test(draf.warna.utama) ? tintaDiAtas(draf.warna.utama) : null;

  return (
    <>
      <div className="judul-halaman">
        <h1>Atur tampilan</h1>
        <p>Isi nama, logo, dan warna perusahaan. Seluruh halaman berubah langsung, termasuk kepala di atas. Data lowongan tidak ikut berubah.</p>
      </div>

      {pesan && (
        <Pesan jenis={pesan.jenis}>
          <p>{pesan.teks}</p>
        </Pesan>
      )}

      <div className="editor-tampilan">
        <form className="editor-form" onSubmit={(e) => e.preventDefault()} noValidate>
          <section className="bagian">
            <h2>Mulai dari</h2>
            <div className="baris-aksi">
              <label className="sr-only" htmlFor="mulai-dari">
                Mulai dari tampilan yang ada
              </label>
              <select id="mulai-dari" className="pilih" value="" onChange={(e) => mulaiDari(e.target.value)}>
                <option value="" disabled>
                  Pilih contoh…
                </option>
                {daftar.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nama}
                  </option>
                ))}
              </select>
              <button type="button" className="tombol kedua" onClick={() => masukanFile.current?.click()}>
                Buka file profil
              </button>
              <input ref={masukanFile} type="file" accept="application/json,.json" hidden onChange={bukaFile} />
            </div>
          </section>

          <section className="bagian">
            <h2>Identitas</h2>
            <Isian label="Nama perusahaan" galat={galat.nama}>
              {(p) => <input {...p} type="text" maxLength={60} value={draf.nama} onChange={ubahTeks('nama')} />}
            </Isian>
            <Isian label="Tulisan di logo" bantuan="Boleh lebih pendek dari nama, misalnya singkatan." galat={galat['logo.teks']}>
              {(p) => <input {...p} type="text" maxLength={40} value={draf.logo.teks} onChange={ubahTeks('logo.teks')} />}
            </Isian>
            <label className="centang">
              <input type="checkbox" checked={draf.logo.titik} onChange={(e) => ubah('logo.titik')(e.target.checked)} />
              Tambahkan titik berwarna aksen setelah tulisan logo
            </label>

            <div className="isian">
              <span className="label-isian">Gambar logo</span>
              <span className="bantuan">PNG, JPG, WEBP, atau SVG, maksimal {Math.floor(MAKS_BYTE_GAMBAR / 1024)} KB. Juga dipakai sebagai ikon tab browser.</span>
              <div className="baris-aksi">
                {draf.logo.gambar && <img className="contoh-logo" src={draf.logo.gambar} alt="Logo saat ini" />}
                <label className="tombol kedua pilih-berkas">
                  {draf.logo.gambar ? 'Ganti logo' : 'Pilih logo'}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={pilihLogo} />
                </label>
                {draf.logo.gambar && (
                  <button type="button" className="tombol-teks bahaya" onClick={() => ubah('logo.gambar')(null)}>
                    Hapus logo
                  </button>
                )}
              </div>
              {(galatLogo || galat['logo.gambar']) && <span className="galat">{galatLogo || galat['logo.gambar']}</span>}
            </div>
          </section>

          <section className="bagian">
            <h2>Warna</h2>
            <IsianWarna
              label="Warna utama"
              bantuan="Latar kepala halaman dan tombol."
              nilai={draf.warna.utama}
              galat={galat['warna.utama']}
              ubah={ubah('warna.utama')}
            />
            {diAtasUtama && !galat['warna.utama'] && (
              <p className="catatan-otomatis">Tulisan di atas warna ini otomatis {diAtasUtama === '#ffffff' ? 'putih' : 'gelap'} supaya terbaca.</p>
            )}
            <IsianWarna
              label="Warna aksen"
              bantuan="Titik di logo dan garis menu yang sedang dibuka."
              nilai={draf.warna.aksen}
              galat={galat['warna.aksen']}
              ubah={ubah('warna.aksen')}
            />
            {/^#[0-9a-f]{6}$/i.test(draf.warna.aksen) && /^#[0-9a-f]{6}$/i.test(draf.warna.utama) && kontras(draf.warna.aksen, draf.warna.utama) < 3 && (
              <p className="catatan-otomatis">Aksen ini kurang terlihat di atas warna utama, jadi diganti warna tulisan kepala.</p>
            )}
          </section>

          <section className="bagian">
            <h2>Gaya</h2>
            <fieldset className="isian">
              <legend>Huruf</legend>
              <div className="pilihan-huruf">
                {PILIHAN.huruf.map(([v, teks, nama]) => (
                  <button key={v} type="button" aria-pressed={draf.huruf === v} onClick={() => ubah('huruf')(v)} data-huruf={v}>
                    <span className="contoh-huruf">Aa</span>
                    <b>{teks}</b>
                    <small>{nama}</small>
                  </button>
                ))}
              </div>
            </fieldset>
            <Segmen label="Tema" nilai={draf.gaya.tema} pilihan={PILIHAN.tema} ubah={ubah('gaya.tema')} />
            <Segmen label="Sudut tombol dan kartu" nilai={draf.gaya.sudut} pilihan={PILIHAN.sudut} ubah={ubah('gaya.sudut')} />
            <Segmen label="Kerapatan" nilai={draf.gaya.kerapatan} pilihan={PILIHAN.kerapatan} ubah={ubah('gaya.kerapatan')} />
          </section>

          <section className="bagian">
            <h2>Teks halaman depan</h2>
            <Isian label="Judul" galat={galat['teks.judulBeranda']}>
              {(p) => <input {...p} type="text" maxLength={90} value={draf.teks.judulBeranda} onChange={ubahTeks('teks.judulBeranda')} />}
            </Isian>
            <Isian label="Kalimat pembuka" galat={galat['teks.deskripsiBeranda']}>
              {(p) => <textarea {...p} rows={3} maxLength={300} value={draf.teks.deskripsiBeranda} onChange={ubahTeks('teks.deskripsiBeranda')} />}
            </Isian>
            <Isian label="Tentang perusahaan (boleh kosong)" bantuan={`${draf.teks.tentang.length}/600 karakter`} galat={galat['teks.tentang']}>
              {(p) => <textarea {...p} rows={4} maxLength={600} value={draf.teks.tentang} onChange={ubahTeks('teks.tentang')} />}
            </Isian>
            <Isian label="Tulisan tombol melamar" galat={galat['teks.tombolLamar']}>
              {(p) => <input {...p} type="text" maxLength={30} value={draf.teks.tombolLamar} onChange={ubahTeks('teks.tombolLamar')} />}
            </Isian>
          </section>
        </form>

        <aside className="editor-pratinjau" aria-label="Pratinjau">
          <div className="kartu-pratinjau">
            <p className="label-kecil">Pratinjau</p>
            <h3>{hasil.teks.judulBeranda}</h3>
            <p className="redup">{hasil.teks.deskripsiBeranda}</p>
            <div className="baris-lowongan contoh">
              <h4>Kasir</h4>
              <span className="waktu">Shift pagi, Senin–Sabtu</span>
            </div>
            <div className="baris-aksi">
              <button type="button" className="tombol" tabIndex={-1}>
                {hasil.teks.tombolLamar}
              </button>
              <button type="button" className="tombol kedua" tabIndex={-1}>
                Batal
              </button>
            </div>
            <p>
              Contoh <a href="#pratinjau" onClick={(e) => e.preventDefault()} tabIndex={-1}>tautan</a> dan stempel{' '}
              <span className="stempel kecil">Sementara</span>
            </p>
          </div>

          {masalah.length > 0 && (
            <Pesan jenis="galat" judul="Perlu diperbaiki sebelum dipakai">
              <ul>
                {Object.entries(galat).map(([field, isi]) => (
                  <li key={field}>
                    <b>{LABEL_FIELD[field] ?? field}:</b> {isi}
                  </li>
                ))}
              </ul>
            </Pesan>
          )}

          <div className="aksi-editor">
            <button type="button" className="tombol" disabled={!bisaDipakai} onClick={pakai}>
              Pakai di demo ini
            </button>
            <button type="button" className="tombol kedua" disabled={!bisaDipakai} onClick={unduh}>
              Unduh file profil
            </button>
            <Link to="/">Kembali tanpa menyimpan</Link>
            {kustom && (
              <button type="button" className="tombol-teks bahaya" onClick={() => { hapusKustom(); setPesan({ jenis: 'info', teks: `Tampilan "${kustom.nama}" dihapus dari browser ini.` }); }}>
                Hapus tampilan buatan saya ({kustom.nama})
              </button>
            )}
          </div>
          <p className="bantuan-kecil">
            &quot;Pakai di demo ini&quot; hanya tersimpan di browser ini. Untuk situs klien, kirim file profil ke pengembang.
          </p>
        </aside>
      </div>
    </>
  );
}
