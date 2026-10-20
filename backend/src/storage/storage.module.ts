import { Module } from '@nestjs/common';
import { FILE_STORE } from './file-store.js';
import { fileStoreFromEnv } from './file-store.provider.js';

/** The file store, for every feature module that keeps uploaded files to import. */
@Module({
  providers: [
    { provide: FILE_STORE, useFactory: () => fileStoreFromEnv(process.env) },
  ],
  exports: [FILE_STORE],
})
export class StorageModule {}
