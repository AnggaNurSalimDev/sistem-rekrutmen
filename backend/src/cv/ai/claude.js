import { buatPromptCv } from './prompt.js';
import { TOOL_HASIL_CV } from './skema.js';

export const BAWAAN_CLAUDE = Object.freeze({
  url: 'https://api.anthropic.com/v1/messages',
  model: 'claude-haiku-5-5',
  versiApi: '2026-10-21',
  timeoutMs: 30_000,
  maxTokens: 4096,
});

/** Error dari parser AI. bisaDiulang = false untuk error yang pasti terulang (key salah, request salah). */
export class ErrorParserAi extends Error {
  constructor(message, { status = null, bisaDiulang = true } = {}) {
    super(message);
    this.name = 'ErrorParserAi';
    this.status = status;
    this.bisaDiulang = bisaDiulang;
  }
}

/**
 * Membuat fungsi parser AI yang memanggil Claude Messages API.
 * Output dipaksa lewat tool (tool_choice), jadi selalu berupa data terstruktur.
 * Tidak mengirim temperature/top_p/top_k (ditolak di versi API 2026-10-21).
 *
 * API key tidak pernah dimasukkan ke pesan error atau log.
 *
 * @returns {(teks: string, opsi: {skillLowongan?: string[]}) => Promise<object>} input tool mentah
 */
export function buatParserClaude({
  apiKey,
  model = BAWAAN_CLAUDE.model,
  versiApi = BAWAAN_CLAUDE.versiApi,
  timeoutMs = BAWAAN_CLAUDE.timeoutMs,
  maxTokens = BAWAAN_CLAUDE.maxTokens,
  url = BAWAAN_CLAUDE.url,
  fetchFn = globalThis.fetch,
} = {}) {
  if (typeof apiKey !== 'string' || apiKey.trim() === '') throw new Error('apiKey Claude wajib diisi');
  if (typeof fetchFn !== 'function') throw new Error('fetch tidak tersedia');
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error('timeoutMs harus bilangan bulat > 0');
  if (!Number.isInteger(maxTokens) || maxTokens <= 0) throw new Error('maxTokens harus bilangan bulat > 0');

  return async function parserClaude(teks, { skillLowongan = [] } = {}) {
    const prompt = buatPromptCv({ teks, skillLowongan });
    const body = {
      model,
      max_tokens: maxTokens,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      tools: [TOOL_HASIL_CV],
      tool_choice: { type: 'tool', name: TOOL_HASIL_CV.name },
    };

    const pembatal = new AbortController();
    const timer = setTimeout(() => pembatal.abort(), timeoutMs);
    let res;
    try {
      res = await fetchFn(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'anthropic-version': versiApi,
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: pembatal.signal,
      });
    } catch (err) {
      if (err?.name === 'AbortError') throw new ErrorParserAi(`Claude API tidak merespons dalam ${timeoutMs} ms`);
      throw new ErrorParserAi('Gagal menghubungi Claude API (jaringan)');
    } finally {
      clearTimeout(timer);
    }

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const pesan = typeof data?.error?.message === 'string' ? data.error.message.slice(0, 300) : 'tanpa pesan';
      // 429 dan 5xx biasanya sementara; 4xx lain (key salah, request salah) tidak akan sembuh dengan diulang.
      const bisaDiulang = res.status === 429 || res.status >= 500;
      throw new ErrorParserAi(`Claude API menolak (${res.status}): ${pesan}`, { status: res.status, bisaDiulang });
    }

    if (data?.stop_reason === 'max_tokens') {
      throw new ErrorParserAi('Output Claude terpotong (max_tokens); CV mungkin terlalu panjang');
    }
    const blok = Array.isArray(data?.content)
      ? data.content.find((b) => b?.type === 'tool_use' && b?.name === TOOL_HASIL_CV.name)
      : undefined;
    if (!blok || typeof blok.input !== 'object' || blok.input === null) {
      throw new ErrorParserAi('Respons Claude tidak berisi hasil ekstraksi');
    }
    return blok.input;
  };
}
