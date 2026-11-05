import { PortNotReady } from '../google/unready-ports.js';
import { unreadyLoginCodeStore } from './login-code-store.js';

describe('unreadyLoginCodeStore', () => {
  it.each([
    ['latest', () => unreadyLoginCodeStore.latest('a@example.com')],
    ['recordWrongAttempt', () => unreadyLoginCodeStore.recordWrongAttempt('1')],
    ['claim', () => unreadyLoginCodeStore.claim('1', new Date())],
  ])('fails %s, so nobody signs in by accident', async (_name, call) => {
    const failure = call();

    await expect(failure).rejects.toBeInstanceOf(PortNotReady);
    await expect(failure).rejects.toThrow('login_codes is not available yet');
  });
});
