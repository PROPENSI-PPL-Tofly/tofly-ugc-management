// The email-code confirmation in front of a role change and a deactivation (PBI-23, SCRUM-246):
// "One confirmation covers these actions for 15 minutes." The code goes to the signed-in Super
// Admin's own address, so a stolen session alone cannot change who has access (OWASP A07:2025).
// It reuses PBI-39's code rules (six digits, ten minutes, five tries, five an hour) but not its
// table: a confirmation code can never sign anyone in.

import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { unauthenticated } from '../auth/creator-request.js';
import {
  CODE_LIFETIME_MINUTES,
  MAX_REQUESTS_PER_WINDOW,
  REQUEST_WINDOW_MINUTES,
} from '../auth/email/code-request.service.js';
import {
  MAX_CODE_ATTEMPTS,
  attemptsLeft,
} from '../auth/email/login-code-check.js';
import { generateLoginCode } from '../auth/email/login-code-generator.js';
import type { LoginCodeHasher } from '../auth/email/login-code-hash.js';
import { sameToken } from '../auth/google/callback.js';
import type { EmailMessage, EmailSender } from '../email/email-sender.js';

export const CONFIRMATION_WINDOW_MINUTES = 15;

export const CONFIRMATION_SENDER = 'CONFIRMATION_SENDER';
export const CONFIRMATION_HASHER = 'CONFIRMATION_HASHER';
export const CONFIRMATION_SESSIONS = 'CONFIRMATION_SESSIONS';

const MINUTE_MS = 60_000;

interface CodeRow {
  id: string;
  code_hash: string;
  expires_at: Date;
  attempts: number;
  used_at: Date | null;
}

export interface ConfirmationCodes {
  count(args: object): Promise<number>;
  create(args: object): Promise<{ id: string }>;
  findFirst(args: object): Promise<unknown>;
  updateMany(args: object): Promise<{ count: number }>;
}

export interface ConfirmationClient {
  users: {
    findUnique(args: {
      where: { id: string };
      select: { email: true };
    }): Promise<{ email: string } | null>;
  };
  admin_confirmation_codes: ConfirmationCodes;
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $transaction<T>(
    work: (tx: {
      admin_confirmation_codes: ConfirmationCodes;
      $executeRaw(
        query: TemplateStringsArray,
        ...values: unknown[]
      ): Promise<number>;
    }) => Promise<T>,
  ): Promise<T>;
}

/** The part of AppSessionService a confirmation needs. */
export interface ConfirmableSessions {
  confirm(id: unknown, until: Date): Promise<boolean>;
}

function addMinutes(moment: Date, minutes: number): Date {
  return new Date(moment.getTime() + minutes * MINUTE_MS);
}

/** Apart from a sign-in code's HMAC input, so neither hash can stand in for the other. */
function subjectOf(userId: string): string {
  return `confirm:${userId}`;
}

export function confirmationEmail(to: string, code: string): EmailMessage {
  return {
    to,
    senderName: 'Tofly',
    subject: 'Kode konfirmasi Tofly',
    text: [
      `Kode konfirmasi Tofly kamu: ${code}`,
      '',
      'Kode ini dipakai untuk mengubah role, menambah Super Admin, atau menonaktifkan Admin di Pengguna Admin.',
      `Kode berlaku selama ${CODE_LIFETIME_MINUTES} menit. Jangan bagikan kode ini kepada siapa pun.`,
      '',
      'Kalau kamu tidak meminta kode ini, segera hubungi tim Tofly.',
    ].join('\n'),
  };
}

function expired(): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: 'CONFIRMATION_EXPIRED',
    message: 'Kode sudah kedaluwarsa. Kirim ulang kode.',
  });
}

function isLive(row: CodeRow, now: Date): boolean {
  return (
    row.used_at === null &&
    row.expires_at.getTime() > now.getTime() &&
    row.attempts < MAX_CODE_ATTEMPTS
  );
}

@Injectable()
export class AdminConfirmationService {
  constructor(
    private readonly prisma: ConfirmationClient,
    @Inject(CONFIRMATION_SENDER) private readonly sender: EmailSender,
    @Inject(CONFIRMATION_HASHER) private readonly hash: LoginCodeHasher,
    @Inject(CONFIRMATION_SESSIONS)
    private readonly sessions: ConfirmableSessions,
    private readonly now: () => Date = () => new Date(),
    private readonly code: () => string = generateLoginCode,
  ) {}

