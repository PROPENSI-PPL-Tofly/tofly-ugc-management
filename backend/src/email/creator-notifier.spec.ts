import { noCreatorEmail } from './creator-notifier.js';

describe('noCreatorEmail', () => {
  // For a service built without the email adapter, as unit tests of its own rules do.
  it('sends nothing and resolves for every creator event', async () => {
    for (const send of Object.values(noCreatorEmail)) {
      await expect((send as () => Promise<void>)()).resolves.toBeUndefined();
    }
  });
});
