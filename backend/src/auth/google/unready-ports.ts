import type { CodeExchanger } from './google-token-client.js';
import type { IdTokenVerifier } from './ports.js';

/** A sign-in piece that has not been built or configured yet. */
export class PortNotReady extends Error {
  override readonly name = 'PortNotReady';
}

function notReady(what: string): Promise<never> {
  return Promise.reject(new PortNotReady(what));
}

export const unconfiguredExchanger: CodeExchanger = {
  exchange: () => notReady('Google sign-in is not configured'),
};

export const unconfiguredVerifier: IdTokenVerifier = {
  verify: () => notReady('Google sign-in is not configured'),
};
