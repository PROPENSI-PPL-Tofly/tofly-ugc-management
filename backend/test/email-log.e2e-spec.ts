import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

// The email_log table itself (PBI-11, SCRUM-307): one row per email an event sends to a recipient,
// so a retried event never sends twice (AC 8) and a failed send keeps what the 08:00 run needs to
// try again (AC 9). Its API-role grants and RLS are held by data-api-access.e2e-spec.ts.

describe('email_log (e2e)', () => {
  const prisma = new PrismaClient();
  const eventKey = `e2e-${randomUUID()}`;

  afterAll(async () => {
    await prisma.$executeRaw`delete from email_log where event_key = ${eventKey}`;
    await prisma.$disconnect();
  });

  /** Inserts one row; answers the error, if any. */
  function insert(
    recipient: string,
    extra: { status?: string; attempts?: number } = {},
  ): Promise<unknown> {
    return prisma.$executeRaw`
      insert into email_log (event_key, template, recipient, payload, status, attempts)
      values (${eventKey}, 'content_scheduled', ${recipient},
              ${JSON.stringify({ contentName: 'Evg_1' })}::jsonb,
              ${extra.status ?? 'pending'}::email_status, ${extra.attempts ?? 0})`
      .then(() => null)
      .catch((error: unknown) => error);
  }

  it('stores an email with its template data, pending, not yet tried', async () => {
    expect(await insert('salsa@example.com')).toBeNull();

    const [row] = await prisma.$queryRaw<
      {
        id: string;
        template: string;
        payload: unknown;
        status: string;
        attempts: number;
        last_error: string | null;
        sent_at: Date | null;
        created_at: Date;
      }[]
    >`
      select id, template, payload, status::text, attempts, last_error, sent_at, created_at
      from email_log where event_key = ${eventKey} and recipient = 'salsa@example.com'`;
    expect(row).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      template: 'content_scheduled',
      payload: { contentName: 'Evg_1' },
      status: 'pending',
      attempts: 0,
      last_error: null,
      sent_at: null,
      created_at: expect.any(Date),
    });
  });

  // AC 8: the unique key is what stops a retried event from sending a second email.
  it('refuses a second email for the same event and recipient', async () => {
    expect(String(await insert('salsa@example.com'))).toMatch(
      /23505[\s\S]*Key \(event_key, recipient\)/,
    );
  });

  it('sends the same event to another recipient', async () => {
    expect(await insert('rina@example.com')).toBeNull();
  });

  it('knows only pending, sent and failed', async () => {
    expect(String(await insert('x@example.com', { status: 'bounced' }))).toMatch(
      /invalid input value for enum email_status/,
    );
  });

  // AC 9: up to 3 attempts in total.
  it.each([-1, 4])('refuses %i attempts', async (attempts) => {
    expect(String(await insert(`a${attempts}@example.com`, { attempts }))).toMatch(
      /violates check constraint/,
    );
  });
});
