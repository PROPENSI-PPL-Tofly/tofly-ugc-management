import {
  newFlow,
  parseFlow,
  pkceChallenge,
  randomToken,
  serializeFlow,
} from './oauth-flow.js';

const BASE64URL_43 = /^[A-Za-z0-9_-]{43}$/;

describe('randomToken', () => {
  it('is 32 random bytes as unpadded base64url', () => {
    expect(randomToken()).toMatch(BASE64URL_43);
  });

  it('never repeats', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => randomToken()));

    expect(tokens.size).toBe(50);
  });
});

describe('pkceChallenge', () => {
  it('matches the S256 example in RFC 7636 appendix B', () => {
    expect(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });
});

describe('newFlow', () => {
  it('draws a separate value for the state, the nonce and the verifier', () => {
    const values = ['state-value', 'nonce-value', 'verifier-value'];
    const random = vi.fn(() => values.shift()!);

    expect(newFlow(random)).toEqual({
      state: 'state-value',
      nonce: 'nonce-value',
      verifier: 'verifier-value',
    });
    expect(random).toHaveBeenCalledTimes(3);
  });

  it('uses fresh random values by default', () => {
    const flow = newFlow();

    expect(flow.state).toMatch(BASE64URL_43);
    expect(flow.nonce).toMatch(BASE64URL_43);
    expect(flow.verifier).toMatch(BASE64URL_43);
    expect(new Set([flow.state, flow.nonce, flow.verifier]).size).toBe(3);
  });
});

describe('serializeFlow / parseFlow', () => {
  it('round-trips a flow through the cookie value', () => {
    const flow = newFlow();

    expect(parseFlow(serializeFlow(flow))).toEqual(flow);
  });

  it.each([
    ['no cookie', undefined],
    ['a non-string cookie', 42],
    ['an empty cookie', ''],
    ['two parts', `${'a'.repeat(43)}.${'b'.repeat(43)}`],
    ['four parts', Array(4).fill('a'.repeat(43)).join('.')],
    ['a short part', `${'a'.repeat(42)}.${'b'.repeat(43)}.${'c'.repeat(43)}`],
    ['a part outside base64url', `${'a'.repeat(42)}+.${'b'.repeat(43)}.${'c'.repeat(43)}`],
    ['a trailing payload', `${'a'.repeat(43)}.${'b'.repeat(43)}.${'c'.repeat(43)}x`],
  ])('rejects %s', (_label, value) => {
    expect(parseFlow(value)).toBeUndefined();
  });
});
