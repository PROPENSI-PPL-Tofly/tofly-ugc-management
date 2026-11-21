import {
  HttpException,
  HttpStatus,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AdminConfirmationService,
  CONFIRMATION_WINDOW_MINUTES,
} from './admin-confirmation.service.js';

// SCRUM-246 (PBI-23): "Changing a role (including making someone Super Admin) and deactivating an
// Admin first ask the Super Admin for an email code. One confirmation covers these actions for 15
// minutes." (OWASP A07:2025 Identification and Authentication Failures)

const NOW = new Date('2026-11-21T10:00:00.000Z');
const USER = 'user-super';
const SESSION = 'session-cookie-id';
const CODE = '482193';
// A stand-in HMAC that, like the real one, does not carry the code in the clear.
const hash = (subject: string, code: string) =>
  `h(${subject}|${[...code].reverse().join('')})`;
const HASH = hash(`confirm:${USER}`, CODE);

function minutes(n: number): Date {
  return new Date(NOW.getTime() + n * 60_000);
}

function setup({ recent = 0, latest = null as unknown } = {}) {
  const codes = {
    count: vi.fn().mockResolvedValue(recent),
    create: vi.fn().mockResolvedValue({ id: 'code-1' }),
    findFirst: vi.fn().mockResolvedValue(latest),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    delete: vi.fn().mockResolvedValue({}),
  };
  const tx = {
    admin_confirmation_codes: codes,
    $executeRaw: vi.fn().mockResolvedValue(1),
  };
  const prisma = {
    users: {
      findUnique: vi.fn().mockResolvedValue({ email: 'gunta@tofly.id' }),
    },
    admin_confirmation_codes: codes,
    $transaction: vi.fn((work: (client: typeof tx) => Promise<unknown>) =>
      work(tx),
    ),
  };
  const sender = { send: vi.fn().mockResolvedValue(undefined) };
  const sessions = { confirm: vi.fn().mockResolvedValue(true) };
  const service = new AdminConfirmationService(
    prisma as never,
    sender,
    hash,
    sessions,
    () => NOW,
    () => CODE,
  );
  return { prisma, tx, codes, sender, sessions, service };
}

async function refusal(promise: Promise<unknown>): Promise<HttpException> {
  return promise.then(
    () => {
      throw new Error('expected a refusal');
    },
    (error: HttpException) => error,
  );
}

