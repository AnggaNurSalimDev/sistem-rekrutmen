/**
 * Ke mana user diarahkan setelah masuk/daftar.
 *
 * `ke` berasal dari URL (?ke=/rekruter), jadi tidak bisa dipercaya:
 * - Hanya alamat di dalam aplikasi ini (cegah open redirect "?ke=https://...").
 * - Hanya halaman yang boleh dibuka peran itu. Tanpa cek ini, rekruter yang
 *   keluar dari /rekruter lalu orang lain masuk sebagai pelamar akan
 *   diarahkan ke /rekruter dan melihat "Halaman ini bukan untuk akun Anda".
 */

const AREA_PERAN = Object.freeze([
  { awalan: '/rekruter', peran: 'rekruter' },
  { awalan: '/lamaran', peran: 'kandidat' },
]);

export function berandaPeran(role) {
  return role === 'rekruter' ? '/rekruter' : '/';
}

export function bolehDibuka(path, role) {
  const area = AREA_PERAN.find((a) => path === a.awalan || path.startsWith(`${a.awalan}/`));
  return !area || area.peran === role;
}

export function tujuanSetelahMasuk(ke, role) {
  const aman = typeof ke === 'string' && ke.startsWith('/') && !ke.startsWith('//') && !ke.startsWith('/\\');
  if (aman && bolehDibuka(ke, role)) return ke;
  return berandaPeran(role);
}
