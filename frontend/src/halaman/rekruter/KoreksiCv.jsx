import { useState } from 'react';
import { Isian } from '../../komponen/Isian.jsx';
import { pisahDaftar } from '../../rekruter/formLowongan.js';
import { barisDariCv, validasiRiwayat } from '../../rekruter/riwayat.js';

export default function KoreksiCv({ cv, skillWajib, simpan, batal, sibuk }) {
  const [skills, setSkills] = useState((cv.skills ?? []).join(', '));
  const [baris, setBaris] = useState(() => barisDariCv(cv.riwayatKerja));
  const [galat, setGalat] = useState({});
  const ubah = (i, kunci, nilai) => setBaris(baris.map((r, j) => (j === i ? { ...r, [kunci]: nilai } : r)));

  return (
    <form
      className="form-koreksi"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const { galat: g, hasil } = validasiRiwayat(baris);
        setGalat(g);
        if (Object.keys(g).length === 0) simpan({ skills: pisahDaftar(skills), riwayatKerja: hasil });
      }}
    >
      <h3>Data CV menurut HR</h3>
      <p className="bantuan">Data ini menggantikan hasil baca otomatis dan langsung dianggap sudah dicek.</p>
      <Isian label="Skill" bantuan={`Pisahkan dengan koma. Skill wajib lowongan: ${skillWajib.join(', ')}.`}>
        {(p) => <textarea {...p} rows={2} value={skills} onChange={(e) => setSkills(e.target.value)} />}
      </Isian>

      <fieldset className="isian">
        <legend>Riwayat kerja</legend>
        {baris.length === 0 && <span className="bantuan">Kosong berarti belum punya riwayat kerja (nilai lama kerja netral 50).</span>}
        {baris.map((r, i) => (
          <div className="baris-riwayat" key={i}>
            <input type="text" aria-label={`Tempat kerja ${i + 1}`} placeholder="Nama tempat kerja" maxLength={200} value={r.perusahaan} onChange={(e) => ubah(i, 'perusahaan', e.target.value)} />
            {!r.tanpaTanggal && (
              <>
                <input type="month" aria-label={`Mulai kerja ${i + 1}`} value={r.mulai} onChange={(e) => ubah(i, 'mulai', e.target.value)} />
                {!r.masihBekerja && <input type="month" aria-label={`Selesai kerja ${i + 1}`} value={r.selesai} onChange={(e) => ubah(i, 'selesai', e.target.value)} />}
              </>
            )}
            <div className="centang-riwayat">
              <label>
                <input type="checkbox" checked={r.tanpaTanggal} onChange={(e) => ubah(i, 'tanpaTanggal', e.target.checked)} /> Tanggal tidak disebut
              </label>
              {!r.tanpaTanggal && (
                <label>
                  <input type="checkbox" checked={r.masihBekerja} onChange={(e) => ubah(i, 'masihBekerja', e.target.checked)} /> Masih bekerja
                </label>
              )}
              <button type="button" className="tombol-teks" onClick={() => setBaris(baris.filter((_, j) => j !== i))} aria-label={`Hapus tempat kerja ${i + 1}`}>
                Hapus
              </button>
            </div>
            {galat[i] && <span className="galat">{galat[i]}</span>}
          </div>
        ))}
        <button type="button" className="tombol-teks" onClick={() => setBaris([...baris, { perusahaan: '', mulai: '', selesai: '', tanpaTanggal: false, masihBekerja: false }])}>
          Tambah tempat kerja
        </button>
      </fieldset>

      <div className="aksi-form">
        <button type="submit" className="tombol" disabled={sibuk}>
          {sibuk ? 'Menyimpan…' : 'Simpan data CV'}
        </button>
        <button type="button" className="tombol kedua" onClick={batal}>
          Batal
        </button>
      </div>
    </form>
  );
}