  /** Emails a code to the Super Admin's own address. */
  async request(userId: string): Promise<{ validMinutes: number }> {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) throw unauthenticated();

    const now = this.now();
    const code = this.code();
    const windowStart = addMinutes(now, -REQUEST_WINDOW_MINUTES);
    const stored = await this.prisma.$transaction(async (tx) => {
      // One request at a time per Super Admin, so two at once cannot both take the last slot.
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${subjectOf(userId)}))`;
      const recent = { user_id: userId, created_at: { gt: windowStart } };
      if (
        (await tx.admin_confirmation_codes.count({ where: recent })) >=
        MAX_REQUESTS_PER_WINDOW
      ) {
        const oldest = (await tx.admin_confirmation_codes.findFirst({
          where: recent,
          orderBy: { created_at: 'asc' },
          select: { created_at: true },
        })) as { created_at: Date };
        const freesAt = addMinutes(oldest.created_at, REQUEST_WINDOW_MINUTES);
        const retryAfterMinutes = Math.ceil(
          (freesAt.getTime() - now.getTime()) / MINUTE_MS,
        );
        throw new HttpException(
          {
            code: 'CONFIRMATION_LIMITED',
            message: `Terlalu banyak permintaan. Coba lagi dalam ${retryAfterMinutes} menit.`,
            retryAfterMinutes,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      return tx.admin_confirmation_codes.create({
        data: {
          user_id: userId,
          code_hash: this.hash(subjectOf(userId), code),
          created_at: now,
          expires_at: addMinutes(now, CODE_LIFETIME_MINUTES),
        },
        select: { id: true },
      });
    });

    try {
      await this.sender.send(confirmationEmail(user.email, code));
    } catch {
      // The email layer has logged the failure; a code nobody received must not stay live. It is
      // marked used, not deleted, so the request still counts toward five an hour, sent or not,
      // as a sign-in code's does.
      await this.prisma.admin_confirmation_codes.updateMany({
        where: { id: stored.id },
        data: { used_at: now },
      });
      throw new ServiceUnavailableException({
        code: 'CONFIRMATION_NOT_SENT',
        message: 'Kode gagal dikirim. Coba lagi.',
      });
    }
    return { validMinutes: CODE_LIFETIME_MINUTES };
  }

  /** A right code confirms the session that entered it, and only that one, for 15 minutes. */
  async verify(
    userId: string,
    sessionId: unknown,
    code: string,
  ): Promise<{ confirmedUntil: string }> {
    const now = this.now();
    const codes = this.prisma.admin_confirmation_codes;
    // Only the newest code counts: asking again makes the older one useless.
    const row = (await codes.findFirst({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        code_hash: true,
        expires_at: true,
        attempts: true,
        used_at: true,
      },
    })) as CodeRow | null;
    if (row === null || !isLive(row, now)) throw expired();

    // Every submission takes one of the five tries before its code is compared, in one statement
    // that holds only while the code is live. Guesses that arrive together all read the row with
    // tries left, but only five of them get one, so no more than five codes are ever compared
    // against one email (OWASP A07:2025). It answers the count after this try, not the stale one
    // the row was read with.
    const taken = await this.prisma.$queryRaw<{ attempts: number }[]>`
      update admin_confirmation_codes set attempts = attempts + 1
      where id = ${row.id}::uuid and used_at is null and expires_at > ${now}
        and attempts < ${MAX_CODE_ATTEMPTS}
      returning attempts`;
    if (taken.length !== 1) throw expired();

    if (!sameToken(row.code_hash, this.hash(subjectOf(userId), code))) {
      const left = attemptsLeft(taken[0].attempts);
      if (left <= 0) throw expired();
      throw new UnprocessableEntityException({
        code: 'CONFIRMATION_WRONG',
        message: `Kode salah. Sisa ${left} percobaan.`,
        attemptsLeft: left,
      });
    }

    // Claimed first, so of two submissions of the same code only one goes on.
    const claimed = await codes.updateMany({
      where: { id: row.id, used_at: null },
      data: { used_at: now },
    });
    if (claimed.count !== 1) throw expired();

    const until = addMinutes(now, CONFIRMATION_WINDOW_MINUTES);
    if (!(await this.sessions.confirm(sessionId, until)))
      throw unauthenticated();
    return { confirmedUntil: until.toISOString() };
  }
}
