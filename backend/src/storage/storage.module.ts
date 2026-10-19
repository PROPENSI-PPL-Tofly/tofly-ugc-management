import { Global, Module } from '@nestjs/common';
import { FILE_STORE } from './file-store.js';
import { fileStoreFromEnv } from './file-store.provider.js';

/** One file store for every feature that keeps uploaded files. */
@Global()
@Module({
  providers: [
    { provide: FILE_STORE, useFactory: () => fileStoreFromEnv(process.env) },
  ],
  exports: [FILE_STORE],
})
export class StorageModule {}
