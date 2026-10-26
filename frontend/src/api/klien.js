export const BASE_URL = (import.meta.env?.VITE_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/** Error dari backend dengan bentuk { error: { kode, pesan, detail? } }. */
export class ErrorApi extends Error {
  constructor(status, kode, pesan, detail = []) {
    super(pesan);
    this.name = 'ErrorApi';
    this.status = status;
    this.kode = kode;
    this.detail = detail;
  }

  /** Pesan per field dari validasi backend: { email: 'Email tidak valid', ... }. */
  get perField() {
    return Object.fromEntries(this.detail.filter((d) => d.field).map((d) => [d.field, d.pesan]));
  }
}

/**
 * Pembungkus fetch. Mengirim JSON atau FormData, menambahkan token,
 * dan mengubah respons error menjadi ErrorApi dengan pesan yang bisa
 * langsung ditampilkan.
 */
export async function panggil(path, { method = 'GET', body, form, token, fetchFn = globalThis.fetch } = {}) {
  if (typeof path !== 'string' || !path.startsWith('/')) throw new Error('path harus diawali "/"');
  if (body !== undefined && form !== undefined) throw new Error('pakai body atau form, bukan keduanya');

  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  let isi;
  if (form) {
    isi = form; // browser mengatur Content-Type multipart beserta boundary-nya
  } else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    isi = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetchFn(`${BASE_URL}${path}`, { method, headers, body: isi });
  } catch {
    throw new ErrorApi(0, 'JARINGAN', 'Tidak bisa terhubung ke server. Periksa koneksi internet, lalu coba lagi.');
  }

  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error;
    throw new ErrorApi(
      res.status,
      e?.kode ?? 'TIDAK_DIKENAL',
      e?.pesan ?? `Server mengembalikan error ${res.status}`,
      Array.isArray(e?.detail) ? e.detail : [],
    );
  }
  return data;
}
