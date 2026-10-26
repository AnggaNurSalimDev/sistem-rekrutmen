import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { panggil } from '../api/klien.js';

const KUNCI_TOKEN = 'rekrut.token';
const KonteksAuth = createContext(null);

// localStorage bisa melempar (mode privat, situs diblokir); aplikasi tetap jalan tanpa ingat login.
const simpan = {
  ambil() {
    try {
      return localStorage.getItem(KUNCI_TOKEN);
    } catch {
      return null;
    }
  },
  set(token) {
    try {
      if (token) localStorage.setItem(KUNCI_TOKEN, token);
      else localStorage.removeItem(KUNCI_TOKEN);
    } catch {
      /* diabaikan */
    }
  },
};

export function PenyediaAuth({ children }) {
  const [token, setToken] = useState(() => simpan.ambil());
  const [user, setUser] = useState(null);
  const [memuat, setMemuat] = useState(Boolean(token));

  useEffect(() => {
    if (!token) {
      setUser(null);
      setMemuat(false);
      return;
    }
    let batal = false;
    panggil('/auth/me', { token })
      .then((r) => !batal && setUser(r.user))
      .catch(() => {
        if (batal) return;
        // Token kedaluwarsa/tidak valid → keluar diam-diam.
        simpan.set(null);
        setToken(null);
      })
      .finally(() => !batal && setMemuat(false));
    return () => {
      batal = true;
    };
  }, [token]);

  const masukDengan = useCallback((hasil) => {
    simpan.set(hasil.token);
    setUser(hasil.user);
    setToken(hasil.token);
  }, []);

  const keluar = useCallback(() => {
    simpan.set(null);
    setUser(null);
    setToken(null);
  }, []);

  /** panggil() yang otomatis membawa token. */
  const api = useCallback((path, opsi = {}) => panggil(path, { ...opsi, token }), [token]);

  const nilai = useMemo(() => ({ token, user, memuat, masukDengan, keluar, api }), [token, user, memuat, masukDengan, keluar, api]);
  return <KonteksAuth.Provider value={nilai}>{children}</KonteksAuth.Provider>;
}

export function useAuth() {
  const k = useContext(KonteksAuth);
  if (!k) throw new Error('useAuth harus dipakai di dalam PenyediaAuth');
  return k;
}
