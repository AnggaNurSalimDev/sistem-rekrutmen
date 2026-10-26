import { normalisasiSkill } from '../scoring/skills.js';
import { KAMUS_SKILL_UMUM } from './kamusSkill.js';
import { cariRentangTanggal } from './tanggal.js';

// ---------------------------------------------------------------- bagian CV

const JUDUL = Object.freeze({
  pengalaman: [
    'pengalaman', 'pengalaman kerja', 'pengalaman bekerja', 'pengalaman profesional', 'riwayat kerja',
    'riwayat pekerjaan', 'riwayat pengalaman kerja', 'work experience', 'experience', 'professional experience',
    'working experience', 'employment', 'employment history', 'career history', 'work history',
  ],
  pendidikan: [
    'pendidikan', 'riwayat pendidikan', 'pendidikan formal', 'latar belakang pendidikan', 'education',
    'educational background', 'academic background',
  ],
  lain: [
    'keahlian', 'skill', 'skills', 'kemampuan', 'keterampilan', 'soft skills', 'hard skills', 'technical skills',
    'sertifikasi', 'sertifikat', 'certifications', 'certificates', 'pelatihan', 'kursus', 'training', 'courses',
    'organisasi', 'pengalaman organisasi', 'organizational experience', 'kegiatan', 'volunteer',
    'proyek', 'projects', 'portofolio', 'portfolio', 'penghargaan', 'prestasi', 'awards', 'achievements',
    'bahasa', 'languages', 'profil', 'profile', 'ringkasan', 'summary', 'tentang saya', 'about me',
    'data diri', 'data pribadi', 'kontak', 'contact', 'referensi', 'references', 'minat', 'interests', 'hobi',
  ],
});

const PETA_JUDUL = new Map(
  Object.entries(JUDUL).flatMap(([bagian, daftar]) => daftar.map((judul) => [judul, bagian])),
);

