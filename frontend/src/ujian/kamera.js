/**
 * Kamera hanya sebagai pengingat bahwa ujian diawasi (psychological deterrent).
 * Video TIDAK direkam dan TIDAK dikirim; yang dikirim hanya statusnya.
 * Apa pun hasilnya, ujian tetap bisa dikerjakan.
 */

export const STATUS_KAMERA = Object.freeze(['granted', 'denied', 'hardware_not_found', 'not_supported']);

/** Error getUserMedia → status yang dikirim ke backend. */
export function statusDariError(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
    case 'PermissionDeniedError':
      return 'denied';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
    case 'NotReadableError': // kamera ada tapi sedang dipakai aplikasi lain / rusak
    case 'TrackStartError':
      return 'hardware_not_found';
    default:
      return 'not_supported';
  }
}

/**
 * @returns {Promise<{status: string, stream: MediaStream | null}>}
 */
export async function mintaKamera(mediaDevices = globalThis.navigator?.mediaDevices) {
  if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') {
    return { status: 'not_supported', stream: null };
  }
  try {
    const stream = await mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: false });
    return { status: 'granted', stream };
  } catch (err) {
    return { status: statusDariError(err), stream: null };
  }
}

export function hentikanKamera(stream) {
  stream?.getTracks?.().forEach((t) => t.stop());
}

/**
 * Status yang dikirim saat jawaban dikirim. Jika kandidat belum menjawab
 * pertanyaan izin browser sampai akhir ujian, dianggap tidak diizinkan.
 */
export function statusUntukDikirim(status) {
  return STATUS_KAMERA.includes(status) ? status : 'denied';
}
