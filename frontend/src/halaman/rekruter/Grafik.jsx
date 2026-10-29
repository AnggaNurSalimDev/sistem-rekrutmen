import { useEffect, useId, useRef, useState } from 'react';
import { rataRataKomponen, sebaranSkor } from '../../rekruter/kandidat.js';

/*
 * Dua grafik kecil di atas tabel kandidat. Masing-masing satu seri, jadi
 * tanpa kotak legenda (judul sudah menyebut isinya). Warna batang memakai
 * --tanda-data: warna utama profil yang digeser sampai kontras ≥ 3:1 terhadap
 * permukaan (lihat src/merek/profil.js), jadi tetap terbaca di tema gelap.
 * Setiap grafik punya tampilan tabel untuk pembaca layar dan cetak.
 */

// Lewat style, bukan atribut fill: atribut SVG tidak bisa membaca var(--…).
const WARNA = { fill: 'var(--tanda-data)' };
const TEBAL = 24;

/** Batang dengan ujung data membulat 4px dan pangkal persegi. */
function jalurKolom(x, y, w, h) {
  const r = Math.min(4, h, w / 2);
  if (h <= 0) return '';
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
function jalurBatang(x, y, w, h) {
  const r = Math.min(4, w, h / 2);
  if (w <= 0) return '';
  return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
}

/**
 * Lebar kotak grafik dalam piksel. SVG digambar 1:1 (bukan diskalakan
 * viewBox), supaya teks sumbu dan tebal batang tetap sama di HP dan desktop.
 */
function useLebar(awal = 320) {
  const ref = useRef(null);
  const [lebar, setLebar] = useState(awal);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.floor(e.contentRect.width);
      if (w > 0) setLebar(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, Math.max(240, lebar)];
}

function Tooltip({ isi }) {
  if (!isi) return null;
  return (
    <div className="tooltip-grafik" style={{ left: `${isi.x}%`, top: isi.y }} role="presentation">
      {isi.teks}
    </div>
  );
}

export function SebaranSkor({ kandidat }) {
  const id = useId();
  const [hover, setHover] = useState(null);
  const [ref, L] = useLebar();
  const { kelompok, tanpaSkor } = sebaranSkor(kandidat);
  const maks = Math.max(1, ...kelompok.map((k) => k.jumlah));
  // Garis bantu di angka bulat: 0, setengah, maksimum (dibulatkan ke atas).
  const atas = maks <= 4 ? maks : Math.ceil(maks / 2) * 2;
  const T = 160;
  const kiri = 24;
  const bawah = 22;
  const lebarSlot = (L - kiri) / 10;
  const tinggiPlot = T - bawah - 8;
  const ada = kelompok.some((k) => k.jumlah > 0);

  return (
    <figure className="grafik" aria-labelledby={`${id}-judul`}>
      <figcaption id={`${id}-judul`}>
        <strong>Sebaran skor akhir</strong>
        <span>Jumlah kandidat per rentang skor{tanpaSkor > 0 ? `. ${tanpaSkor} kandidat belum punya skor akhir.` : ''}</span>
      </figcaption>
      {!ada ? (
        <p className="grafik-kosong">Belum ada kandidat dengan skor akhir. Skor akhir muncul setelah CV terbaca dan semua tes dikirim.</p>
      ) : (
        <div className="kanvas-grafik" ref={ref} onMouseLeave={() => setHover(null)}>
          <svg width={L} height={T} viewBox={`0 0 ${L} ${T}`} role="img" aria-label="Grafik sebaran skor akhir, detail di tabel di bawahnya">
            {[0, atas / 2, atas].filter((v, i, a) => a.indexOf(v) === i && Number.isInteger(v)).map((v) => {
              const y = 8 + tinggiPlot - (v / atas) * tinggiPlot;
              return (
                <g key={v}>
                  <line x1={kiri} x2={L} y1={y} y2={y} className="garis-bantu" />
                  <text x={kiri - 6} y={y + 4} textAnchor="end" className="teks-sumbu">
                    {v}
                  </text>
                </g>
              );
            })}
            {kelompok.map((k, i) => {
              const h = (k.jumlah / atas) * tinggiPlot;
              const w = Math.min(TEBAL, lebarSlot - 4);
              const x = kiri + i * lebarSlot + (lebarSlot - w) / 2;
              const y = 8 + tinggiPlot - h;
              const teks = `Skor ${k.dari}–${k.sampai}: ${k.jumlah} kandidat${k.sementara ? ` (${k.sementara} sementara)` : ''}`;
              const tampil = () => setHover({ x: ((x + w / 2) / L) * 100, y: 0, teks });
              return (
                <g key={k.dari}>
                  {/* Area sentuh setinggi plot, lebih besar dari batangnya. */}
                  <rect
                    x={kiri + i * lebarSlot}
                    y={8}
                    width={lebarSlot}
                    height={tinggiPlot}
                    fill="transparent"
                    onMouseEnter={tampil}
                    onFocus={tampil}
                    onBlur={() => setHover(null)}
                    tabIndex={k.jumlah > 0 ? 0 : -1}
                    aria-label={teks}
                  />
                  <path d={jalurKolom(x, y, w, h)} style={WARNA} opacity={hover && hover.teks !== teks ? 0.45 : 1} pointerEvents="none" />
                  {i % 2 === 0 && (
                    <text x={kiri + i * lebarSlot + lebarSlot / 2} y={T - 6} textAnchor="middle" className="teks-sumbu">
                      {k.dari}
                    </text>
                  )}
                </g>
              );
            })}
            <line x1={kiri} x2={L} y1={8 + tinggiPlot} y2={8 + tinggiPlot} className="garis-dasar" />
          </svg>
          <Tooltip isi={hover} />
        </div>
      )}
      <details className="tabel-grafik">
        <summary>Lihat sebagai tabel</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Rentang skor</th>
              <th scope="col">Kandidat</th>
              <th scope="col">Di antaranya sementara</th>
            </tr>
          </thead>
          <tbody>
            {kelompok.map((k) => (
              <tr key={k.dari}>
                <td>
                  {k.dari}–{k.sampai}
                </td>
                <td>{k.jumlah}</td>
                <td>{k.sementara}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

export function RataRataKomponen({ kandidat }) {
  const id = useId();
  const [hover, setHover] = useState(null);
  const [ref, L] = useLebar();
  const data = rataRataKomponen(kandidat);
  const kiri = 96;
  const kananLabel = 40;
  const tinggiBaris = 32;
  const T = data.length * tinggiBaris + 6;
  const lebarPlot = L - kiri - kananLabel;
  const ada = data.some((d) => d.rata !== null);

  return (
    <figure className="grafik" aria-labelledby={`${id}-judul`}>
      <figcaption id={`${id}-judul`}>
        <strong>Rata-rata nilai per komponen</strong>
        <span>Skala 0–100, dari kandidat yang komponennya sudah ada</span>
      </figcaption>
      {!ada ? (
        <p className="grafik-kosong">Belum ada nilai komponen.</p>
      ) : (
        <div className="kanvas-grafik" ref={ref} onMouseLeave={() => setHover(null)}>
          <svg width={L} height={T} viewBox={`0 0 ${L} ${T}`} role="img" aria-label="Grafik rata-rata nilai per komponen, detail di tabel di bawahnya">
            {[0, 50, 100].map((v) => (
              <line key={v} x1={kiri + (v / 100) * lebarPlot} x2={kiri + (v / 100) * lebarPlot} y1={0} y2={T - 6} className={v === 0 ? 'garis-dasar' : 'garis-bantu'} />
            ))}
            {data.map((d, i) => {
              const tebal = Math.min(TEBAL, tinggiBaris - 12);
              const y = i * tinggiBaris + (tinggiBaris - tebal) / 2;
              const w = d.rata === null ? 0 : (d.rata / 100) * lebarPlot;
              const teks =
                d.rata === null
                  ? `${d.nama} (bobot ${d.bobot}%): belum ada data`
                  : `${d.nama} (bobot ${d.bobot}%): rata-rata ${String(d.rata).replace('.', ',')} dari ${d.jumlah} kandidat`;
              const tampil = () => setHover({ x: 50, y: y - 4, teks });
              return (
                <g key={d.kunci}>
                  <rect x={0} y={i * tinggiBaris} width={L} height={tinggiBaris} fill="transparent" onMouseEnter={tampil} onFocus={tampil} onBlur={() => setHover(null)} tabIndex={0} aria-label={teks} />
                  <text x={kiri - 8} y={y + tebal / 2 + 4} textAnchor="end" className="teks-label">
                    {d.nama}
                  </text>
                  <path d={jalurBatang(kiri, y, w, tebal)} style={WARNA} opacity={hover && hover.teks !== teks ? 0.45 : 1} pointerEvents="none" />
                  <text x={kiri + w + 6} y={y + tebal / 2 + 4} className="teks-nilai">
                    {d.rata === null ? '–' : Math.round(d.rata)}
                  </text>
                </g>
              );
            })}
          </svg>
          <Tooltip isi={hover} />
        </div>
      )}
      <details className="tabel-grafik">
        <summary>Lihat sebagai tabel</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Komponen</th>
              <th scope="col">Bobot</th>
              <th scope="col">Rata-rata</th>
              <th scope="col">Dari</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.kunci}>
                <td>{d.nama}</td>
                <td>{d.bobot}%</td>
                <td>{d.rata === null ? '–' : String(d.rata).replace('.', ',')}</td>
                <td>{d.jumlah} kandidat</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
