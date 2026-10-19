import type { Readable } from 'node:stream';

// Where uploaded files live, behind one port (Ports and Adapters): Cloud Storage on the deployed
// services, the local disk in development and the e2e suite. Callers keep what a file is and who
// may see it in the database and hand the store only an opaque key, so a store never decides
// access and swapping one never changes a query.

/** How a stored file reaches the browser: a short-lived link, or its bytes through the backend. */
export type OpenedFile =
  | { kind: 'redirect'; url: string }
  | { kind: 'stream'; stream: Readable; contentType: string; size: number };

/** What the browser should call and treat the file as when it opens it. */
export interface FileDescription {
  fileName: string;
  contentType: string;
}

export interface FileStore {
  /** Stores new bytes under a key; refuses a key already in use. */
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  /** Opens a stored file, or answers null when the store has nothing under the key. */
  open(key: string, description: FileDescription): Promise<OpenedFile | null>;
  /** Removes a file; a key with nothing under it is not an error. */
  remove(key: string): Promise<void>;
}

/** Nest injection token for FileStore, since an interface does not exist at runtime. */
export const FILE_STORE = Symbol('FILE_STORE');

// A key is one lower-case prefix naming what the file is for, then a UUID the caller generated:
// nothing a user typed, and nothing that can climb out of a folder.
const KEY =
  /^[a-z][a-z-]*\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function assertStorageKey(key: string): void {
  if (!KEY.test(key)) throw new Error('Invalid storage key');
}
