/*
 * Menyambungkan profil ke React dan ke <html>.
 *
 *   VITE_PROFIL ─┐
 *   ?profil=     ├─ pilihIdProfil ─▶ id ─▶ daftar[id] ─▶ terapkanProfil(document)
 *   localStorage ┘   (dua sumber terakhir hanya di mode demo)      │
 *                                                                  ▼
 *   useProfil() → { profil, tampil, setPratinjau, daftar, kustom, demo, ganti, simpanKustom, hapusKustom }
 *   tampil = draf editor (pratinjau) jika ada, selain itu profil aktif. Komponen merek membaca `tampil`.
 *
 * Profil "kustom" = buatan editor (/atur-tampilan) di browser ini saja. Disimpan di
 * localStorage, divalidasi ulang setiap dibaca karena isinya bisa diubah siapa pun.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { PROFIL_BAWAAN, bacaTeksProfil, pilihIdProfil, validasiProfil, variabelCss } from './profil.js';

const KUNCI_PILIHAN = 'profil-demo';
const KUNCI_KUSTOM = 'profil-kustom';
const env = import.meta.env ?? {};
export const MODE_DEMO = env.VITE_MODE_DEMO === 'true';

// Semua file di ./profil dimuat saat build. Profil yang rusak dicatat dan dilewati.
const berkas = import.meta.glob('./profil/*.json', { eager: true, import: 'default' });
const BAWAAN_BUILD = new Map([[PROFIL_BAWAAN.id, PROFIL_BAWAAN]]);
for (const [path, mentah] of Object.entries(berkas)) {
  const { profil, masalah } = validasiProfil(mentah);
  if (masalah.length) console.warn(`[profil] ${path}:\n- ${masalah.join('\n- ')}`);
  if (profil === PROFIL_BAWAAN && mentah?.id !== PROFIL_BAWAAN.id) continue; // id rusak → dilewati
  if (BAWAAN_BUILD.has(profil.id) && profil.id !== PROFIL_BAWAAN.id) console.warn(`[profil] id "${profil.id}" dipakai dua kali; ${path} menimpa yang lama`);
  BAWAAN_BUILD.set(profil.id, profil);
}

function baca(kunci) {
  try {
    return window.localStorage.getItem(kunci);
  } catch {
    return null;
  }
}
function tulis(kunci, nilai) {
  try {
    if (nilai === null) window.localStorage.removeItem(kunci);
    else window.localStorage.setItem(kunci, nilai);
    return true;
  } catch {
    return false; // mode privat / kuota penuh: pilihan hanya berlaku sampai refresh
  }
}

/** Profil kustom tidak boleh menimpa profil bawaan build; id-nya diberi akhiran. */
function amankanId(profil) {
  return BAWAAN_BUILD.has(profil.id) ? { ...profil, id: `${profil.id}-kustom` } : profil;
}

function bacaKustom() {
  if (!MODE_DEMO) return null;
  const teks = baca(KUNCI_KUSTOM);
  if (!teks) return null;
  const { profil } = bacaTeksProfil(teks);
  return profil ? amankanId(profil) : null;
}

function susunDaftar(kustom) {
  const daftar = new Map(BAWAAN_BUILD);
  if (kustom) daftar.set(kustom.id, kustom);
  return daftar;
}

/** Tulis profil ke dokumen: variabel CSS, tema, judul tab, favicon, warna bilah browser. */
export function terapkanProfil(profil, doc = document) {
  const akar = doc.documentElement;
  for (const [nama, nilai] of Object.entries(variabelCss(profil))) akar.style.setProperty(nama, nilai);
  akar.dataset.tema = profil.gaya.tema;
  akar.style.colorScheme = profil.gaya.tema === 'gelap' ? 'dark' : 'light';
  doc.title = `${profil.nama} — Lowongan Kerja`;
  doc.querySelector('link[rel="icon"]')?.setAttribute('href', profil.favicon);
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', profil.warna.utama);
}

export function profilAwal() {
  const daftar = susunDaftar(bacaKustom());
  const dariUrl = new URLSearchParams(window.location.search).get('profil');
  const id = pilihIdProfil({
    bawaan: env.VITE_PROFIL,
    demo: MODE_DEMO,
    dariUrl,
    dariPenyimpanan: baca(KUNCI_PILIHAN),
    tersedia: new Set(daftar.keys()),
  });
  // Profil dari ?profil= ikut disimpan, supaya pindah halaman (tanpa ?profil=) tidak kembali ke bawaan.
  if (MODE_DEMO && id === dariUrl) tulis(KUNCI_PILIHAN, id);
  if (env.VITE_PROFIL && !daftar.has(env.VITE_PROFIL)) {
    console.warn(`[profil] VITE_PROFIL="${env.VITE_PROFIL}" tidak ada di src/merek/profil; memakai "${id}"`);
  }
  return daftar.get(id);
}

const Konteks = createContext(null);

export function PenyediaProfil({ awal, children }) {
  const [profil, setProfil] = useState(awal ?? PROFIL_BAWAAN);
  const [kustom, setKustom] = useState(bacaKustom);
  // Draf dari editor yang sedang dilihat (belum disimpan). Menang atas profil aktif selama ada.
  const [pratinjau, setPratinjau] = useState(null);
  const tampil = pratinjau ?? profil;
  useEffect(() => {
    terapkanProfil(tampil);
  }, [tampil]);

  const aktifkan = useCallback((baru) => {
    terapkanProfil(baru);
    tulis(KUNCI_PILIHAN, baru.id);
    // Samakan ?profil= di alamat, supaya refresh dan tautan yang dibagikan menampilkan profil yang sama.
    const url = new URL(window.location.href);
    if (url.searchParams.has('profil')) {
      url.searchParams.set('profil', baru.id);
      window.history.replaceState(window.history.state, '', url);
    }
    setProfil(baru);
  }, []);

  const ganti = useCallback(
    (id) => {
      if (!MODE_DEMO) return; // di situs klien, profil terkunci
      const baru = susunDaftar(kustom).get(id);
      if (baru) aktifkan(baru);
    },
    [kustom, aktifkan],
  );

  /** Simpan profil buatan editor di browser ini dan langsung pakai. Mengembalikan false jika gagal. */
  const simpanKustom = useCallback(
    (mentah) => {
      if (!MODE_DEMO) return false;
      const { profil: valid } = validasiProfil(mentah);
      if (valid === PROFIL_BAWAAN) return false;
      const aman = amankanId(valid);
      if (!tulis(KUNCI_KUSTOM, JSON.stringify(aman))) return false;
      setKustom(aman);
      aktifkan(aman);
      return true;
    },
    [aktifkan],
  );

  const hapusKustom = useCallback(() => {
    tulis(KUNCI_KUSTOM, null);
    setKustom(null);
    if (kustom && profil.id === kustom.id) aktifkan(BAWAAN_BUILD.get(PROFIL_BAWAAN.id));
  }, [kustom, profil.id, aktifkan]);

  const nilai = useMemo(
    () => ({
      profil,
      tampil,
      setPratinjau,
      daftar: [...susunDaftar(kustom).values()],
      kustom,
      demo: MODE_DEMO,
      ganti,
      simpanKustom,
      hapusKustom,
    }),
    [profil, tampil, kustom, ganti, simpanKustom, hapusKustom],
  );
  return <Konteks.Provider value={nilai}>{children}</Konteks.Provider>;
}

export function useProfil() {
  const nilai = useContext(Konteks);
  if (!nilai) throw new Error('useProfil harus dipakai di dalam <PenyediaProfil>');
  return nilai;
}
