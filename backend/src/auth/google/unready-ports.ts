import type { CodeExchanger } from './google-token-client.js';
import type { IdTokenVerifier, SessionStarter } from './ports.js';

/** A sign-in piece that has not been built or configured yet. */
export class PortNotReady extends Error {
  override readonly name = 'PortNotReady';
}

function notReady(what: string): Promise<never> {
  return Promise.reject(new PortNotReady(what));
}

// Bound until the real pieces replace them in GoogleAuthModule. Each one refuses, so until then
// every callback ends on the login page instead of signing anyone in.
export const unreadyVerifier: IdTokenVerifier = {
  verify: () => notReady('ID token verification is not implemented yet'),
};

export const unreadySession: SessionStarter = {
  start: () => notReady('the session cookie is not implemented yet'),
};

export const unconfiguredExchanger: CodeExchanger = {
  exchange: () => notReady('Google sign-in is not configured'),
};
