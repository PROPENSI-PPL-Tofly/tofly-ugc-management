import { UnprocessableEntityException } from '@nestjs/common';
import { checkAdminRename, checkNewAdmin } from './admin-user-input.js';

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
    // The name shows in the Pengguna Admin table and in Log Aktivitas, one line each.
    ['a name over two lines', { name: 'Sinta\nDewi' }, { name: 'Nama berisi karakter yang tidak diizinkan' }],
    ['a name with a tab', { name: 'Sinta\tDewi' }, { name: 'Nama berisi karakter yang tidak diizinkan' }],
    ['a name with a carriage return', { name: 'Sinta\rDewi' }, { name: 'Nama berisi karakter yang tidak diizinkan' }],
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

describe('checkAdminRename', () => {
  it('reads the new name, trimmed', () => {
    expect(checkAdminRename({ name: ' Bima Santoso ' })).toEqual({
      name: 'Bima Santoso',
    });
  });

  // The email never changes: a different address is a new Admin (prototype, "Ubah Admin").
  it('ignores an email in the body', () => {
    expect(
      checkAdminRename({ name: 'Bima', email: 'other@tofly.id' }),
    ).toEqual({ name: 'Bima' });
  });

  it.each([
    ['no name', {}, 'Nama wajib diisi'],
    ['a name over 100 characters', { name: 'n'.repeat(101) }, 'Nama maksimal 100 karakter'],
    ['a name over two lines', { name: 'Bima\nSantoso' }, 'Nama berisi karakter yang tidak diizinkan'],
  ])('refuses %s', (_label, body, message) => {
    expect(errorsOf(() => checkAdminRename(body))).toEqual({
      message: 'Data admin tidak valid',
      errors: { name: message },
    });
  });
});
