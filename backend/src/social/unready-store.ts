import type { SocialAccountStore } from './ports.js';

// Stands in until account storage (19.3) is built. It refuses rather than pretending, so a
// connect that reaches it lands on Performa with platform_error and nothing is kept in plain text.
export const storageNotReady: SocialAccountStore = {
  save: () =>
    Promise.reject(new Error('social account storage is not ready yet (19.3)')),
};
