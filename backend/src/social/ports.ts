// What a connect flow hands over once the platform has said who the account is. Storing it
// (encrypted tokens, one account per platform account) belongs to 19.3; the flow only needs
// somewhere to hand it.

import type { SocialPlatform } from './connect-state.js';

export interface ConnectedAccount {
  creatorId: string;
  platform: SocialPlatform;
  // The platform's own id for the account, so one account cannot belong to two creators.
  platformUserId: string;
  username: string;
  accessToken: string;
  // Instagram has none; its long-lived token is refreshed with itself.
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
}

export interface SocialAccountStore {
  save(account: ConnectedAccount): Promise<void>;
}
