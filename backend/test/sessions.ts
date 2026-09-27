import type { INestApplication } from '@nestjs/common';
import type { Response } from 'express';
import request from 'supertest';
import type { Principal } from '../src/auth/google/ports.js';
import { AppSessionService } from '../src/auth/session/session.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

// Signs e2e requests in the way a browser is after Google sign-in: a real session row, made by
// the app's own session service, named by its cookie. Nothing here bypasses a guard.

/** Starts a session for the principal and returns the Cookie header that carries it. */
export async function signIn(
  app: INestApplication,
  principal: Principal,
): Promise<string> {
  const sessions = app.get(AppSessionService);
  const { id } = await sessions.start(
    { cookie: () => undefined } as unknown as Response,
    principal,
  );
  return `${sessions.cookieName()}=${id}`;
}

/**
 * Whitelists an admin under the suite's marker email, so its cleanup removes the user (and, by
 * cascade, its sessions), and signs them in.
 */
export async function signInAsAdmin(
  app: INestApplication,
  prisma: PrismaService,
  marker: string,
): Promise<string> {
  const email = `${marker}-signed-in-admin@example.com`;
  const admin = await prisma.users.upsert({
    where: { email },
    create: { email, is_admin: true },
    update: { is_admin: true },
    select: { id: true },
  });
  return signIn(app, { userId: admin.id, role: 'admin' });
}

/**
 * supertest with every request carrying the session cookie, and changes carrying the headers a
 * browser sends from the app's own origin.
 */
export function as(app: INestApplication, cookie: string) {
  const server = app.getHttpServer();
  const origin = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  const change = (call: request.Test) =>
    call
      .set('Cookie', cookie)
      .set('Origin', origin)
      .set('Sec-Fetch-Site', 'same-origin');
  return {
    get: (url: string) => request(server).get(url).set('Cookie', cookie),
    post: (url: string) => change(request(server).post(url)),
    patch: (url: string) => change(request(server).patch(url)),
  };
}
