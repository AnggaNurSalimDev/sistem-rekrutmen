import { pastikan, angkaHingga } from './errors.js';

export const BATAS_OPSI = Object.freeze({ min: 2, max: 6 });

function teksTerisi(nilai) {
  return typeof nilai === 'string' && nilai.trim() !== '';
}

/**
 * Cek invariant satu soal pilihan ganda.
 * Dipakai di endpoint CRUD soal (rekruter) dan sebelum penilaian.
 */
export function validasiSoal(soal) {
  pastikan(soal && typeof soal === 'object', 'Data soal wajib ada', 'soal');
  const label = `Soal ${soal.id ?? '(tanpa id)'}`;

  pastikan(soal.id !== undefined && soal.id !== null, 'Setiap soal wajib punya id', 'soal');
  pastikan(teksTerisi(soal.pertanyaan), `${label}: pertanyaan tidak boleh kosong`, 'pertanyaan');

  pastikan(Array.isArray(soal.opsi), `${label}: opsi harus berupa array`, 'opsi');
  pastikan(
    soal.opsi.length >= BATAS_OPSI.min && soal.opsi.length <= BATAS_OPSI.max,
    `${label}: jumlah opsi harus ${BATAS_OPSI.min}–${BATAS_OPSI.max}`,
    'opsi',
  );

  const idOpsi = new Set();
  for (const opsi of soal.opsi) {
    pastikan(opsi?.id !== undefined && opsi?.id !== null, `${label}: setiap opsi wajib punya id`, 'opsi');
    pastikan(!idOpsi.has(opsi.id), `${label}: id opsi ganda (${opsi.id})`, 'opsi');
    pastikan(teksTerisi(opsi.teks), `${label}: teks opsi ${opsi.id} tidak boleh kosong`, 'opsi');
    idOpsi.add(opsi.id);
  }

  pastikan(idOpsi.has(soal.kunciOpsiId), `${label}: kunci jawaban harus salah satu id opsi`, 'kunciOpsiId');

  const poin = soal.poin ?? 1;
  pastikan(angkaHingga(poin) && poin > 0, `${label}: poin harus > 0`, 'poin');
}

/**
 * Menilai jawaban satu tes pilihan ganda saat ujian DIKIRIM.
 *
 * - Hanya soal aktif yang dihitung (aktif === false → dilewati).
 * - Soal aktif yang tidak dijawab, atau dijawab null, dihitung salah.
 * - Jawaban untuk soal yang tidak ada di tes, untuk soal nonaktif,
 *   atau dengan opsi yang tidak ada di soal → ditolak (tanda data rusak
 *   atau manipulasi dari browser).
 *
 * @param {Array} daftarSoal [{id, pertanyaan, opsi:[{id, teks}], kunciOpsiId, poin?, aktif?}]
 * @param {Array} daftarJawaban [{soalId, opsiDipilih | null}]
 * @returns {{skorPencapaian:number, poinBenar:number, poinTotal:number, rincian:Array}}
 */
export function nilaiJawabanPilihanGanda(daftarSoal, daftarJawaban) {
  pastikan(Array.isArray(daftarSoal), 'daftarSoal harus berupa array', 'soal');
  pastikan(Array.isArray(daftarJawaban), 'daftarJawaban harus berupa array', 'jawaban');

  const soalAktif = new Map();
  const idSemuaSoal = new Set();
  for (const soal of daftarSoal) {
    validasiSoal(soal);
    pastikan(!idSemuaSoal.has(soal.id), `id soal ganda: ${soal.id}`, 'soal');
    idSemuaSoal.add(soal.id);
    if (soal.aktif !== false) soalAktif.set(soal.id, soal);
  }
  pastikan(soalAktif.size > 0, 'Tes tidak punya soal aktif', 'soal');

  const jawabanPerSoal = new Map();
  for (const jawaban of daftarJawaban) {
    const soal = soalAktif.get(jawaban?.soalId);
    pastikan(soal, `Jawaban untuk soal ${jawaban?.soalId} tidak valid (soal tidak ada atau nonaktif)`, 'jawaban');
    pastikan(!jawabanPerSoal.has(jawaban.soalId), `Jawaban ganda untuk soal ${jawaban.soalId}`, 'jawaban');

    const dipilih = jawaban.opsiDipilih ?? null;
    pastikan(
      dipilih === null || soal.opsi.some((opsi) => opsi.id === dipilih),
      `Opsi ${dipilih} tidak ada di soal ${soal.id}`,
      'jawaban',
    );
    jawabanPerSoal.set(jawaban.soalId, dipilih);
  }

  let poinBenar = 0;
  let poinTotal = 0;
  const rincian = [];

  for (const soal of soalAktif.values()) {
    const poin = soal.poin ?? 1;
    const dipilih = jawabanPerSoal.get(soal.id) ?? null;
    const benar = dipilih !== null && dipilih === soal.kunciOpsiId;

    poinTotal += poin;
    if (benar) poinBenar += poin;
    rincian.push({ soalId: soal.id, opsiDipilih: dipilih, benar, poin });
  }

  return {
    skorPencapaian: (poinBenar / poinTotal) * 100,
    poinBenar,
    poinTotal,
    rincian,
  };
}

/**
 * Versi soal yang aman dikirim ke browser kandidat:
 * kunci jawaban dan status internal dibuang, soal nonaktif tidak disertakan.
 */
export function soalUntukKandidat(daftarSoal) {
  pastikan(Array.isArray(daftarSoal), 'daftarSoal harus berupa array', 'soal');
  return daftarSoal
    .filter((soal) => soal.aktif !== false)
    .sort((a, b) => (a.urutan ?? 0) - (b.urutan ?? 0))
    .map((soal) => ({
      id: soal.id,
      pertanyaan: soal.pertanyaan,
      opsi: soal.opsi.map((opsi) => ({ id: opsi.id, teks: opsi.teks })),
    }));
}
