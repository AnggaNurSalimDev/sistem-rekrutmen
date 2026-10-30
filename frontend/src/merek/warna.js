/*
 * Hitungan warna untuk profil perusahaan. Fungsi murni: bisa diuji tanpa browser.
 *
 *   "#2b3a8f" ──hexKeRgb──▶ [43, 58, 143] ──campur / kontras──▶ angka ──rgbKeHex──▶ "#…"
 */

const POLA_HEX = /^#[0-9a-f]{6}$/i;

export function hexValid(nilai) {
  return typeof nilai === 'string' && POLA_HEX.test(nilai);
}

export function hexKeRgb(hex) {
  if (!hexValid(hex)) throw new TypeError(`Warna harus berformat #rrggbb, bukan ${JSON.stringify(hex)}`);
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

export function rgbKeHex(rgb) {
  if (!Array.isArray(rgb) || rgb.length !== 3) throw new TypeError('rgb harus [r, g, b]');
  return (
    '#' +
    rgb
      .map((n) => {
        if (!Number.isFinite(n)) throw new TypeError('Komponen rgb harus angka');
        return Math.round(Math.min(255, Math.max(0, n)))
          .toString(16)
          .padStart(2, '0');
      })
      .join('')
  );
}

/** Campur dua warna. `t = 0` → a, `t = 1` → b. */
export function campur(a, b, t) {
  if (!(t >= 0 && t <= 1)) throw new RangeError('t harus 0–1');
  const ra = hexKeRgb(a);
  const rb = hexKeRgb(b);
  return rgbKeHex(ra.map((n, i) => n + (rb[i] - n) * t));
}

/** Kecerahan relatif WCAG 2.x (0 = hitam, 1 = putih). */
export function kecerahan(hex) {
  const [r, g, b] = hexKeRgb(hex).map((n) => {
    const s = n / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rasio kontras WCAG, 1–21. */
export function kontras(a, b) {
  const [terang, gelap] = [kecerahan(a), kecerahan(b)].sort((x, y) => y - x);
  return (terang + 0.05) / (gelap + 0.05);
}

/** Putih atau hitam-pekat, mana yang lebih terbaca di atas `latar`. */
export function tintaDiAtas(latar) {
  const putih = '#ffffff';
  const hitam = '#111418';
  return kontras(putih, latar) >= kontras(hitam, latar) ? putih : hitam;
}

/**
 * Geser `warna` ke arah putih atau hitam (mana yang menjauhi `latar`) sedikit demi
 * sedikit sampai kontrasnya ≥ `target`. Warna yang sudah cukup dikembalikan apa adanya.
 *
 *   warna #2b3a8f, latar #171d27 (gelap), target 4.5
 *     t=0.00 → kontras 1.9  ✗
 *     t=0.05 → …
 *     t=0.55 → kontras 4.6  ✓ → dikembalikan
 */
export function sesuaikanKontras(warna, latar, target) {
  if (!(target >= 1 && target <= 21)) throw new RangeError('target kontras harus 1–21');
  if (kontras(warna, latar) >= target) return warna;
  const arah = kecerahan(latar) < 0.18 ? '#ffffff' : '#000000';
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const kandidat = campur(warna, arah, Math.min(1, t));
    if (kontras(kandidat, latar) >= target) return kandidat;
  }
  return arah;
}
