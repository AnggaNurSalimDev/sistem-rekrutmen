import { normalisasiSkill } from '../scoring/skills.js';
import { ambilPaket } from './paket/index.js';
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

const PENANDA_BADAN_USAHA = [
  'pt', 'cv', 'ud', 'pd', 'tbk', 'persero', 'perum', 'koperasi', 'yayasan', 'firma', 'inc', 'ltd', 'llc',
  'corp', 'corporation', 'company', 'co.', 'group', 'grup', 'gmbh', 'pte', 'sdn bhd',
];

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Penanda badan usaha bawaan + penanda dari paket (contoh "Indomaret", "kafe"). */
function buatPolaPenanda(tambahan) {
  const semua = [...new Set([...PENANDA_BADAN_USAHA, ...tambahan].map((t) => t.toLowerCase().trim()))]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map((t) => escapeRegex(t).replace(/\s+/g, '\\s+'));
  return new RegExp(`(?<![\\p{L}])(?:${semua.join('|')})(?![\\p{L}])`, 'iu');
}

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
function ambilPerusahaanBerpenanda(teks, { izinkanDi, penanda }) {
  const di = izinkanDi ? PENANDA_DI.exec(teks) : null;
  if (di) {
    const sesudahDi = bersihkan(di[1].split(PEMISAH_BAGIAN_BARIS)[0]);
    if (sesudahDi) return sesudahDi;
  }
  for (const bagian of teks.split(PEMISAH_BAGIAN_BARIS)) {
    if (penanda.test(bagian)) return bersihkan(bagian);
  }
  return null;
}

/** Baris tanpa rentang tanggal, untuk mencari nama perusahaan di baris yang sama. */
function sisaBaris(baris, rentang) {
  return bersihkan(baris.slice(0, rentang.awal) + ' | ' + baris.slice(rentang.akhir));
}

// ------------------------------------------------------------------ skill

/**
 * Kamus = skill lowongan (istilah HR) + skill dari paket.
 * Semua penulisan (nama + alias) dipetakan ke satu grup. Jika istilah HR
 * sama dengan salah satu penulisan di paket ("Cashier" vs paket "Kasir"),
 * grupnya memakai istilah HR, supaya hasil parser cocok dengan skill wajib
 * lowongan di scoring engine.
 */
function siapkanKamus(skillLowongan, daftarPaket) {
  const peta = new Map();
  const persis = new Map();
  const denganMiring = [];

  function tambah(tampil, penulisan, singkatan = []) {
    const kunci = penulisan.map(normalisasiSkill).filter(Boolean);
    if (kunci.length === 0) return;
    let grup = kunci.map((k) => peta.get(k)).find(Boolean);
    if (!grup) {
      grup = { tampil: tampil.trim() };
      if (grup.tampil.includes('/')) denganMiring.push(grup);
    }
    for (const k of kunci) if (!peta.has(k)) peta.set(k, grup);
    for (const t of singkatan) if (!persis.has(t)) persis.set(t, grup);
  }

  for (const s of skillLowongan) if (typeof s === 'string' && s.trim()) tambah(s, [s]);
  for (const paket of daftarPaket) {
    for (const s of paket.skill) tambah(s.nama, [s.nama, ...(s.alias ?? [])], s.persis ?? []);
  }
  return { peta, persis, denganMiring };
}

