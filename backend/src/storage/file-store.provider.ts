import { Storage } from '@google-cloud/storage';
import { join } from 'node:path';
import type { FileStore } from './file-store.js';
import { GcsFileStore, type GcsBucket } from './gcs-file-store.js';
import { LocalFileStore } from './local-file-store.js';

type Env = Record<string, string | undefined>;

/** Fails a production boot that names no bucket, as DATABASE_URL does when it is missing. */
export function requireStorageInProduction(env: Env): void {
  if (env.NODE_ENV === 'production' && !env.STORAGE_BUCKET) {
    throw new Error('Missing required env var: STORAGE_BUCKET');
  }
}

/**
 * The store this process uses: the STORAGE_BUCKET bucket when one is named (the deployed
 * services, with the service account's own credentials), else a folder on the local disk.
 */
export function fileStoreFromEnv(
  env: Env,
  makeBucket: (name: string) => GcsBucket = (name) =>
    new Storage().bucket(name),
): FileStore {
  requireStorageInProduction(env);

  if (env.STORAGE_BUCKET) {
    return new GcsFileStore(makeBucket(env.STORAGE_BUCKET));
  }
  return new LocalFileStore(
    env.LOCAL_STORAGE_DIR ?? join(process.cwd(), '.local-storage'),
  );
}
