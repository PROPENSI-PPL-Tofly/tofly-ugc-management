import { UnprocessableEntityException } from '@nestjs/common';
import {
  checkAdminChange,
  checkConfirmationCode,
  checkNewAdmin,
} from './admin-user-input.js';

// SCRUM-246 (PBI-23): "Tambah Admin" asks for name (max 100), email (valid, max 254) and role.

function errorsOf(attempt: () => unknown): unknown {
  try {
    attempt();
  } catch (error) {
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    return (error as UnprocessableEntityException).getResponse();
  }
  throw new Error('expected a refusal');
}

describe('checkNewAdmin', () => {
  it('reads a name, a lower-cased email and a role, each trimmed', () => {
    expect(
      checkNewAdmin({
        name: '  Sinta Dewi ',
        email: ' Sinta@Tofly.ID ',
        role: 'super_admin',
      }),
    ).toEqual({ name: 'Sinta Dewi', email: 'sinta@tofly.id', role: 'super_admin' });
  });

  it('keeps a name of exactly 100 characters and an email of exactly 254', () => {
    const email = `${'a'.repeat(244)}@tofly.id`;
    expect(email).toHaveLength(253);
    const longest = `a${email}`;

    expect(
      checkNewAdmin({ name: 'n'.repeat(100), email: longest, role: 'admin' }),
    ).toMatchObject({ name: 'n'.repeat(100), email: longest });
  });

  it('names every field that is wrong at once, under its own key', () => {
    expect(errorsOf(() => checkNewAdmin({}))).toEqual({
      message: 'Data admin tidak valid',
      errors: {
        name: 'Nama wajib diisi',
        email: 'Email wajib diisi',
        role: 'Role wajib dipilih',
      },
    });
  });

  it.each([
    ['a name over 100 characters', { name: 'n'.repeat(101) }, { name: 'Nama maksimal 100 karakter' }],
    ['a blank name', { name: '   ' }, { name: 'Nama wajib diisi' }],
    ['a name that is not text', { name: 42 }, { name: 'Nama wajib diisi' }],
    ['an email that is no address', { email: 'sinta' }, { email: 'Format email tidak valid' }],
    ['an email over 254 characters', { email: `${'a'.repeat(250)}@t.id` }, { email: 'Format email tidak valid' }],
    ['a role the app does not know', { role: 'owner' }, { role: 'Role wajib dipilih' }],
  ])('refuses %s', (_label, field, expected) => {
    const body = { name: 'Sinta', email: 'sinta@tofly.id', role: 'admin', ...field };

    expect(errorsOf(() => checkNewAdmin(body))).toEqual({
      message: 'Data admin tidak valid',
      errors: expected,
    });
  });

  // A missing or odd body is a form left blank, not a crash.
  it.each([null, undefined, 'text'])('reads %s as a blank form', (body) => {
    expect(errorsOf(() => checkNewAdmin(body))).toMatchObject({
      errors: { name: 'Nama wajib diisi' },
    });
  });
});

describe('checkAdminChange', () => {
  it('reads the new name, trimmed', () => {
    expect(checkAdminChange({ name: ' Bima Santoso ' })).toEqual({
      name: 'Bima Santoso',
    });
  });

  // The email never changes: a different address is a new Admin (prototype, "Ubah Admin").
  it('ignores an email in the body', () => {
    expect(
      checkAdminChange({ name: 'Bima', email: 'other@tofly.id' }),
    ).toEqual({ name: 'Bima' });
  });

  it('reads a role when the form sends one', () => {
    expect(checkAdminChange({ name: 'Bima', role: 'super_admin' })).toEqual({
      name: 'Bima',
      role: 'super_admin',
    });
  });

  it('refuses a role the app does not know', () => {
    expect(
      errorsOf(() => checkAdminChange({ name: 'Bima', role: 'owner' })),
    ).toEqual({
      message: 'Data admin tidak valid',
      errors: { role: 'Role wajib dipilih' },
    });
  });

  it.each([
    ['no name', {}, 'Nama wajib diisi'],
    ['a name over 100 characters', { name: 'n'.repeat(101) }, 'Nama maksimal 100 karakter'],
  ])('refuses %s', (_label, body, message) => {
    expect(errorsOf(() => checkAdminChange(body))).toEqual({
      message: 'Data admin tidak valid',
      errors: { name: message },
    });
  });
});

describe('checkConfirmationCode', () => {
  it('reads six digits, trimmed', () => {
    expect(checkConfirmationCode({ code: ' 482193 ' })).toBe('482193');
  });

  it.each([
    ['five digits', { code: '48219' }],
    ['letters', { code: '48219a' }],
    ['no code', {}],
    ['a number', { code: 482193 }],
  ])('refuses %s', (_label, body) => {
    expect(errorsOf(() => checkConfirmationCode(body))).toEqual({
      message: 'Kode tidak valid',
      errors: { code: 'Kode harus 6 angka' },
    });
  });
});
