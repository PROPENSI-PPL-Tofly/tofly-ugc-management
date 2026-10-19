import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { LocalFileStore } from './local-file-store.js';

const KEY = 'payment-proofs/0f0e0d0c-0b0a-4908-8706-050403020100';
const META = { fileName: 'bukti.pdf', contentType: 'application/pdf' };

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

describe('LocalFileStore', () => {
  let root: string;
  let store: LocalFileStore;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'tofly-store-'));
    store = new LocalFileStore(join(root, 'not-made-yet'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe('accepts', () => {
    it('stores a file and streams the same bytes back with their type and size', async () => {
      const bytes = Buffer.from('%PDF-1.7 bukti');

      await store.put(KEY, bytes, 'application/pdf');
      const opened = await store.open(KEY, META);

      expect(opened).toMatchObject({
        kind: 'stream',
        contentType: 'application/pdf',
        size: bytes.length,
      });
      expect(await readAll((opened as { stream: Readable }).stream)).toEqual(
        bytes,
      );
    });

    it('removes a stored file, so it can no longer be opened', async () => {
      await store.put(KEY, Buffer.from('x'), 'image/png');

      await store.remove(KEY);

      await expect(store.open(KEY, META)).resolves.toBeNull();
    });
  });

  // OWASP Top 10:2025 A01 (Broken Access Control): a key is a fixed prefix and a UUID, so no key
  // can name a file outside the store's folder.
  describe('refuses', () => {
    it.each([
      '../escape',
      'payment-proofs/../../etc/passwd',
      'payment-proofs/not-a-uuid',
      '0f0e0d0c-0b0a-4908-8706-050403020100',
      'Payment-Proofs/0f0e0d0c-0b0a-4908-8706-050403020100',
      'payment-proofs\\0f0e0d0c-0b0a-4908-8706-050403020100',
      `${KEY}/more`,
      '',
    ])('the key %j before touching the disk', async (key) => {
      await expect(
        store.put(key, Buffer.from('x'), 'image/png'),
      ).rejects.toThrow('Invalid storage key');
      await expect(store.open(key, META)).rejects.toThrow(
        'Invalid storage key',
      );
      await expect(store.remove(key)).rejects.toThrow('Invalid storage key');
      await expect(readdir(root)).resolves.toEqual([]);
    });

    it('overwriting a stored file, keeping the first', async () => {
      await store.put(KEY, Buffer.from('first'), 'image/png');

      await expect(
        store.put(KEY, Buffer.from('second'), 'image/png'),
      ).rejects.toThrow();
      expect(
        await readFile(join(root, 'not-made-yet', ...KEY.split('/'))),
      ).toEqual(Buffer.from('first'));
    });
  });

  describe('edge:', () => {
    it('answers null for a key that was never stored', async () => {
      await expect(store.open(KEY, META)).resolves.toBeNull();
    });

    it('removes a key that is not there without failing', async () => {
      await expect(store.remove(KEY)).resolves.toBeUndefined();
    });

    it('makes its folder on the first put', async () => {
      await store.put(KEY, Buffer.from('x'), 'image/png');

      await expect(readdir(join(root, 'not-made-yet'))).resolves.toEqual([
        'payment-proofs',
      ]);
    });

    it('passes on a disk failure other than a missing file', async () => {
      // A file where the prefix folder should be: the path below it cannot even be looked up.
      await writeFile(join(root, 'payment-proofs'), 'in the way');
      const blocked = new LocalFileStore(root);

      await expect(blocked.open(KEY, META)).rejects.toMatchObject({
        code: 'ENOTDIR',
      });
    });

    it('refuses to stream a folder sitting where a file should be', async () => {
      await mkdir(join(root, ...KEY.split('/')), { recursive: true });

      await expect(new LocalFileStore(root).open(KEY, META)).rejects.toThrow(
        'Not a stored file',
      );
    });
  });
});
