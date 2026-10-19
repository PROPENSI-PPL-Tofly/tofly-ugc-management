import { join } from 'node:path';
import {
  fileStoreFromEnv,
  requireStorageInProduction,
} from './file-store.provider.js';
import { GcsFileStore, type GcsBucket } from './gcs-file-store.js';
import { LocalFileStore } from './local-file-store.js';

const bucket = { file: vi.fn() } as unknown as GcsBucket;

describe('fileStoreFromEnv', () => {
  describe('accepts', () => {
    it('stores in the named Cloud Storage bucket when one is set', () => {
      const makeBucket = vi.fn().mockReturnValue(bucket);

      const store = fileStoreFromEnv(
        { NODE_ENV: 'production', STORAGE_BUCKET: 'tofly-proofs' },
        makeBucket,
      );

      expect(store).toBeInstanceOf(GcsFileStore);
      expect(makeBucket).toHaveBeenCalledWith('tofly-proofs');
    });

    it('stores on local disk outside production when no bucket is set', () => {
      const makeBucket = vi.fn();

      const store = fileStoreFromEnv(
        { NODE_ENV: 'development', LOCAL_STORAGE_DIR: '/tmp/tofly' },
        makeBucket,
      );

      expect(store).toBeInstanceOf(LocalFileStore);
      expect((store as LocalFileStore).root).toBe('/tmp/tofly');
      expect(makeBucket).not.toHaveBeenCalled();
    });
  });

  // OWASP Top 10:2025 A02 (Security Misconfiguration): a deployed backend never quietly keeps
  // payment proofs on its own short-lived disk.
  describe('refuses', () => {
    it('production without a bucket', () => {
      expect(() => fileStoreFromEnv({ NODE_ENV: 'production' })).toThrow(
        'Missing required env var: STORAGE_BUCKET',
      );
    });
  });

  describe('edge:', () => {
    it('counts an empty bucket name as none', () => {
      expect(() =>
        fileStoreFromEnv({ NODE_ENV: 'production', STORAGE_BUCKET: '' }),
      ).toThrow('Missing required env var: STORAGE_BUCKET');
      expect(
        fileStoreFromEnv({ NODE_ENV: 'test', STORAGE_BUCKET: '' }),
      ).toBeInstanceOf(LocalFileStore);
    });

    it('counts an unset NODE_ENV as not production', () => {
      expect(fileStoreFromEnv({})).toBeInstanceOf(LocalFileStore);
    });

    it('keeps local files in .local-storage under the working folder by default', () => {
      expect((fileStoreFromEnv({}) as LocalFileStore).root).toBe(
        join(process.cwd(), '.local-storage'),
      );
    });

    it('builds a real Cloud Storage bucket when no factory is given', () => {
      expect(
        fileStoreFromEnv({ STORAGE_BUCKET: 'tofly-proofs' }),
      ).toBeInstanceOf(GcsFileStore);
    });
  });
});

describe('requireStorageInProduction', () => {
  it('lets production boot with a bucket', () => {
    expect(() =>
      requireStorageInProduction({
        NODE_ENV: 'production',
        STORAGE_BUCKET: 'tofly-proofs',
      }),
    ).not.toThrow();
  });

  it('stops production from booting without one', () => {
    expect(() =>
      requireStorageInProduction({ NODE_ENV: 'production' }),
    ).toThrow('Missing required env var: STORAGE_BUCKET');
  });

  it('lets any other environment boot without one', () => {
    expect(() =>
      requireStorageInProduction({ NODE_ENV: 'development' }),
    ).not.toThrow();
  });
});
