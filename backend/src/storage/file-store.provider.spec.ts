import { join } from 'node:path';
import {
  fileStoreFromEnv,
  requireStorageInProduction,
} from './file-store.provider.js';
import { GcsFileStore, type GcsBucket } from './gcs-file-store.js';
import { LocalFileStore } from './local-file-store.js';

describe('fileStoreFromEnv', () => {
  it('stores in the named bucket when one is set', () => {
    const makeBucket = vi
      .fn()
      .mockReturnValue({ file: vi.fn() } as unknown as GcsBucket);

    const store = fileStoreFromEnv(
      { NODE_ENV: 'production', STORAGE_BUCKET: 'tofly-proofs' },
      makeBucket,
    );

    expect(store).toBeInstanceOf(GcsFileStore);
    expect(makeBucket).toHaveBeenCalledWith('tofly-proofs');
  });

  it('builds a real Cloud Storage bucket of that name by default, offline', () => {
    const store = fileStoreFromEnv({ STORAGE_BUCKET: 'tofly-proofs' });

    expect((Reflect.get(store, 'bucket') as { name: string }).name).toBe(
      'tofly-proofs',
    );
  });

  it('stores on local disk outside production, in .local-storage unless told otherwise', () => {
    expect(
      (fileStoreFromEnv({ LOCAL_STORAGE_DIR: '/tmp/x' }) as LocalFileStore)
        .root,
    ).toBe('/tmp/x');
    expect(
      (
        fileStoreFromEnv({
          NODE_ENV: 'test',
          STORAGE_BUCKET: '',
        }) as LocalFileStore
      ).root,
    ).toBe(join(process.cwd(), '.local-storage'));
  });

  // OWASP Top 10:2025 A02 (Security Misconfiguration): a deployed backend never quietly keeps
  // payment proofs on its own short-lived disk.
  it('refuses production without a bucket, an empty name included', () => {
    expect(() =>
      fileStoreFromEnv({ NODE_ENV: 'production', STORAGE_BUCKET: '' }),
    ).toThrow('Missing required env var: STORAGE_BUCKET');
  });
});

describe('requireStorageInProduction', () => {
  it('stops only a production boot without a bucket', () => {
    expect(() =>
      requireStorageInProduction({ NODE_ENV: 'production' }),
    ).toThrow('Missing required env var: STORAGE_BUCKET');
    expect(() =>
      requireStorageInProduction({
        NODE_ENV: 'production',
        STORAGE_BUCKET: 'b',
      }),
    ).not.toThrow();
    expect(() =>
      requireStorageInProduction({ NODE_ENV: 'development' }),
    ).not.toThrow();
  });
});
