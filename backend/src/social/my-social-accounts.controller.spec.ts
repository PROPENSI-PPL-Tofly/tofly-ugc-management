import type {
  CanActivate,
  ExecutionContext,
  INestApplication,
} from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { CreatorRequest } from '../auth/creator-request.js';
import { DevCreatorGuard } from '../auth/dev-creator.guard.js';
import { MySocialAccountsController } from './my-social-accounts.controller.js';
import { MySocialAccountsService } from './my-social-accounts.service.js';

const CREATOR = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const ACCOUNTS = {
  accounts: [
    {
      platform: 'tiktok',
      connected: true,
      username: 'rangga.creates',
      connectedAt: '2026-10-29T03:00:00.000Z',
      lastSyncAt: null,
    },
  ],
};

describe('/me/social-accounts', () => {
  let app: INestApplication;
  const service = { list: vi.fn(), disconnect: vi.fn() };
  let guard: CanActivate;

  const signedIn: CanActivate = {
    canActivate(context: ExecutionContext) {
      context.switchToHttp().getRequest<CreatorRequest>().creatorId = CREATOR;
      return true;
    },
  };

  beforeEach(async () => {
    service.list.mockReset().mockResolvedValue(ACCOUNTS);
    service.disconnect.mockReset().mockResolvedValue(true);
    guard = signedIn;
    const module = await Test.createTestingModule({
      controllers: [MySocialAccountsController],
      providers: [{ provide: MySocialAccountsService, useValue: service }],
    })
      .overrideGuard(DevCreatorGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => guard.canActivate(context),
      })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET', () => {
    it("answers the signed-in creator's accounts", async () => {
      const response = await request(app.getHttpServer())
        .get('/me/social-accounts')
        .expect(200);

      expect(response.body).toEqual(ACCOUNTS);
      expect(service.list).toHaveBeenCalledWith(CREATOR);
    });

    it('turns away a caller the guard refuses', async () => {
      guard = {
        canActivate: () => {
          throw new UnauthorizedException();
        },
      };

      await request(app.getHttpServer()).get('/me/social-accounts').expect(401);
      expect(service.list).not.toHaveBeenCalled();
    });
  });

  describe('DELETE', () => {
    it("disconnects the signed-in creator's platform with no body", async () => {
      await request(app.getHttpServer())
        .delete('/me/social-accounts/tiktok')
        .expect(204);

      expect(service.disconnect).toHaveBeenCalledWith(CREATOR, 'tiktok');
    });

    // The Performa panel reads this as already where the creator wanted to end.
    it('answers 404 when nothing is connected there', async () => {
      service.disconnect.mockResolvedValue(false);

      await request(app.getHttpServer())
        .delete('/me/social-accounts/instagram')
        .expect(404);
    });

    it('answers 404 for a platform PBI-19 does not connect, without asking storage', async () => {
      await request(app.getHttpServer())
        .delete('/me/social-accounts/youtube')
        .expect(404);

      expect(service.disconnect).not.toHaveBeenCalled();
    });

    it('turns away a caller the guard refuses', async () => {
      guard = {
        canActivate: () => {
          throw new UnauthorizedException();
        },
      };

      await request(app.getHttpServer())
        .delete('/me/social-accounts/tiktok')
        .expect(401);
      expect(service.disconnect).not.toHaveBeenCalled();
    });
  });
});