/** "2. PENGALAMAN KERJA:" → "pengalaman kerja". */
function bagianDariJudul(baris) {
  if (baris.length > 40) return null;
  const bersih = baris
    .toLowerCase()
    .replace(/^[\s\d.)\-•*#|]+/, '')
    .replace(/[\s:|\-–—]+$/, '')
    .replace(/\s+/g, ' ');
  return PETA_JUDUL.get(bersih) ?? null;
}

// ------------------------------------------------------- nama perusahaan

const PENANDA_BADAN_USAHA =
  /(?<![\p{L}])(pt|cv|ud|pd|tbk|persero|perum|koperasi|yayasan|firma|inc|ltd|llc|corp|corporation|company|co\.|group|grup|gmbh|pte|sdn bhd)(?![\p{L}])/iu;
const PENANDA_DI = /(?:^|\s)(?:at|di|@)\s+(.+)$/i;
const POLA_PENDIDIKAN =
  /(?<![\p{L}])(universitas|university|institut|institute|politeknik|polytechnic|sekolah|school|college|akademi|sma|smk|smp|ma|s1|s2|s3|d3|d4|sarjana|bachelor|master|jurusan|ipk|gpa)(?![\p{L}])/iu;
const AWALAN_BULLET = /^[-•*·▪●◦]\s*/;

const PEMISAH_BAGIAN_BARIS = /\s*(?:\||•|·|,|\s[-–—]\s)\s*/;

function bersihkan(teks) {
  return teks.replace(/^[\s|,:;\-–—•·]+|[\s|,:;\-–—•·]+$/g, '').replace(/\s{2,}/g, ' ');
}

/**
 * Bagian teks yang memuat penanda badan usaha, atau null.
 * Penanda "di/at/@" hanya dipakai di baris tanggal itu sendiri; di baris
 * deskripsi kata "di" terlalu umum ("bertanggung jawab di gudang").
 */
function ambilPerusahaanBerpenanda(teks, { izinkanDi }) {
  const di = izinkanDi ? PENANDA_DI.exec(teks) : null;
  if (di) {
    const sesudahDi = bersihkan(di[1].split(PEMISAH_BAGIAN_BARIS)[0]);
    if (sesudahDi) return sesudahDi;
  }
  for (const bagian of teks.split(PEMISAH_BAGIAN_BARIS)) {
    if (PENANDA_BADAN_USAHA.test(bagian)) return bersihkan(bagian);
  }
  return null;
}

/** Baris tanpa rentang tanggal, untuk mencari nama perusahaan di baris yang sama. */
function sisaBaris(baris, rentang) {
  return bersihkan(baris.slice(0, rentang.awal) + ' | ' + baris.slice(rentang.akhir));
}

// ------------------------------------------------------------------ skill

function siapkanKamus(skillTambahan) {
  const kamus = new Map();
  for (const tampil of [...skillTambahan, ...KAMUS_SKILL_UMUM]) {
    if (typeof tampil !== 'string') continue;
    const normal = normalisasiSkill(tampil);
    if (normal && !kamus.has(normal)) kamus.set(normal, tampil.trim());
  }
  return kamus;
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Teks dipecah per frasa (koma, titik koma, garis miring, baris, bullet),
 * lalu 1–3 kata berurutan di dalam frasa yang sama dicocokkan ke kamus.
 *
 * Longest match: kata yang sudah menjadi bagian skill yang lebih panjang
 * tidak dipakai lagi ("Tailwind CSS" tidak ikut menghasilkan "CSS",
 * "React Native" tidak ikut menghasilkan "React").
 *
 * Skill pendek (≤ 2 huruf setelah normalisasi, contoh "C", "R", "Go") wajib
 * ditulis persis sama dengan kamus, karena rawan salah tangkap.
 */
function cariSkill(teks, kamus) {
  const ditemukan = new Map();
  const skillPendek = new Set();

  // Skill yang memuat garis miring ("UI/UX", "CI/CD") dicari utuh lebih dulu,
  // karena di langkah berikutnya garis miring dipakai sebagai pemisah daftar.
  for (const [normal, tampil] of kamus) {
    if (!tampil.includes('/')) continue;
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(tampil)}(?![\\p{L}\\p{N}])`, 'iu');
    if (re.test(teks)) ditemukan.set(normal, tampil);
  }

  const frasa = teks.split(/[\n,;/|•·()[\]]+|\s[-–—]\s|\.\s/);
  for (const f of frasa) {
    const kata = f.match(/[\p{L}\p{N}][\p{L}\p{N}+#.]*/gu) ?? [];
    const bersih = kata.map((k) => k.replace(/\.+$/, ''));
    const terpakai = new Array(bersih.length).fill(false);

    for (let panjang = 3; panjang >= 1; panjang--) {
      for (let i = 0; i + panjang <= bersih.length; i++) {
        if (terpakai.slice(i, i + panjang).some(Boolean)) continue;
        const asli = bersih.slice(i, i + panjang).join(' ');
        const normal = normalisasiSkill(asli);
        if (!normal || !kamus.has(normal)) continue;

        const tampil = kamus.get(normal);
        let pendek = false;
        if (normal.length <= 2) {
          // "Golang" → "go" lewat alias: bentuk panjangnya tidak ambigu.
          const bentukPanjang = asli.replace(/[^\p{L}\p{N}]/gu, '').length > 2;
          if (!bentukPanjang && asli !== tampil) continue;
          pendek = !bentukPanjang;
        }

        terpakai.fill(true, i, i + panjang);
        if (ditemukan.has(normal)) continue;
        if (pendek) skillPendek.add(tampil);
        ditemukan.set(normal, tampil);
      }
    }
  }
  return { skills: [...ditemukan.values()], skillPendek: [...skillPendek] };
}

// ------------------------------------------------------------ riwayat kerja

function petakanBagian(baris) {
  let sekarang = null;
  return baris.map((b) => {
    const judul = bagianDariJudul(b);
    if (judul) {
      sekarang = judul;
      return { teks: b, bagian: judul, judul: true };
    }
    return { teks: b, bagian: sekarang, judul: false };
  });
}

function cariRiwayatKerja(baris, tahunMaks) {
  const terpeta = petakanBagian(baris);
  const adaJudulPengalaman = terpeta.some((b) => b.judul && b.bagian === 'pengalaman');
  const adaJudul = terpeta.some((b) => b.judul);

  // 1. Kumpulkan rentang tanggal yang termasuk riwayat kerja.
  //    - Ada judul "Pengalaman": hanya bagian itu.
  //    - Ada judul lain saja: hanya teks sebelum judul pertama (bagian
  //      organisasi, pendidikan, dst. tidak pernah dihitung sebagai kerja).
  //    - Tanpa judul sama sekali: seluruh teks, lalu disaring pola pendidikan.
  const entri = [];
  terpeta.forEach((b, i) => {
    if (b.judul) return;
    if (adaJudulPengalaman && b.bagian !== 'pengalaman') return;
    if (!adaJudulPengalaman && b.bagian !== null) return;

    for (const rentang of cariRentangTanggal(b.teks, { tahunMaks })) {
      entri.push({ i, rentang });
    }
  });

  const barisRentang = new Set(entri.map((e) => e.i));

  // Baris tetangga dalam satu blok: berhenti di judul atau baris rentang lain.
  const tetangga = (i, arah) => {
    const hasil = [];
    for (let j = i + arah; j >= 0 && j < terpeta.length && hasil.length < 2; j += arah) {
      if (terpeta[j].judul || barisRentang.has(j)) break;
      if (terpeta[j].teks === '') continue;
      hasil.push(j);
    }
    return hasil;
  };

  // Tanpa judul sama sekali: buang entri yang jelas pendidikan.
  const entriKerja = adaJudul
    ? entri
    : entri.filter((e) => {
        const blok = [e.i, ...tetangga(e.i, -1), ...tetangga(e.i, 1)];
        return !blok.some((j) => POLA_PENDIDIKAN.test(terpeta[j].teks));
      });

  // 2. Arah dominan letak nama perusahaan (di atas atau di bawah tanggal).
  let skorAtas = 0;
  let skorBawah = 0;
  for (const e of entriKerja) {
    const atas = tetangga(e.i, -1)[0];
    const bawah = tetangga(e.i, 1)[0];
    if (atas !== undefined && PENANDA_BADAN_USAHA.test(terpeta[atas].teks)) skorAtas++;
    if (bawah !== undefined && PENANDA_BADAN_USAHA.test(terpeta[bawah].teks)) skorBawah++;
  }
  const urutanArah = skorAtas > skorBawah ? [-1, 1] : [1, -1];

  // 3. Nama perusahaan per entri.
  const terklaim = new Set();
  const riwayat = [];
  let jumlahDitebak = 0;
  let jumlahTahunSaja = 0;

  for (const { i, rentang } of entriKerja) {
    const kandidatBaris = [
      { j: i, teks: sisaBaris(terpeta[i].teks, rentang) },
      ...urutanArah.flatMap((arah) => tetangga(i, arah).map((j) => ({ j, teks: terpeta[j].teks }))),
    ].filter((k) => k.j === i || !terklaim.has(k.j));

    let perusahaan = null;
    for (const k of kandidatBaris) {
      if (AWALAN_BULLET.test(k.teks)) continue;
      perusahaan = ambilPerusahaanBerpenanda(k.teks, { izinkanDi: k.j === i });
      if (perusahaan) {
        if (k.j !== i) terklaim.add(k.j);
        break;
      }
    }

    if (!perusahaan) {
      const tebakan = kandidatBaris.find((k) => k.teks && !AWALAN_BULLET.test(k.teks));
      if (tebakan) {
        perusahaan = bersihkan(tebakan.teks.split(PEMISAH_BAGIAN_BARIS).filter(Boolean)[0] ?? '');
        if (tebakan.j !== i) terklaim.add(tebakan.j);
      }
      jumlahDitebak++;
    }

    if (rentang.tahunSaja) jumlahTahunSaja++;
    riwayat.push({ perusahaan: perusahaan || '(tidak terbaca)', mulai: rentang.mulai, selesai: rentang.selesai });
  }

  return { riwayat, adaJudul, adaJudulPengalaman, jumlahDitebak, jumlahTahunSaja };
}

// ------------------------------------------------------------------ utama

/**
 * Teks CV → data mentah dengan bentuk yang sama seperti parser AI.
 * Tidak menghitung apa pun (total bulan dan skor dihitung scoring engine).
 *
 * @param {string} teks hasil ekstrakTeksPdf
 * @param {object} opsi
 * @param {string[]} [opsi.skillLowongan] skill wajib + opsional lowongan, ditambahkan ke kamus
 * @param {string} opsi.tanggalAcuan "YYYY-MM-DD" (tanggal lamaran); tahun di atasnya dianggap bukan tanggal
 */
export function parseCvRegex(teks, { skillLowongan = [], tanggalAcuan } = {}) {
  if (typeof teks !== 'string') throw new Error('teks CV harus berupa string');
  if (!Array.isArray(skillLowongan)) throw new Error('skillLowongan harus berupa array');
  const tahunAcuan = Number(/^(\d{4})-\d{2}-\d{2}$/.exec(tanggalAcuan ?? '')?.[1]);
  if (!Number.isInteger(tahunAcuan)) throw new Error('tanggalAcuan wajib berformat YYYY-MM-DD');

  const baris = teks.split('\n').map((b) => b.trim());
  const { skills, skillPendek } = cariSkill(teks, siapkanKamus(skillLowongan));
  const { riwayat, adaJudul, adaJudulPengalaman, jumlahDitebak, jumlahTahunSaja } = cariRiwayatKerja(
    baris,
    tahunAcuan + 1,
  );

  const alasan = [];
  if (!adaJudulPengalaman) {
    alasan.push(
      adaJudul
        ? 'Judul bagian "Pengalaman Kerja" tidak ditemukan; hanya teks sebelum judul bagian pertama yang diperiksa.'
        : 'CV tidak punya judul bagian; riwayat kerja dicari di seluruh CV.',
    );
  }
  if (riwayat.length === 0) {
    alasan.push('Tidak ada riwayat kerja terdeteksi. Pastikan kandidat memang belum pernah bekerja.');
  }
  if (jumlahDitebak > 0) {
    alasan.push(`${jumlahDitebak} nama perusahaan hanya ditebak (tidak ada penanda seperti PT/CV/Inc).`);
  }
  if (jumlahTahunSaja > 0) {
    alasan.push(`${jumlahTahunSaja} rentang kerja hanya menyebut tahun; bulan diasumsikan Januari–Desember.`);
  }
  for (const s of skillPendek) {
    alasan.push(`Skill pendek "${s}" ditemukan; pastikan bukan kata biasa.`);
  }
  if (skills.length === 0) {
    alasan.push('Tidak ada skill dari kamus yang ditemukan.');
  }

  return {
    skills,
    riwayatKerja: riwayat,
    keyakinan: alasan.length === 0 ? 'tinggi' : 'rendah',
    alasanTinjau: alasan,
  };
}
