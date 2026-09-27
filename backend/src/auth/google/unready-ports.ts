import type { CodeExchanger } from './google-token-client.js';
import type {
  IdTokenVerifier,
  WhitelistResolver,
} from './ports.js';

/** A sign-in piece that has not been built or configured yet. */
export class PortNotReady extends Error {
  override readonly name = 'PortNotReady';
}

function notReady(what: string): Promise<never> {
  return Promise.reject(new PortNotReady(what));
}

// Bound until the token-verification and whitelist pieces replace them. Each refuses, so no
// callback can sign anyone in before those checks are implemented.
export const unreadyVerifier: IdTokenVerifier = {
  verify: () => notReady('ID token verification is not implemented yet'),
};

export const unreadyWhitelist: WhitelistResolver = {
  resolve: () => notReady('the whitelist lookup is not implemented yet'),
};

export const unconfiguredExchanger: CodeExchanger = {
  exchange: () => notReady('Google sign-in is not configured'),
};