const POLA_KATA = /[\p{L}\p{N}][\p{L}\p{N}+#.]*/gu;
const BATAS_FRASA = /[\n,;/|•·()[\]]|\s[-–—]\s|\.(?:\s|$)/;

/** Kata beserta posisinya, dikelompokkan per frasa. */
function kataPerFrasa(teks) {
  const frasa = [];
  let sekarang = [];
  let akhirSebelum = 0;
  for (const m of teks.matchAll(POLA_KATA)) {
    const kata = m[0].replace(/\.+$/, '');
    const awal = m.index;
    if (sekarang.length > 0 && BATAS_FRASA.test(teks.slice(akhirSebelum, awal))) {
      frasa.push(sekarang);
      sekarang = [];
    }
    sekarang.push({ kata, awal, akhir: awal + kata.length });
    akhirSebelum = awal + kata.length;
  }
  if (sekarang.length > 0) frasa.push(sekarang);
  return frasa;
}

/**
 * 1–3 kata berurutan di dalam frasa yang sama dicocokkan ke kamus.
 *
 * Longest match: kata yang sudah menjadi bagian skill yang lebih panjang
 * tidak dipakai lagi ("Tailwind CSS" tidak ikut menghasilkan "CSS").
 *
 * Skill pendek (≤ 2 huruf setelah normalisasi, contoh "C", "Go") wajib
 * ditulis persis sama dengan nama tampilannya dan dicatat untuk ditinjau.
 * Singkatan di daftar "persis" paket (contoh "POS") juga wajib sama persis,
 * tapi tidak dicatat, karena paket sudah memutuskan singkatan itu aman.
 *
 * Setiap kemunculan dicatat sebagai sorotan, bukan hanya yang pertama.
 */
function cariSkill(teks, kamus) {
  const ditemukan = new Map();
  const skillPendek = new Set();
  const sorotan = [];
  const catat = (grup, awal, akhir) => {
    if (!ditemukan.has(grup)) ditemukan.set(grup, grup.tampil);
    sorotan.push({ awal, akhir, kategori: 'skill', label: grup.tampil });
  };

  // Skill dengan garis miring ("UI/UX") dicari utuh, karena garis miring
  // juga dipakai sebagai pemisah daftar ("React/Vue").
  for (const grup of kamus.denganMiring) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(grup.tampil)}(?![\\p{L}\\p{N}])`, 'giu');
    for (const m of teks.matchAll(re)) catat(grup, m.index, m.index + m[0].length);
  }

  for (const kata of kataPerFrasa(teks)) {
    const terpakai = new Array(kata.length).fill(false);
    for (let panjang = 3; panjang >= 1; panjang--) {
      for (let i = 0; i + panjang <= kata.length; i++) {
        if (terpakai.slice(i, i + panjang).some(Boolean)) continue;
        const asli = kata
          .slice(i, i + panjang)
          .map((k) => k.kata)
          .join(' ');

        let grup = kamus.persis.get(asli);
        if (!grup) {
          const normal = normalisasiSkill(asli);
          grup = normal ? kamus.peta.get(normal) : undefined;
          if (!grup) continue;
          if (normal.length <= 2) {
            // "Golang" → "go" lewat alias: bentuk panjangnya tidak ambigu.
            const bentukPanjang = asli.replace(/[^\p{L}\p{N}]/gu, '').length > 2;
            if (!bentukPanjang && asli !== grup.tampil) continue;
            if (!bentukPanjang) skillPendek.add(grup.tampil);
          }
        }

        terpakai.fill(true, i, i + panjang);
        catat(grup, kata[i].awal, kata[i + panjang - 1].akhir);
      }
    }
  }
  return { skills: [...ditemukan.values()], skillPendek: [...skillPendek], sorotan };
}

// ------------------------------------------------------------ kata kunci paket

function cariKataKunci(teks, daftarPaket) {
  const temuan = new Map();
  const sorotan = [];
  for (const paket of daftarPaket) {
    for (const k of paket.kataKunci ?? []) {
      for (const pola of k.pola) {
        for (const m of teks.matchAll(new RegExp(pola, 'giu'))) {
          if (m[0].length === 0) continue;
          sorotan.push({ awal: m.index, akhir: m.index + m[0].length, kategori: k.kategori, label: k.label });
          temuan.set(k.label, { label: k.label, kategori: k.kategori });
        }
      }
    }
  }
  return { temuanLain: [...temuan.values()], sorotan };
}

// ------------------------------------------------------------ riwayat kerja

/** Baris beserta posisi awalnya di teks asli (setelah spasi di depan). */
function pecahBaris(teks) {
  const hasil = [];
  let posisi = 0;
  for (const mentah of teks.split('\n')) {
    const spasiDepan = mentah.length - mentah.trimStart().length;
    hasil.push({ teks: mentah.trim(), offset: posisi + spasiDepan });
    posisi += mentah.length + 1;
  }
  return hasil;
}

function petakanBagian(baris) {
  let sekarang = null;
  return baris.map((b) => {
    const judul = bagianDariJudul(b.teks);
    if (judul) {
      sekarang = judul;
      return { ...b, bagian: judul, judul: true };
    }
    return { ...b, bagian: sekarang, judul: false };
  });
}

function cariRiwayatKerja(baris, { tahunMaks, penanda }) {
  const terpeta = petakanBagian(baris);
  const adaJudulPengalaman = terpeta.some((b) => b.judul && b.bagian === 'pengalaman');
  const adaJudul = terpeta.some((b) => b.judul);
  const sorotan = terpeta
    .filter((b) => b.judul)
    .map((b) => ({ awal: b.offset, akhir: b.offset + b.teks.length, kategori: 'bagian', label: b.teks }));

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
  //    Baris bullet tidak dihitung: deskripsi tugas ("menjaga kebersihan
  //    outlet") bisa memuat kata penanda tanpa menyebut tempat kerja.
  let skorAtas = 0;
  let skorBawah = 0;
  const berpenanda = (j) => j !== undefined && !AWALAN_BULLET.test(terpeta[j].teks) && penanda.test(terpeta[j].teks);
  for (const e of entriKerja) {
    if (berpenanda(tetangga(e.i, -1)[0])) skorAtas++;
    if (berpenanda(tetangga(e.i, 1)[0])) skorBawah++;
  }
  const urutanArah = skorAtas > skorBawah ? [-1, 1] : [1, -1];

  // 3. Nama perusahaan per entri.
  const terklaim = new Set();
  const riwayat = [];
  let jumlahDitebak = 0;
  let jumlahTahunSaja = 0;

  const sorot = (j, potongan, kategori, label) => {
    const di = terpeta[j].teks.indexOf(potongan);
    if (potongan && di >= 0) {
      const awal = terpeta[j].offset + di;
      sorotan.push({ awal, akhir: awal + potongan.length, kategori, label });
    }
  };

  for (const { i, rentang } of entriKerja) {
    const kandidatBaris = [
      { j: i, teks: sisaBaris(terpeta[i].teks, rentang) },
      ...urutanArah.flatMap((arah) => tetangga(i, arah).map((j) => ({ j, teks: terpeta[j].teks }))),
    ].filter((k) => k.j === i || !terklaim.has(k.j));

    let perusahaan = null;
    let barisPerusahaan = null;
    for (const k of kandidatBaris) {
      if (AWALAN_BULLET.test(k.teks)) continue;
      perusahaan = ambilPerusahaanBerpenanda(k.teks, { izinkanDi: k.j === i, penanda });
      if (perusahaan) {
        barisPerusahaan = k.j;
        if (k.j !== i) terklaim.add(k.j);
        break;
      }
    }

    if (!perusahaan) {
      const tebakan = kandidatBaris.find((k) => k.teks && !AWALAN_BULLET.test(k.teks));
      if (tebakan) {
        perusahaan = bersihkan(tebakan.teks.split(PEMISAH_BAGIAN_BARIS).filter(Boolean)[0] ?? '');
        barisPerusahaan = tebakan.j;
        if (tebakan.j !== i) terklaim.add(tebakan.j);
      }
      jumlahDitebak++;
    }

    if (rentang.tahunSaja) jumlahTahunSaja++;
    const data = { perusahaan: perusahaan || '(tidak terbaca)', mulai: rentang.mulai, selesai: rentang.selesai };
    riwayat.push(data);

    const awal = terpeta[i].offset + rentang.awal;
    sorotan.push({
      awal,
      akhir: terpeta[i].offset + rentang.akhir,
      kategori: 'tanggal',
      label: `${data.mulai} s/d ${data.selesai ?? 'sekarang'}`,
    });
    if (barisPerusahaan !== null) sorot(barisPerusahaan, perusahaan, 'perusahaan', data.perusahaan);
  }

  return { riwayat, adaJudul, adaJudulPengalaman, jumlahDitebak, jumlahTahunSaja, sorotan };
}

// --------------------------------------------------------------- sorotan

// Saat dua sorotan bertumpuk, yang lebih penting untuk skor dipertahankan.
const PRIORITAS = Object.freeze({
  tanggal: 6,
  perusahaan: 5,
  sertifikat: 4,
  ketersediaan: 4,
  skill: 3,
  jabatan: 2,
  bagian: 1,
});

/**
 * Sorotan tanpa tumpang tindih, urut posisi. Frontend cukup memotong teks
 * di setiap awal/akhir dan mewarnai potongannya; tidak perlu logika lain.
 */
export function rapikanSorotan(daftar) {
  const terpilih = [];
  const urut = [...daftar].sort(
    (a, b) => PRIORITAS[b.kategori] - PRIORITAS[a.kategori] || b.akhir - b.awal - (a.akhir - a.awal) || a.awal - b.awal,
  );
  for (const s of urut) {
    if (s.akhir <= s.awal) continue;
    if (terpilih.some((t) => s.awal < t.akhir && s.akhir > t.awal)) continue;
    terpilih.push(s);
  }
  return terpilih.sort((a, b) => a.awal - b.awal);
}

// ------------------------------------------------------------------ utama

/**
 * Teks CV → data mentah + sorotan untuk dilihat HR.
 * Tidak menghitung apa pun (total bulan dan skor dihitung scoring engine).
 *
 * @param {string} teks hasil ekstrakTeksPdf
 * @param {object} opsi
 * @param {string[]} [opsi.skillLowongan] skill wajib + opsional lowongan
 * @param {string[]} [opsi.paket] id paket kamus (contoh ['kru-outlet'])
 * @param {string} opsi.tanggalAcuan "YYYY-MM-DD" (tanggal lamaran); tahun di atasnya dianggap bukan tanggal
 * @returns {{skills, riwayatKerja, temuanLain, sorotan, keyakinan, alasanTinjau}}
 *   sorotan: [{awal, akhir, kategori, label}] — posisi karakter di `teks`
 */
export function parseCvRegex(teks, { skillLowongan = [], paket = [], tanggalAcuan } = {}) {
  if (typeof teks !== 'string') throw new Error('teks CV harus berupa string');
  if (!Array.isArray(skillLowongan)) throw new Error('skillLowongan harus berupa array');
  const tahunAcuan = Number(/^(\d{4})-\d{2}-\d{2}$/.exec(tanggalAcuan ?? '')?.[1]);
  if (!Number.isInteger(tahunAcuan)) throw new Error('tanggalAcuan wajib berformat YYYY-MM-DD');
  const daftarPaket = ambilPaket(paket);

  const penanda = buatPolaPenanda(daftarPaket.flatMap((p) => p.penandaPerusahaan ?? []));
  const skill = cariSkill(teks, siapkanKamus(skillLowongan, daftarPaket));
  const kataKunci = cariKataKunci(teks, daftarPaket);
  const kerja = cariRiwayatKerja(pecahBaris(teks), { tahunMaks: tahunAcuan + 1, penanda });

  const alasan = [];
  if (!kerja.adaJudulPengalaman) {
    alasan.push(
      kerja.adaJudul
        ? 'Judul bagian "Pengalaman Kerja" tidak ditemukan; hanya teks sebelum judul bagian pertama yang diperiksa.'
        : 'CV tidak punya judul bagian; riwayat kerja dicari di seluruh CV.',
    );
  }
  if (kerja.riwayat.length === 0) {
    alasan.push('Tidak ada riwayat kerja terdeteksi. Pastikan kandidat memang belum pernah bekerja.');
  }
  if (kerja.jumlahDitebak > 0) {
    alasan.push(`${kerja.jumlahDitebak} nama perusahaan hanya ditebak (tidak ada penanda seperti PT/CV/Inc).`);
  }
  if (kerja.jumlahTahunSaja > 0) {
    alasan.push(`${kerja.jumlahTahunSaja} rentang kerja hanya menyebut tahun; bulan diasumsikan Januari–Desember.`);
  }
  for (const s of skill.skillPendek) {
    alasan.push(`Skill pendek "${s}" ditemukan; pastikan bukan kata biasa.`);
  }
  if (skill.skills.length === 0) {
    alasan.push('Tidak ada skill dari kamus yang ditemukan.');
  }

  return {
    skills: skill.skills,
    riwayatKerja: kerja.riwayat,
    temuanLain: kataKunci.temuanLain,
    sorotan: rapikanSorotan([...skill.sorotan, ...kataKunci.sorotan, ...kerja.sorotan]),
    keyakinan: alasan.length === 0 ? 'tinggi' : 'rendah',
    alasanTinjau: alasan,
  };
}
