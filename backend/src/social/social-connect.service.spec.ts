import type { Mock } from 'vitest';
import { MIN_SECRET_BYTES, OAuthStateSigner } from './oauth-state.js';
import {
  PlatformRefusal,
  type PlatformAccount,
  type SocialAccountLinker,
  type SocialOAuthProvider,
} from './ports.js';
import {
  MAX_CODE_LENGTH,
  SocialConnectService,
  type WarningLog,
} from './social-connect.service.js';

const CREATOR = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const OTHER_CREATOR = '0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d';
const NOW = new Date('2026-10-29T03:00:00.000Z');
const CODE = 'auth-code-123';

const ACCOUNT: PlatformAccount = {
  platform: 'tiktok',
  platformUserId: 'open-id-1',
  username: 'rangga.creates',
  accessToken: 'act.secret-access',
  accessTokenExpiresAt: new Date('2026-10-30T03:00:00.000Z'),
  refreshToken: 'rft.secret-refresh',
  refreshTokenExpiresAt: new Date('2027-10-29T03:00:00.000Z'),
};

const signer = new OAuthStateSigner('s'.repeat(MIN_SECRET_BYTES), () => NOW);

/** A stand-in TikTok whose two platform calls the tests steer. */
function tiktokProvider() {
  return {
    platform: 'tiktok' as const,
    authorizationUrl: (state: string) =>
      `https://www.tiktok.com/v2/auth/authorize/?state=${state}`,
    callbackError: vi.fn<SocialOAuthProvider['callbackError']>(
      () => 'cancelled',
    ),
    connect: vi.fn<SocialOAuthProvider['connect']>(async () => ACCOUNT),
  };
}

