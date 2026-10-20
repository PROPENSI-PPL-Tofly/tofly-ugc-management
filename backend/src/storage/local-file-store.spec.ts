import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import type { FileStore } from './file-store.js';
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
  // Typed as the port: the adapter is used only through it.
  let store: FileStore;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'tofly-store-'));
    // A folder that does not exist yet: the first put makes it.
    store = new LocalFileStore(join(root, 'not-made-yet'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('streams back the bytes it stored, with their name, type and size', async () => {
    const bytes = Buffer.from('%PDF-1.7 bukti');
    await store.put(KEY, bytes, 'application/pdf');

    const opened = await store.open(KEY, META);

    expect(opened).toMatchObject({
      kind: 'stream',
      fileName: 'bukti.pdf',
      contentType: 'application/pdf',
      size: bytes.length,
    });
    expect(await readAll((opened as { stream: Readable }).stream)).toEqual(
      bytes,
    );
  });

  it('answers null for a missing file, and removes one twice without failing', async () => {
    await store.put(KEY, Buffer.from('x'), 'image/png');

    await store.remove(KEY);
    await expect(store.remove(KEY)).resolves.toBeUndefined();
    await expect(store.open(KEY, META)).resolves.toBeNull();
  });

  // OWASP Top 10:2025 A01 (Broken Access Control): a key can never name a file outside the folder.
  it.each(['../escape', `../${KEY}`, `${KEY}/more`])(
    'refuses the key %j before touching the disk',
    async (key) => {
      await expect(
        store.put(key, Buffer.from('x'), 'image/png'),
      ).rejects.toThrow('Invalid storage key');
      await expect(store.open(key, META)).rejects.toThrow(
        'Invalid storage key',
      );
      await expect(store.remove(key)).rejects.toThrow('Invalid storage key');
      await expect(readdir(root)).resolves.toEqual([]);
    },
  );

  it('never overwrites a stored file', async () => {
    await store.put(KEY, Buffer.from('first'), 'image/png');

    await expect(
      store.put(KEY, Buffer.from('second'), 'image/png'),
    ).rejects.toThrow();
    expect(
      await readFile(join(root, 'not-made-yet', ...KEY.split('/'))),
    ).toEqual(Buffer.from('first'));
  });

  // A disk failure other than a missing file is passed on, never read as "no file".
  it('refuses to stream a folder sitting where a file should be', async () => {
    await mkdir(join(root, ...KEY.split('/')), { recursive: true });

    await expect(new LocalFileStore(root).open(KEY, META)).rejects.toThrow(
      'Not a stored file',
    );
  });
});
