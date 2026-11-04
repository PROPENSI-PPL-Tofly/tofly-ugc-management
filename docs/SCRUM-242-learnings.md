# SCRUM-242 (PBI-39.4): Email code sign-in screens: engineering notes

Branch `feat/email-code-sign-in-screens_242`, based on `feat/pbi-39-email-sign-in` at `06f8c6f2`.

## Design patterns: State and Adapter

- **State:** `frontend/src/components/auth/email-sign-in-flow.ts` is a pure reducer over three step shapes:
  - `closed`;
  - `email` (email, busy, error, field error);
  - `code` (email, code, busy, notice, error, invalid).

  Each `FlowEvent` either moves the flow to the next shape or returns it unchanged. That means an answer arriving
  for a step the screen has already left cannot change anything. `EmailCodeSignIn` only renders the current shape,
  dispatches events and runs the two side effects: starting the countdown and leaving for the home page.
- **Adapter:** `frontend/src/lib/email-sign-in-api.ts` turns the two endpoints' HTTP answers into
  `CodeRequestOutcome` and `CodeVerifyOutcome`. The screens never read a status code or a body, so the backend can
  change how it answers without touching a component. Tests replace the adapter with a `vi.mock` stub, and the
  adapter's own tests stub `fetch`.

## Three technical learnings

### 1. A redirect target from an API answer is still untrusted input

- **Problem found:** verify answers `{ redirectTo }`, and the screen sends the browser there. If anything ever made
  that field hold `https://evil.example` or `//evil.example`, a sign-in page would become an open redirect, and the
  user would arrive on a phishing page fresh from entering a real code.
- **Online research:** the OWASP *Unvalidated Redirects and Forwards Cheat Sheet* recommends:
  - not taking the destination from input at all where possible;
  - otherwise, mapping it against an allow-list of known destinations rather than trying to sanitise a URL.
- **Solution applied:**
  - `safeHome` follows `redirectTo` only when it is exactly one of `homeFor("admin")` or `homeFor("creator")`.
  - Anything else goes to `/`, which already sends a signed-in user to their home.
  - The browser leaves with a full page load, as `api-client.ts` does, so no router cache from before sign-in
    survives.
- **Test evidence:** `email-sign-in-api.test.ts` › "goes to / instead of …": another site, a protocol-relative
  link, another app page and a missing value all land on `/`, and both real homes are followed.

### 2. Six boxes need to behave like one field

- **Problem found:** AC 7 asks for six single-digit boxes that accept a pasted code. Naively each box holds one
  character, so:
  - a paste of `482913` into the first box keeps only the `4`;
  - the phone's "code from Messages/Mail" suggestion fills one box;
  - Backspace in an empty box does nothing.
- **Online research:**
  - The HTML standard's `autocomplete="one-time-code"` token (added in whatwg/html#4573; browser support is listed
    on caniuse) lets iOS and Android offer the code from a just-received message.
  - Browsers put the whole code into the one field that carries it.
- **Solution applied:**
  - The first box carries `autocomplete="one-time-code"`; the others carry `off`.
  - Any change of more than one character, and any paste in any box, is read as the whole code. Its digits are
    pulled out, up to six, so "Kode masuk: 482913." still works.
  - Focus moves forward on a digit and back on Backspace in an empty box.
  - Focus selects the box's digit, so typing over it replaces it.
- **Test evidence:** `code-boxes.test.tsx`:
  - a paste into box 4, a paste with spaces, a paste inside a sentence, and a short and a long paste;
  - the browser filling one box with six digits;
  - Backspace in an empty, a filled and the first box.

### 3. A Tolerant Reader keeps a broken answer from reaching the screen

- **Problem found:** the screens print numbers from the backend: minutes to wait and attempts left. A proxy error
  page, a missing field or a string `"17"` would otherwise render as "Coba lagi dalam undefined menit" or
  "Sisa NaN percobaan".
- **Online research:**
  - Martin Fowler's *Tolerant Reader*: read only what you need and be liberal in what you accept.
  - React's *Extracting State Logic into a Reducer*: keep transitions pure, so each answer's effect is a testable
    function of state and event.
- **Solution applied:**
  - `readBody` accepts only a JSON object.
  - `positiveWhole` accepts only a whole number above 0, else a safe default: 60 seconds, 60 minutes.
  - `fieldError` accepts only text.
  - On verify, an `attemptsLeft` outside 1 to 4, which no live code can have, reads as expired, matching what the
    backend says for the 5th wrong attempt (AC 8).
- **Test evidence:** `email-sign-in-api.test.ts` covers no body, text, a negative, a fraction, a string, a list, a
  missing field error and the impossible attempt counts 0, 5, 2.5, `"3"` and none.

## OWASP Top 10:2025 safeguards

| Category | Safeguard | Test |
| --- | --- | --- |
| A01 Broken Access Control | `redirectTo` is followed only to a role's home (allow-list), else `/`. Calls go only to the same-origin `/api` proxy. | adapter test |
| A05 Injection | The email is checked (required, Add Creator's `EMAIL_FORMAT`, at most 254 characters) before it is sent, and the code is digits only. | flow test, code boxes test |
| A07 Authentication Failures | One sentence for every address (AC 2). The screen shows verify's refusals as given and never guesses whether an email is registered. The resend is locked for 60 s (AC 4). | component test |
| A08 Software or Data Integrity Failures | The Tolerant Reader shows no malformed number, and an impossible attempt count reads as expired. | adapter test |
| A09 Logging and Alerting Failures | The client logs nothing, so no email or code ends up in a browser console or an error tracker. | — |

## Integration dependencies

- `POST /api/auth/email/request`: SCRUM-240 (#173).
- `POST /api/auth/email/verify`: SCRUM-241 (#172), read exactly as that PR's table gives it.

Neither is merged into the PBI branch yet. No placeholder was needed, because both contracts are written down; the
tests stub the adapter instead. "Gagal masuk. Coba lagi." for `SIGN_IN_FAILED` is not in the ACs and is open to
change.

## Sources

- [OWASP Unvalidated Redirects and Forwards Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html)
- [whatwg/html#4573: autocomplete="one-time-code"](https://github.com/whatwg/html/pull/4573)
- [caniuse: autocomplete one-time-code](https://caniuse.com/mdn-html_elements_form_autocomplete_one-time-code)
- [React: Extracting State Logic into a Reducer](https://react.dev/learn/extracting-state-logic-into-a-reducer)
- Martin Fowler, *TolerantReader* (martinfowler.com/bliki/TolerantReader.html)
