// The smoke sender's command line (PBI-39, 39.1): `npm run email:test -- <address>` sends one
// real sign-in-code email so the done-when's delivery check can be made. Bootstrap, like
// src/main.ts: argv and process.exit are the entry point itself, so this file is held out of
// coverage and send-test-email.ts stays pure and fully tested.

import { sendTestEmail } from './send-test-email.js';

const to = process.argv[2];
if (!to) {
  console.error('usage: npm run email:test -- <address>');
  process.exit(1);
}

sendTestEmail(to)
  .then(() => {
    console.log(`sent to ${to}`);
  })
  .catch((error: unknown) => {
    console.error(
      `send failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