describe('SocialConnectService', () => {
  let provider: ReturnType<typeof tiktokProvider>;
  let linker: { link: Mock<SocialAccountLinker['link']> };
  let log: { warn: Mock<WarningLog['warn']> };
  let service: SocialConnectService;

  beforeEach(() => {
    provider = tiktokProvider();
    linker = { link: vi.fn<SocialAccountLinker['link']>(async () => 'linked') };
    log = { warn: vi.fn<WarningLog['warn']>() };
    service = new SocialConnectService([provider], signer, linker, log);
  });

  /** A state this server issued for `creatorId`, as TikTok hands it back. */
  function stateFor(creatorId = CREATOR): Promise<string> {
    return signer.issue(creatorId, 'tiktok');
  }

  describe('start', () => {
    it('sends the creator to the platform with a state signed for them and the platform', async () => {
      const url = new URL(await service.start(CREATOR, 'tiktok'));
      const state = url.searchParams.get('state');

      await expect(signer.verify(state, CREATOR, 'tiktok')).resolves.toEqual({
        ok: true,
      });
    });

    it('lands on the Performa page with a platform error when the platform is not configured', async () => {
      await expect(service.start(CREATOR, 'instagram')).resolves.toBe(
        '/creator/performance?platform=instagram&error=platform_error',
      );
      expect(log.warn).toHaveBeenCalledWith(
        'instagram connect is not configured',
      );
    });

    it('lands on the Performa page with a platform error when no state secret is set', async () => {
      const unsigned = new SocialConnectService(
        [provider],
        undefined,
        linker,
        log,
      );

      await expect(unsigned.start(CREATOR, 'tiktok')).resolves.toBe(
        '/creator/performance?platform=tiktok&error=platform_error',
      );
      expect(log.warn).toHaveBeenCalledWith('tiktok connect is not configured');
    });
  });

  describe('complete', () => {
    it('connects the account to the creator and lands on Performa with the success toast', async () => {
      const path = await service.complete(CREATOR, 'tiktok', {
        code: CODE,
        state: await stateFor(),
      });

      expect(path).toBe('/creator/performance?connected=tiktok');
      expect(provider.connect).toHaveBeenCalledWith(CODE);
      expect(linker.link).toHaveBeenCalledWith(CREATOR, ACCOUNT);
      expect(log.warn).not.toHaveBeenCalled();
    });

    // OWASP A01:2025: the state is checked first, so nothing in a forged callback, not even its
    // error, is acted on, and no code is ever spent for another session.
    describe('a callback this creator did not start', () => {
      it('is refused when its state was issued to another creator', async () => {
        const path = await service.complete(CREATOR, 'tiktok', {
          code: CODE,
          state: await stateFor(OTHER_CREATOR),
        });

        expect(path).toBe(
          '/creator/performance?platform=tiktok&error=connect_failed',
        );
        expect(provider.connect).not.toHaveBeenCalled();
        expect(linker.link).not.toHaveBeenCalled();
        expect(log.warn).toHaveBeenCalledWith(
          'tiktok connect callback rejected: state belongs to another session',
        );
      });

      it('is refused when it carries no state', async () => {
        await expect(
          service.complete(CREATOR, 'tiktok', { code: CODE }),
        ).resolves.toBe(
          '/creator/performance?platform=tiktok&error=connect_failed',
        );
        expect(provider.connect).not.toHaveBeenCalled();
      });

      it('does not act on an error it carries without a valid state', async () => {
        const path = await service.complete(CREATOR, 'tiktok', {
          error: 'access_denied',
          state: 'forged',
        });

        expect(path).toBe(
          '/creator/performance?platform=tiktok&error=connect_failed',
        );
        expect(provider.callbackError).not.toHaveBeenCalled();
      });
    });

    describe('a callback that reports an error', () => {
      it('reads the error through the platform, without spending a code', async () => {
        const path = await service.complete(CREATOR, 'tiktok', {
          error: 'access_denied',
          state: await stateFor(),
        });

        expect(path).toBe(
          '/creator/performance?platform=tiktok&error=cancelled',
        );
        expect(provider.callbackError).toHaveBeenCalledWith('access_denied');
        expect(provider.connect).not.toHaveBeenCalled();
        expect(log.warn).toHaveBeenCalledWith(
          'tiktok connect ended on the platform: access_denied (cancelled)',
        );
      });

      it('reads an error that is not one text value as a platform error', async () => {
        const path = await service.complete(CREATOR, 'tiktok', {
          error: ['access_denied', 'server_error'],
          state: await stateFor(),
        });

        expect(path).toBe(
          '/creator/performance?platform=tiktok&error=platform_error',
        );
        expect(provider.callbackError).not.toHaveBeenCalled();
        expect(log.warn).toHaveBeenCalledWith(
          'tiktok connect ended on the platform: unknown (platform_error)',
        );
      });

      // The error value is logged so the sandbox test can name the one TikTok sends for an
      // account that is not a target user; anything that does not look like a name is not.
      it('logs an error value that does not look like an error name as unknown', async () => {
        provider.callbackError.mockReturnValue('platform_error');

        await service.complete(CREATOR, 'tiktok', {
          error: '<script>alert(1)</script>',
          state: await stateFor(),
        });

        expect(log.warn).toHaveBeenCalledWith(
          'tiktok connect ended on the platform: unknown (platform_error)',
        );
      });
    });

    // Equivalence classes and the boundary of the code parameter.
    describe('the code', () => {
      it.each([
        ['missing', undefined],
        ['empty', ''],
        ['repeated in the query', [CODE, CODE]],
        ['longer than any code', 'c'.repeat(MAX_CODE_LENGTH + 1)],
      ])('is refused when %s', async (_label, code) => {
        const path = await service.complete(CREATOR, 'tiktok', {
          code,
          state: await stateFor(),
        });

        expect(path).toBe(
          '/creator/performance?platform=tiktok&error=connect_failed',
        );
        expect(provider.connect).not.toHaveBeenCalled();
        expect(log.warn).toHaveBeenCalledWith(
          'tiktok connect callback rejected: code missing or malformed',
        );
      });

      it(`is accepted at exactly ${MAX_CODE_LENGTH} characters`, async () => {
        const code = 'c'.repeat(MAX_CODE_LENGTH);

        await expect(
          service.complete(CREATOR, 'tiktok', {
            code,
            state: await stateFor(),
          }),
        ).resolves.toBe('/creator/performance?connected=tiktok');
        expect(provider.connect).toHaveBeenCalledWith(code);
      });
    });

    describe('when the platform does not give an account', () => {
      it('tells the creator what the platform refusal means and logs why', async () => {
        provider.connect.mockRejectedValue(
          new PlatformRefusal('cancelled', 'scope not granted: video.list'),
        );

        const path = await service.complete(CREATOR, 'tiktok', {
          code: CODE,
          state: await stateFor(),
        });

        expect(path).toBe(
          '/creator/performance?platform=tiktok&error=cancelled',
        );
        expect(linker.link).not.toHaveBeenCalled();
        expect(log.warn).toHaveBeenCalledWith(
          'tiktok connect failed: scope not granted: video.list',
        );
      });

      // OWASP A10:2025 (Mishandling of Exceptional Conditions): an unexpected failure ends in a
      // page the creator can retry from, and its message, which may hold anything, stays out
      // of the log.
      it('reads any other failure as a platform error without logging its message', async () => {
        provider.connect.mockRejectedValue(
          new Error('crashed holding act.secret-access'),
        );

        const path = await service.complete(CREATOR, 'tiktok', {
          code: CODE,
          state: await stateFor(),
        });

        expect(path).toBe(
          '/creator/performance?platform=tiktok&error=platform_error',
        );
        expect(log.warn).toHaveBeenCalledWith(
          'tiktok connect failed unexpectedly: Error',
        );
      });

      it('logs only the kind of a failure that is not even an Error', async () => {
        provider.connect.mockRejectedValue('act.secret-access');

        const path = await service.complete(CREATOR, 'tiktok', {
          code: CODE,
          state: await stateFor(),
        });

        expect(path).toBe(
          '/creator/performance?platform=tiktok&error=platform_error',
        );
        expect(log.warn).toHaveBeenCalledWith(
          'tiktok connect failed unexpectedly: string',
        );
      });
    });

    describe('when the account is stored', () => {
      it('tells the creator when the account already belongs to another creator', async () => {
        linker.link.mockResolvedValue('taken');

        const path = await service.complete(CREATOR, 'tiktok', {
          code: CODE,
          state: await stateFor(),
        });

        expect(path).toBe(
          '/creator/performance?platform=tiktok&error=account_taken',
        );
        expect(log.warn).toHaveBeenCalledWith(
          'tiktok connect refused: account already connected to another creator',
        );
      });

      it('reads a storage failure as a platform error without logging its message', async () => {
        linker.link.mockRejectedValue(new Error('db down: act.secret-access'));

        const path = await service.complete(CREATOR, 'tiktok', {
          code: CODE,
          state: await stateFor(),
        });

        expect(path).toBe(
          '/creator/performance?platform=tiktok&error=platform_error',
        );
        expect(log.warn).toHaveBeenCalledWith(
          'tiktok account could not be stored: Error',
        );
      });
    });

    it('lands on a platform error when the platform is not configured', async () => {
      await expect(
        service.complete(CREATOR, 'instagram', {
          code: CODE,
          state: await signer.issue(CREATOR, 'instagram'),
        }),
      ).resolves.toBe(
        '/creator/performance?platform=instagram&error=platform_error',
      );
      expect(log.warn).toHaveBeenCalledWith(
        'instagram connect is not configured',
      );
    });

    // OWASP A09:2025: whatever happened, no code or token reaches the log.
    it('never logs the code or a token', async () => {
      const state = await stateFor();
      provider.connect
        .mockRejectedValueOnce(new PlatformRefusal('platform_error', 'x'))
        .mockRejectedValueOnce(new Error(`boom ${ACCOUNT.accessToken}`));
      linker.link.mockRejectedValueOnce(new Error(ACCOUNT.refreshToken!));

      for (let i = 0; i < 3; i++) {
        await service.complete(CREATOR, 'tiktok', { code: CODE, state });
      }

      const logged = log.warn.mock.calls.flat().join('\n');
      for (const secret of [CODE, ACCOUNT.accessToken, ACCOUNT.refreshToken!]) {
        expect(logged).not.toContain(secret);
      }
    });
  });
});
