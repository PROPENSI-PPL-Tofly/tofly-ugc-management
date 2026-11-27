// The preview script's command line (PBI-11, 11.4): `npm run email:preview` writes every
// notification email, rendered with its sample data, into backend/email-previews/ (git-ignored).
// Bootstrap, like send-test-email-cli.ts: held out of coverage, so preview-notifications.ts
// stays pure and fully tested.

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { writePreviews } from './preview-notifications.js';

const dir = resolve(process.argv[2] ?? 'email-previews');

writePreviews(dir, {
  mkdir: (path) => mkdir(path, { recursive: true }),
  writeFile: (path, content) => writeFile(path, content, 'utf8'),
})
  .then((index) => {
    console.log(`open ${index}`);
  })
  .catch((error: unknown) => {
    console.error(
      `preview failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
