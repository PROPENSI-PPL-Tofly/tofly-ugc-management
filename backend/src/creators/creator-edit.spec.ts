import { UnprocessableEntityException } from '@nestjs/common';
import { checkCreatorEdit } from './creator-edit.js';

const CONTRACT_ID = '22222222-2222-4222-8222-000000000002';

/** The field messages a body is refused with. */
function errorsOf(body: unknown): unknown {
  try {
    checkCreatorEdit(body);
  } catch (error) {
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    const response = (error as UnprocessableEntityException).getResponse() as {
      message: string;
      errors: unknown;
    };
    expect(response.message).toBe('Data creator tidak valid');
    return response.errors;
  }
  return expect.unreachable('the body must be refused');
}

describe('checkCreatorEdit', () => {
  it('reads every field, in the terms the database saves', () => {
    expect(
      checkCreatorEdit({
        name: '  Salsa Putri Amelia ',
        email: ' salsa@example.com ',
        instagramUsername: ' salsa.ig ',
        tiktokUsername: 'salsa.tt',
        contractId: CONTRACT_ID,
        contractType: 'regular',
        fixedRate: 4_500_000,
        quota: 8,
        contractEnd: '2027-01-31',
      }),
    ).toEqual({
      name: { first_name: 'Salsa', middle_name: 'Putri', last_name: 'Amelia' },
      email: 'salsa@example.com',
      usernames: { instagram: 'salsa.ig', tiktok: 'salsa.tt' },
      contractId: CONTRACT_ID,
      terms: {
        contractType: 'regular',
        fixedRate: 4_500_000,
        quota: 8,
        contractEnd: new Date('2027-01-31T00:00:00Z'),
      },
    });
  });

  it.each([[{}], [null], [undefined], [{ name: undefined }]])(
    'reads %j as an edit that changes nothing',
    (body) => {
      expect(checkCreatorEdit(body)).toEqual({ usernames: {}, terms: {} });
    },
  );

  // OWASP A01: only the form's own fields are read, whatever else the body carries.
  it('leaves out every field the form does not have', () => {
    expect(
      checkCreatorEdit({
        id: 'x',
        user_id: 'x',
        is_admin: true,
        access_token: 'x',
        contractStart: '2026-01-01',
        interval: 1,
        name: 'Salsa',
      }),
    ).toEqual({
      name: { first_name: 'Salsa', middle_name: null, last_name: null },
      usernames: {},
      terms: {},
    });
  });

  it('reads a blank username as clearing it', () => {
    expect(checkCreatorEdit({ instagramUsername: '  ' }).usernames).toEqual({
      instagram: '',
    });
  });

  it('takes a contract id on its own', () => {
    expect(checkCreatorEdit({ contractId: CONTRACT_ID })).toEqual({
      usernames: {},
      contractId: CONTRACT_ID,
      terms: {},
    });
  });

  // PBI-16 AC 3: the same rules, limits and messages as Tambah Creator.
  it.each([
    [{ name: ' ' }, { name: 'Nama wajib diisi' }],
    [{ name: null }, { name: 'Nama wajib diisi' }],
    [{ name: 'a'.repeat(101) }, { name: 'Nama maksimal 100 karakter' }],
    [{ email: '' }, { email: 'Email wajib diisi' }],
    [{ email: 'salsa@' }, { email: 'Format email tidak valid' }],
    [
      { instagramUsername: 'a'.repeat(101) },
      { instagramUsername: 'Username maksimal 100 karakter' },
    ],
    [
      { tiktokUsername: 'a'.repeat(101) },
      { tiktokUsername: 'Username maksimal 100 karakter' },
    ],
    [
      { instagramUsername: 7, tiktokUsername: null },
      {
        instagramUsername: 'Username tidak valid',
        tiktokUsername: 'Username tidak valid',
      },
    ],
    [
      { contractId: CONTRACT_ID, contractType: '' },
      { contractType: 'Jenis kontrak wajib dipilih' },
    ],
    [
      { contractId: CONTRACT_ID, contractType: 'magang' },
      { contractType: 'Jenis kontrak harus probation atau regular' },
    ],
    [
      { contractId: CONTRACT_ID, fixedRate: 0 },
      { fixedRate: 'Fixed rate harus lebih dari 0' },
    ],
    [
      { contractId: CONTRACT_ID, fixedRate: 10_000_001 },
      { fixedRate: 'Fixed rate terlalu besar' },
    ],
    [
      { contractId: CONTRACT_ID, fixedRate: '5000000' },
      { fixedRate: 'Fixed rate wajib diisi' },
    ],
    [
      { contractId: CONTRACT_ID, quota: 101 },
      { quota: 'Jumlah konten maksimal 100' },
    ],
    [
      { contractId: CONTRACT_ID, quota: 1.5 },
      { quota: 'Jumlah konten harus bilangan bulat' },
    ],
    [
      { contractId: CONTRACT_ID, contractEnd: '' },
      { contractEnd: 'Tanggal berakhir wajib diisi' },
    ],
    [
      { contractId: CONTRACT_ID, contractEnd: '2027-02-30' },
      { contractEnd: 'Tanggal berakhir tidak valid' },
    ],
  ])('refuses %j with its field message', (body, errors) => {
    expect(errorsOf(body)).toEqual(errors);
  });

  it.each([10_000_000, 1])('takes the fixed rate at its limits: %d', (fixedRate) => {
    expect(checkCreatorEdit({ contractId: CONTRACT_ID, fixedRate }).terms).toEqual({
      fixedRate,
    });
  });

  it.each([
    { contractType: 'regular' },
    { fixedRate: 1 },
    { quota: 1 },
    { contractEnd: '2027-01-31' },
    { contractId: 7, quota: 1 },
    { contractId: '' },
  ])('refuses %j, which names no period', (body) => {
    expect(errorsOf(body)).toEqual({ contractId: 'Periode tidak valid' });
  });

  it('names every problem of one body at once', () => {
    expect(errorsOf({ name: '', email: 'x', quota: 0 })).toEqual({
      name: 'Nama wajib diisi',
      email: 'Format email tidak valid',
      quota: 'Jumlah konten harus lebih dari 0',
      contractId: 'Periode tidak valid',
    });
  });
});
