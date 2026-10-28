/**
 * Format tanggal untuk ditampilkan: "2026-10-27T03:00:00Z" → "27 Oktober 2026".
 *
 * `new Date('teks rusak')` TIDAK melempar error; hasilnya tanggal tidak valid,
 * dan toLocaleDateString lalu menulis "Invalid Date". Karena itu validitasnya
 * dicek eksplisit, bukan dengan try/catch. Input tidak valid → string kosong.
 */
export function formatTanggal(iso) {
  if (iso === null || iso === undefined || iso === '') return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}
