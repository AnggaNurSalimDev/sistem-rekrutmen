/*
 * Menyambungkan profil ke React dan ke <html>.
 *
 *   VITE_PROFIL ─┐
 *   ?profil=     ├─ pilihIdProfil ─▶ id ─▶ DAFTAR[id] ─▶ terapkanProfil(document)
 *   localStorage ┘   (dua sumber terakhir hanya di mode demo)      │
 *                                                                  ▼
 *                                         useProfil() → { profil, daftar, demo, ganti }
 */
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { PROFIL_BAWAAN, pilihIdProfil, validasiProfil, variabelCss } from './profil.js';

const KUNCI_SIMPAN = 'profil-demo';
const env = import.meta.env ?? {};
export const MODE_DEMO = env.VITE_MODE_DEMO === 'true';

// Semua file di ./profil dimuat saat build. Profil yang rusak dicatat dan dilewati.
const berkas = import.meta.glob('./profil/*.json', { eager: true, import: 'default' });
const DAFTAR = new Map([[PROFIL_BAWAAN.id, PROFIL_BAWAAN]]);
for (const [path, mentah] of Object.entries(berkas)) {
  const { profil, masalah } = validasiProfil(mentah);
  if (masalah.length) console.warn(`[profil] ${path}:\n- ${masalah.join('\n- ')}`);
  if (profil === PROFIL_BAWAAN && mentah?.id !== PROFIL_BAWAAN.id) continue; // id rusak → dilewati
  if (DAFTAR.has(profil.id) && profil.id !== PROFIL_BAWAAN.id) console.warn(`[profil] id "${profil.id}" dipakai dua kali; ${path} menimpa yang lama`);
  DAFTAR.set(profil.id, profil);
}

function bacaSimpanan() {
  try {
    return window.localStorage.getItem(KUNCI_SIMPAN);
  } catch {
    return null;
  }
}
function simpan(id) {
  try {
    window.localStorage.setItem(KUNCI_SIMPAN, id);
  } catch {
    /* penyimpanan tidak tersedia (mode privat, iframe): pilihan hanya berlaku sampai refresh */
  }
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
  const dariUrl = new URLSearchParams(window.location.search).get('profil');
  const id = pilihIdProfil({
    bawaan: env.VITE_PROFIL,
    demo: MODE_DEMO,
    dariUrl,
    dariPenyimpanan: bacaSimpanan(),
    tersedia: new Set(DAFTAR.keys()),
  });
  // Profil dari ?profil= ikut disimpan, supaya pindah halaman (tanpa ?profil=) tidak kembali ke bawaan.
  if (MODE_DEMO && id === dariUrl) simpan(id);
  if (env.VITE_PROFIL && !DAFTAR.has(env.VITE_PROFIL)) {
    console.warn(`[profil] VITE_PROFIL="${env.VITE_PROFIL}" tidak ada di src/merek/profil; memakai "${id}"`);
  }
  return DAFTAR.get(id);
}

const Konteks = createContext(null);

export function PenyediaProfil({ awal, children }) {
  const [profil, setProfil] = useState(awal ?? PROFIL_BAWAAN);

  const ganti = useCallback((id) => {
    if (!MODE_DEMO) return; // di situs klien, profil terkunci
    const baru = DAFTAR.get(id);
    if (!baru) return;
    terapkanProfil(baru);
    simpan(id);
    // Samakan ?profil= di alamat, supaya refresh dan tautan yang dibagikan menampilkan profil yang sama.
    const url = new URL(window.location.href);
    if (url.searchParams.has('profil')) {
      url.searchParams.set('profil', id);
      window.history.replaceState(window.history.state, '', url);
    }
    setProfil(baru);
  }, []);

  const nilai = useMemo(
    () => ({ profil, daftar: [...DAFTAR.values()], demo: MODE_DEMO, ganti }),
    [profil, ganti],
  );
  return <Konteks.Provider value={nilai}>{children}</Konteks.Provider>;
}

export function useProfil() {
  const nilai = useContext(Konteks);
  if (!nilai) throw new Error('useProfil harus dipakai di dalam <PenyediaProfil>');
  return nilai;
}
