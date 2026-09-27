import { checkCallback, MAX_CODE_LENGTH, sameToken } from './callback.js';
import type { OAuthFlow } from './oauth-flow.js';

const FLOW: OAuthFlow = {
  state: 's'.repeat(43),
  nonce: 'n'.repeat(43),
  verifier: 'v'.repeat(43),
};
const CODE = '4/0AVG7fiQ-example-code';

describe('sameToken', () => {
  it('matches identical tokens', () => {
    expect(sameToken(FLOW.state, 's'.repeat(43))).toBe(true);
  });

  it.each([
    ['one different character', `${'s'.repeat(42)}t`],
    ['a shorter value', 's'.repeat(42)],
    ['a longer value', 's'.repeat(44)],
    ['an empty value', ''],
  ])('rejects %s', (_label, value) => {
    expect(sameToken(FLOW.state, value)).toBe(false);
  });
});

describe('checkCallback', () => {
  it('accepts the code when the state matches the flow that started it', () => {
    expect(checkCallback({ code: CODE, state: FLOW.state }, FLOW)).toEqual({
      ok: true,
      code: CODE,
      flow: FLOW,
    });
  });

  it('accepts a code of the maximum length', () => {
    const code = 'c'.repeat(MAX_CODE_LENGTH);

    expect(checkCallback({ code, state: FLOW.state }, FLOW)).toMatchObject({
      ok: true,
      code,
    });
  });

  it.each([
    [
      'no flow cookie (expired, already used, or never started here)',
      { code: CODE, state: FLOW.state },
      undefined,
    ],
    ['no state', { code: CODE }, FLOW],
    ['a forged state', { code: CODE, state: `${'s'.repeat(42)}x` }, FLOW],
    [
      'a state sent twice',
      { code: CODE, state: [FLOW.state, FLOW.state] },
      FLOW,
    ],
    ['no code', { state: FLOW.state }, FLOW],
    ['an empty code', { code: '', state: FLOW.state }, FLOW],
    ['a code sent twice', { code: [CODE, CODE], state: FLOW.state }, FLOW],
    [
      'an oversized code',
      { code: 'c'.repeat(MAX_CODE_LENGTH + 1), state: FLOW.state },
      FLOW,
    ],
    [
      'a Google error other than a refusal',
      { error: 'server_error', state: FLOW.state },
      FLOW,
    ],
  ])('fails the sign-in on %s', (_label, query, flow) => {
    expect(checkCallback(query, flow)).toMatchObject({
      ok: false,
      error: 'sign_in_failed',
    });
  });

  it('reports a refusal on the Google consent screen as cancelled', () => {
    expect(
      checkCallback({ error: 'access_denied', state: FLOW.state }, FLOW),
    ).toMatchObject({ ok: false, error: 'cancelled' });
  });

  it('does not trust a refusal whose state does not match', () => {
    expect(
      checkCallback({ error: 'access_denied', state: 'forged' }, FLOW),
    ).toMatchObject({ ok: false, error: 'sign_in_failed' });
  });

  it('checks the state before looking at the code', () => {
    expect(checkCallback({ code: CODE, state: 'forged' }, FLOW)).toMatchObject({
      ok: false,
      reason: 'state mismatch',
    });
  });
});
