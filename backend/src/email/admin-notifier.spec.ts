import { noAdminEmail } from './admin-notifier.js';

describe('noAdminEmail', () => {
  // For a service built without the email adapter, as unit tests of its own rules do.
  it('sends nothing and resolves for every Admin event', async () => {
    for (const send of Object.values(noAdminEmail)) {
      await expect((send as () => Promise<void>)()).resolves.toBeUndefined();
    }
  });
});
