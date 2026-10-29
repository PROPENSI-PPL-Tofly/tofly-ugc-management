import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  assertStorageKey,
  type FileDescription,
  type FileStore,
  type OpenedFile,
} from './file-store.js';

/**
 * Files on the local disk under one folder, for development and the e2e suite. The backend
 * streams them itself, so the same stable link works as it does against Cloud Storage.
 */
export class LocalFileStore implements FileStore {
  constructor(readonly root: string) {}

  async put(key: string, bytes: Buffer): Promise<void> {
    const path = this.pathOf(key);
    await mkdir(dirname(path), { recursive: true });
    // 'wx' fails if the file exists: a key is written once.
    await writeFile(path, bytes, { flag: 'wx' });
  }

  async open(
    key: string,
    { fileName, contentType }: FileDescription,
  ): Promise<OpenedFile | null> {
    const path = this.pathOf(key);

    let size: number;
    try {
      const stats = await stat(path);
      if (!stats.isFile()) throw new Error('Not a stored file');
      size = stats.size;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }

    return {
      kind: 'stream',
      stream: createReadStream(path),
      fileName,
      contentType,
      size,
    };
  }

  async remove(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }

  private pathOf(key: string): string {
    assertStorageKey(key);
    return join(this.root, ...key.split('/'));
  }
}
