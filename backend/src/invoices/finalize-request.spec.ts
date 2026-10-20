import { UnprocessableEntityException } from '@nestjs/common';
import { checkFinalizeRequest } from './finalize-request.js';

/** The per-field errors of the 422 the validator throws for `body`. */
function errorsFor(body: unknown): Record<string, string> {
  try {
    checkFinalizeRequest(body);
  } catch (error) {
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    const response = (error as UnprocessableEntityException).getResponse();
    expect(response).toMatchObject({ message: 'Data finalisasi tidak valid' });
    return (response as { errors: Record<string, string> }).errors;
  }
  return expect.unreachable('the request must be rejected');
}

describe('checkFinalizeRequest', () => {
  it.each([
    ['no body', undefined],
    ['an empty body', {}],
  ])('reads %s as not accepting a pending bonus', (_case, body) => {
    expect(checkFinalizeRequest(body)).toEqual({ acceptPendingBonus: false });
  });

  it.each([true, false])('takes acceptPendingBonus %s as sent', (accept) => {
    expect(checkFinalizeRequest({ acceptPendingBonus: accept })).toEqual({
      acceptPendingBonus: accept,
    });
  });

  // OWASP Top 10:2025 A05 (Injection): only a real boolean says the admin accepted.
  it.each(['true', 1, null, {}])(
    'refuses %j as acceptPendingBonus',
    (accept) => {
      expect(errorsFor({ acceptPendingBonus: accept })).toEqual({
        acceptPendingBonus: 'Harus berupa true atau false',
      });
    },
  );

  // OWASP Top 10:2025 A08 (Software and Data Integrity Failures): the snapshot, status and
  // instant stay the server's to set.
  it('refuses any field it does not take', () => {
    expect(
      errorsFor({ acceptPendingBonus: true, status: 'finalized', total: 1 }),
    ).toEqual({
      status: 'Field ini tidak dapat dikirim',
      total: 'Field ini tidak dapat dikirim',
    });
  });

  it.each([
    ['null', null],
    ['an array', [true]],
    ['a string', 'accept'],
  ])('refuses %s as the body', (_case, body) => {
    expect(errorsFor(body)).toEqual({ body: 'Data finalisasi tidak valid' });
  });
});
