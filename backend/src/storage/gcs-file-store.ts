import type { Bucket } from '@google-cloud/storage';
import { inlineDisposition } from './open-file-response.js';
import {
  assertStorageKey,
  type FileDescription,
  type FileStore,
  type OpenedFile,
} from './file-store.js';

/** How long a read link lasts: long enough to open the file, short enough not to be shared. */
const LINK_LIFETIME_MS = 15 * 60_000;

/** The calls this adapter makes on a Cloud Storage bucket, so tests can stub exactly those. */
export type GcsBucket = Pick<Bucket, 'file'>;

/**
 * Files in a private Cloud Storage bucket. The browser reads one through a V4 signed link made
 * when it asks, so nothing about the bucket is public and every link soon stops working.
 */
export class GcsFileStore implements FileStore {
  constructor(
    private readonly bucket: GcsBucket,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    assertStorageKey(key);
    // One request is quicker than a resumable session for a file this small, and generation 0
    // means the object must not exist yet: a key is written once.
    await this.bucket.file(key).save(bytes, {
      resumable: false,
      contentType,
      metadata: { cacheControl: 'private, no-store' },
      preconditionOpts: { ifGenerationMatch: 0 },
    });
  }

  async open(
    key: string,
    { fileName, contentType }: FileDescription,
  ): Promise<OpenedFile> {
    assertStorageKey(key);
    const [url] = await this.bucket.file(key).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: new Date(this.now().getTime() + LINK_LIFETIME_MS),
      responseDisposition: inlineDisposition(fileName),
      responseType: contentType,
    });
    return { kind: 'redirect', url };
  }

  async remove(key: string): Promise<void> {
    assertStorageKey(key);
    await this.bucket.file(key).delete({ ignoreNotFound: true });
  }
}
