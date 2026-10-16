import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { applySecurityHeaders } from './../src/security-headers.js';

describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    applySecurityHeaders(app);
    await app.init();
  });

  it('/ (GET) is not a route: the scaffold page is gone and the answer is JSON', async () => {
    const response = await request(app.getHttpServer()).get('/').expect(404);

    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(response.body).toMatchObject({ statusCode: 404 });
  });

  it('/health (GET) reports the DB is reachable', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ db: 'ok' });
  });

  it('sends hardening headers and no server banner', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['content-security-policy']).toBe(
      "default-src 'none';frame-ancestors 'none'",
    );
    expect(response.headers['referrer-policy']).toBeDefined();
  });

  afterEach(async () => {
    await app.close();
  });
});
