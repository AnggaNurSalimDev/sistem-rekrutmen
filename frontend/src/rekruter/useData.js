import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';

/**
 * Ambil data GET dengan token rekruter. Respons yang datang setelah
 * komponen pindah halaman (atau path berganti) diabaikan.
 * `muatUlang()` mengambil ulang tanpa mengosongkan data lama, supaya
 * layar tidak berkedip setelah menyimpan.
 */
export function useData(path) {
  const { api } = useAuth();
  const [keadaan, setKeadaan] = useState({ data: null, galat: null, path: null });
  const [putaran, setPutaran] = useState(0);

  useEffect(() => {
    if (!path) return undefined;
    let batal = false;
    api(path)
      .then((r) => !batal && setKeadaan({ data: r.data, galat: null, path }))
      .catch((e) => !batal && setKeadaan((k) => ({ data: k.path === path ? k.data : null, galat: e, path })));
    return () => {
      batal = true;
    };
  }, [api, path, putaran]);

  const muatUlang = useCallback(() => setPutaran((n) => n + 1), []);
  const cocok = keadaan.path === path;
  return {
    data: cocok ? keadaan.data : null,
    galat: cocok ? keadaan.galat : null,
    memuat: !cocok,
    muatUlang,
    setData: (fn) => setKeadaan((k) => ({ ...k, data: typeof fn === 'function' ? fn(k.data) : fn })),
  };
}
