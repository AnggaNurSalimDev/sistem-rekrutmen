import { buatStorageLokal } from './local.js';

export function buatStorage(config) {
  switch (config.STORAGE_DRIVER) {
    case 'local':
      return buatStorageLokal({
        dir: config.STORAGE_DIR,
        signingSecret: config.STORAGE_SIGNING_SECRET,
        publicBaseUrl: config.PUBLIC_BASE_URL,
        ttlDetik: config.SIGNED_URL_TTL_SECONDS,
      });
    default:
      throw new Error(`STORAGE_DRIVER tidak dikenal: ${config.STORAGE_DRIVER}`);
  }
}