describe('AdminConfirmationService.request', () => {
  it('stores only an HMAC of a ten-minute code and emails it to the Super Admin', async () => {
    const { codes, sender, service } = setup();

    await expect(service.request(USER)).resolves.toEqual({ validMinutes: 10 });

    expect(codes.create).toHaveBeenCalledWith({
      data: {
        user_id: USER,
        code_hash: HASH,
        created_at: NOW,
        expires_at: minutes(10),
      },
      select: { id: true },
    });
    expect(sender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'gunta@tofly.id',
        subject: 'Kode konfirmasi Tofly',
        text: expect.stringContaining(CODE),
      }),
    );
    expect(JSON.stringify(codes.create.mock.calls)).not.toContain(CODE);
  });

  // One request at a time per Super Admin, so two at once cannot both take the last slot.
  it('counts the last hour under a per-user lock in one transaction', async () => {
    const { tx, codes, service } = setup();

    await service.request(USER);

    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(codes.count).toHaveBeenCalledWith({
      where: { user_id: USER, created_at: { gt: minutes(-60) } },
    });
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      codes.count.mock.invocationCallOrder[0],
    );
  });

  it('refuses a sixth request within the hour with 429, sending nothing', async () => {
    const { codes, sender, service } = setup({ recent: 5 });
    codes.findFirst.mockResolvedValue({ created_at: minutes(-45) });

    const error = await refusal(service.request(USER));

    expect(error.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(error.getResponse()).toEqual({
      code: 'CONFIRMATION_LIMITED',
      message: 'Terlalu banyak permintaan. Coba lagi dalam 15 menit.',
      retryAfterMinutes: 15,
    });
    expect(codes.findFirst).toHaveBeenCalledWith({
      where: { user_id: USER, created_at: { gt: minutes(-60) } },
      orderBy: { created_at: 'asc' },
      skip: 0,
      select: { created_at: true },
    });
    expect(codes.create).not.toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('removes the code it stored when the email cannot be sent, and says so', async () => {
    const { codes, sender, service } = setup();
    sender.send.mockRejectedValue(new Error('smtp down'));

    const error = await refusal(service.request(USER));

    expect(error.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(error.getResponse()).toEqual({
      code: 'CONFIRMATION_NOT_SENT',
      message: 'Kode gagal dikirim. Coba lagi.',
    });
    expect(codes.delete).toHaveBeenCalledWith({ where: { id: 'code-1' } });
  });

  it('answers 401 when the Super Admin no longer exists', async () => {
    const { prisma, service } = setup();
    prisma.users.findUnique.mockResolvedValue(null);

    await expect(refusal(service.request(USER))).resolves.toMatchObject({
      status: 401,
    });
  });
});

describe('AdminConfirmationService.verify', () => {
  const LIVE = {
    id: 'code-1',
    code_hash: HASH,
    expires_at: minutes(5),
    attempts: 0,
    used_at: null,
  };

  it('claims a right code and confirms this session for 15 minutes', async () => {
    const { codes, sessions, service } = setup({ latest: LIVE });

    await expect(service.verify(USER, SESSION, CODE)).resolves.toEqual({
      confirmedUntil: minutes(CONFIRMATION_WINDOW_MINUTES).toISOString(),
    });

    expect(codes.findFirst).toHaveBeenCalledWith({
      where: { user_id: USER },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        code_hash: true,
        expires_at: true,
        attempts: true,
        used_at: true,
      },
    });
    expect(codes.updateMany).toHaveBeenCalledWith({
      where: { id: 'code-1', used_at: null },
      data: { used_at: NOW },
    });
    expect(sessions.confirm).toHaveBeenCalledWith(SESSION, minutes(15));
  });

  it('counts a wrong code and says how many tries are left', async () => {
    const { codes, sessions, service } = setup({
      latest: { ...LIVE, attempts: 1 },
    });

    const error = await refusal(service.verify(USER, SESSION, '000000'));

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.getResponse()).toEqual({
      code: 'CONFIRMATION_WRONG',
      message: 'Kode salah. Sisa 3 percobaan.',
      attemptsLeft: 3,
    });
    expect(codes.updateMany).toHaveBeenCalledWith({
      where: { id: 'code-1', attempts: { lt: 5 } },
      data: { attempts: { increment: 1 } },
    });
    expect(sessions.confirm).not.toHaveBeenCalled();
  });

  it('kills the code on its fifth wrong try', async () => {
    const { service } = setup({ latest: { ...LIVE, attempts: 4 } });

    const error = await refusal(service.verify(USER, SESSION, '000000'));

    expect(error.getResponse()).toMatchObject({ code: 'CONFIRMATION_EXPIRED' });
  });

  it('reads a wrong try that lost the race to the limit as expired', async () => {
    const { codes, service } = setup({ latest: { ...LIVE, attempts: 1 } });
    codes.updateMany.mockResolvedValue({ count: 0 });

    const error = await refusal(service.verify(USER, SESSION, '000000'));

    expect(error.getResponse()).toMatchObject({ code: 'CONFIRMATION_EXPIRED' });
  });

  it.each([
    ['no code was asked for', null],
    ['the code expired', { ...LIVE, expires_at: NOW }],
    ['the code was used', { ...LIVE, used_at: minutes(-1) }],
    ['the code had five wrong tries', { ...LIVE, attempts: 5 }],
  ])('answers expired when %s', async (_label, latest) => {
    const { sessions, service } = setup({ latest });

    const error = await refusal(service.verify(USER, SESSION, CODE));

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.getResponse()).toEqual({
      code: 'CONFIRMATION_EXPIRED',
      message: 'Kode sudah kedaluwarsa. Kirim ulang kode.',
    });
    expect(sessions.confirm).not.toHaveBeenCalled();
  });

  // Of two submissions of the same code, only the one that claims it confirms.
  it('answers expired when another submission claimed the code first', async () => {
    const { codes, sessions, service } = setup({ latest: LIVE });
    codes.updateMany.mockResolvedValue({ count: 0 });

    const error = await refusal(service.verify(USER, SESSION, CODE));

    expect(error.getResponse()).toMatchObject({ code: 'CONFIRMATION_EXPIRED' });
    expect(sessions.confirm).not.toHaveBeenCalled();
  });

  it('answers 401 when the session is gone', async () => {
    const { sessions, service } = setup({ latest: LIVE });
    sessions.confirm.mockResolvedValue(false);

    await expect(
      refusal(service.verify(USER, SESSION, CODE)),
    ).resolves.toMatchObject({
      status: 401,
    });
  });
});
