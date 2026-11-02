import type { ConnectedAccount, SocialAccountStore } from '../ports.js';
import {
  InstagramApiError,
  type InstagramAccount,
} from './instagram-client.js';
import { InstagramConnectService } from './instagram-connect.service.js';

const CREATOR = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const CODE = 'AQBx-instagram-code';
const TOKEN = 'IGAA-long-lived-token';
const EXPIRES_AT = new Date(Date.UTC(2026, 11, 28));

const ACCOUNT: InstagramAccount = {
  platformUserId: '17841400000000000',
  username: 'rangga.creates',
  accountType: 'MEDIA_CREATOR',
  accessToken: TOKEN,
  expiresAt: EXPIRES_AT,
};

const CONNECTED = '/creator/performance?platform=instagram&connected=1';
const errorPath = (code: string) =>
  `/creator/performance?platform=instagram&error=${code}`;

function setup(
  connect: () => Promise<InstagramAccount> = async () => ACCOUNT,
  save: (account: ConnectedAccount) => Promise<void> = async () => undefined,
) {
  const client = { connect: vi.fn(connect) };
  const store: SocialAccountStore & { save: ReturnType<typeof vi.fn> } = {
    save: vi.fn(save),
  };
  const log = { warn: vi.fn() };
  const service = new InstagramConnectService(client, store, log);
  return { client, store, log, service };
}

describe('InstagramConnectService.complete', () => {
  it('hands a Professional account and its token to storage and lands on Performa connected', async () => {
    const { store, service } = setup();

    await expect(service.complete(CREATOR, CODE)).resolves.toBe(CONNECTED);
    expect(store.save).toHaveBeenCalledWith({
      creatorId: CREATOR,
      platform: 'instagram',
      platformUserId: '17841400000000000',
      username: 'rangga.creates',
      accessToken: TOKEN,
      refreshToken: null,
      tokenExpiresAt: EXPIRES_AT,
    });
  });

  it('accepts a Business account as Professional too', async () => {
    const { service } = setup(async () => ({
      ...ACCOUNT,
      accountType: 'BUSINESS',
    }));

    await expect(service.complete(CREATOR, CODE)).resolves.toBe(CONNECTED);
  });

  it('passes the code to Instagram unchanged', async () => {
    const { client, service } = setup();

    await service.complete(CREATOR, CODE);

    expect(client.connect).toHaveBeenCalledWith(CODE);
  });

  it('refuses a personal account as not_professional and saves nothing', async () => {
    const { store, service } = setup(async () => ({
      ...ACCOUNT,
      accountType: 'PERSONAL',
    }));

    await expect(service.complete(CREATOR, CODE)).resolves.toBe(
      errorPath('not_professional'),
    );
    expect(store.save).not.toHaveBeenCalled();
  });

  it.each([
    [
      'not_tester',
      new InstagramApiError('not_tester', 'code exchange: not a tester'),
    ],
    [
      'platform_error',
      new InstagramApiError(
        'platform_error',
        'profile: Instagram answered 500',
      ),
    ],
    ['platform_error', new TypeError('something unexpected')],
  ])('lands on Performa with %s when Instagram fails', async (code, error) => {
    const { store, log, service } = setup(async () => {
      throw error;
    });

    await expect(service.complete(CREATOR, CODE)).resolves.toBe(
      errorPath(code),
    );
    expect(store.save).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledOnce();
  });

  it('lands on Performa with platform_error when the account cannot be saved', async () => {
    const { log, service } = setup(undefined, async () => {
      throw new Error('storage unavailable');
    });

    await expect(service.complete(CREATOR, CODE)).resolves.toBe(
      errorPath('platform_error'),
    );
    expect(log.warn).toHaveBeenCalledOnce();
  });

  it("never logs the token, even when storage's own error message carries it", async () => {
    const { log, service } = setup(undefined, async () => {
      throw new Error(`insert failed for token ${TOKEN}`);
    });

    await service.complete(CREATOR, CODE);

    for (const [message] of log.warn.mock.calls as [string][]) {
      expect(message).not.toContain(TOKEN);
      expect(message).not.toContain(CODE);
    }
  });
});
