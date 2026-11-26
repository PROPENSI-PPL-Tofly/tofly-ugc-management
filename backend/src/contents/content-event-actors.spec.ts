import {
  ADMIN_ACCOUNT_SELECT,
  ADMIN_ACTOR_NAME,
  adminLabel,
  adminName,
} from './content-event-actors.js';

const EMAIL = 'sinta.admin@tofly.id';

describe('adminLabel (PBI-23, 23.10)', () => {
  it("names an admin by the account's name", () => {
    expect(adminLabel({ name: 'Sinta Dewi', email: EMAIL })).toBe('Sinta Dewi');
  });

  it.each([
    ['null', null],
    ['not read', undefined],
    ['empty', ''],
    ['only spaces', '   '],
  ])('falls back to the email when the name is %s', (_label, name) => {
    expect(adminLabel({ name, email: EMAIL })).toBe(EMAIL);
  });

  it('shows the name without the spaces around it', () => {
    expect(adminLabel({ name: '  Sinta Dewi ', email: EMAIL })).toBe(
      'Sinta Dewi',
    );
  });

  it('keeps a name of the full 100 characters whole', () => {
    const name = 'a'.repeat(100);

    expect(adminLabel({ name, email: EMAIL })).toBe(name);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
  ])('names no one when the account is %s', (_label, account) => {
    expect(adminLabel(account)).toBeNull();
  });
});

describe('adminName', () => {
  it('is the label of an account', () => {
    expect(adminName({ name: 'Sinta Dewi', email: EMAIL })).toBe('Sinta Dewi');
  });

  it('says Admin only when no account is behind the action', () => {
    expect(adminName(null)).toBe(ADMIN_ACTOR_NAME);
  });
});

describe('ADMIN_ACCOUNT_SELECT', () => {
  // OWASP A01: a read that names an admin takes these two columns, never the role or status.
  it('reads only the name and the email', () => {
    expect(ADMIN_ACCOUNT_SELECT).toEqual({ name: true, email: true });
  });
});
