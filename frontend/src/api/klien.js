export const BASE_URL = (import.meta.env?.VITE_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

// Mode simulasi: tidak ada backend sama sekali. Semua "permintaan" dijawab di
// browser sendiri lewat simulasi/router.js (lihat simulasi/README.md untuk alasannya).
// import() dinamis supaya kode simulasi (termasuk data contoh) tidak ikut terbundel
// ke situs klien sungguhan, yang selalu memakai backend asli.
export const MODE_SIMULASI = import.meta.env?.VITE_SIMULASI === 'true';
let modulSimulasi = null;
async function panggilSimulasi(path, { method, body, form, token }) {
  modulSimulasi ??= await import('../simulasi/router.js');
  const { status, data } = await modulSimulasi.routeSimulasi(path, method, { body, form, token });
  return { status, ok: status >= 200 && status < 300, json: async () => data };
}

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
  if (MODE_SIMULASI) {
    res = await panggilSimulasi(path, { method, body, form, token });
  } else {
    try {
      res = await fetchFn(`${BASE_URL}${path}`, { method, headers, body: isi });
    } catch {
      throw new ErrorApi(0, 'JARINGAN', 'Tidak bisa terhubung ke server. Periksa koneksi internet, lalu coba lagi.');
    }
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
