# SCRUM-242 (PBI-39.4): Email Code Sign-in Screens: engineering notes

Branch `feat/email-code-sign-in-ui_242`, based on `feat/pbi-39-email-sign-in` at `06f8c6f`, independent of 39.2.

## What the screen does

On `/login`, below "Masuk dengan Google" and an "atau" divider, a **Masuk dengan Email** button opens a two-step form:

1. **Email step:** one email field (`type="email"`, `autocomplete="email"`), **Kirim Kode** and **Batal**.
   - The email is trimmed and lower-cased, then checked with the Add Creator rule (`EMAIL_FORMAT`, at most 254
     characters) before any request is sent.
   - While the request is pending, the field and both buttons are locked and the button reads "Mengirim…".
2. **Code step:** the answer every address gets ("Kalau email kamu terdaftar, kode sudah dikirim."), the address,
   six code boxes, **Masuk**, **Kirim Ulang** and **Ganti email**.
   - **Code boxes:** typing moves on, Backspace steps back, and the arrow keys move between boxes. A code that is pasted
     or autofilled (`autocomplete="one-time-code"`) into any box fills all six.
   - **Kirim Ulang:** locked for 60 seconds, showing "Kirim Ulang (59 detik)" as it counts down, then unlocked. A
     successful resend clears the boxes and starts the 60 seconds again.
     - The backend makes the new code the only valid one. The screen does not pretend to invalidate anything itself.
   - **Checking:** while a code is being checked, everything is locked and the button reads "Memeriksa…".
   - **After sign-in:** the browser leaves with a full page load to `redirectTo`, as it does after Google. The screen
     stays locked while it goes.

## API contracts used

Both calls go through this app's `/api` proxy, which is same-origin and passes on `Origin` and `Set-Cookie`.

| Call | Answer | Outcome | What the screen says |
|---|---|---|---|
| `POST /auth/email/request` `{ email }` (39.2) | 200 | `sent` | Moves to the code step: "Kalau email kamu terdaftar, kode sudah dikirim." |
| | 429 `{ code: TOO_MANY_REQUESTS, retryAfterMinutes }` | `limited` | "Terlalu banyak permintaan. Coba lagi dalam *n* menit." (without *n* if the field is missing) |
| | 422 `{ errors.email }` | `invalid` | The backend's field message under the email |
| | 503 `CODE_NOT_SENT`, any other answer, or no network | `not_sent` | "Kode gagal dikirim. Coba lagi." |
| `POST /auth/email/verify` `{ email, code }` (39.3, #172) | 200 `{ redirectTo }` | `signed_in` | Leaves for `redirectTo`, if it is a role's home (see A01) |
| | 422 `{ code: CODE_WRONG, attemptsLeft }` | `wrong` | "Kode salah. Sisa *n* percobaan." |
| | other 422 (`Data tidak valid`) | `invalid` | "Masukkan 6 digit kode." |
| | 410 `CODE_EXPIRED` | `expired` | "Kode sudah tidak berlaku. Minta kode baru dengan Kirim Ulang." |
| | 403 `ACCESS_DENIED` | `denied` | "Email ini tidak punya akses ke Tofly. Hubungi Admin untuk meminta akses." |
| | 503 `SIGN_IN_FAILED`, any other answer, or no network | `failed` | "Gagal masuk. Silakan coba lagi." |

I checked both against the code: 39.2 in `email-request.controller.ts` on `feat/email-code-request_240`, and 39.3 in
`email-verify.controller.ts` on `feat/email-code-verification_241` at `56d99bf`. **No discrepancy was found.**

The 39.2 strings are the backend's own. 39.3 answers with codes only, and its controller says "the sign-in screen
owns the wording". So the verify messages are written here. **They still need the PO's confirmation**, because the
PBI text I worked from does not spell them out.

## Design patterns

- **Adapter:** `frontend/src/lib/email-sign-in-api.ts` turns HTTP answers into the `CodeRequestOutcome` and
  `CodeVerifyOutcome` unions.
  - The screens never read a status code or a body, so if 39.2 or 39.3 changes how it answers, only this file
    changes.
  - The component tests replace it with a `vi.mock` stub, so 39.4 is tested without either backend PR merged.
- **Custom hook:** `useCountdown` (`components/auth/use-countdown.ts`) owns the one interval behind Kirim Ulang and
  clears it at zero, on restart and on unmount.
- **Reusable component:** `CodeBoxes` (`components/auth/code-boxes.tsx`) is a controlled input. The code lives in its
  parent's state only.
- **A step component per screen:** `EmailStep` and `CodeStep` inside `email-code-sign-in.tsx`. Leaving the code step
  unmounts it, which is what stops its countdown.

Reused rather than rebuilt:
- `Button`, `FIELD` and `FIELD_ERROR`;
- `EMAIL_FORMAT` and `MAX_EMAIL_LENGTH` from `creator-form.ts`, with `EMAIL_FORMAT` newly exported;
- `readBody` and `homeFor`;
- `digitsOnly`;
- the login page's alert style, now `ALERT` in `form-classes.ts`.

## OWASP Top 10 (2025)

| Category | Risk on this screen | What the code does | Test |
|---|---|---|---|
| A01 Broken Access Control | `redirectTo` turned into an open redirect | Only `homeFor("admin")` or `homeFor("creator")` is followed; anything else goes to `/` | `email-sign-in-api.test.ts`: "goes to / instead of another site / a protocol-relative link / a script URL / another page of the app / no destination" |
| A06 Insecure Design | The screen revealing whether an email is registered | Every `sent` shows the same fixed sentence and moves on, whatever the address. The countdown is only a convenience: the real limit is 39.2's five per hour | "moves to the code step with the one answer every address gets" |
| A07 Authentication Failures | Codes leaking or being retried carelessly | Each check is sent once (a ref guard against double submits); the attempts left are shown as the backend counts them; the boxes clear after each refusal; the code is never stored | "checks only once when the code is sent twice…", "announces { kind: 'wrong', attemptsLeft: 3 }…" |
| A09 Security Logging and Alerting Failures | A code ending up in a log or in storage | Nothing is written to the console, `localStorage`, `sessionStorage` or a cookie | "never writes the code to browser storage or the console, whatever the answer" |
| A10 Mishandling of Exceptional Conditions | A 500, an HTML error page or a dropped connection showing raw server text, or leaving the screen stuck | Every unplanned answer reads as `not_sent` or `failed` with fixed wording, and the screen unlocks | "reads a 500 / a body that is not JSON / a network failure as not sent (failed)" |

React escapes every message as text, and nothing uses `dangerouslySetInnerHTML`.

## Dependencies and known limitations

- **39.2 and 39.3 are not merged into the base yet.** Until 39.2 lands, `/api/auth/email/request` answers 404, which
  shows as "Kode gagal dikirim. Coba lagi.". Until 39.3's Prisma store exists, every verify answers 503, which shows as
  "Gagal masuk. Silakan coba lagi.". The UI is tested against stubs of both contracts.
- **39.1 (SMTP) isn't merged.** Until it is, every registered email gets "Kode gagal dikirim". That is 39.2's
  documented pre-39.1 gap.
- **Rate limited on the email step:** a 429 keeps the user on the email step with the wait shown, even though an
  earlier code may still be valid. That is the simplest reading of the ACs; it can change if the PO prefers otherwise.
- **The verify wording** above needs the PO's sign-off.
- **The 60-second countdown is client-side.** Reloading the page resets it. The five-per-hour limit in 39.2 is what
  actually stops abuse.

## Three technical learnings

### 1. The `redirectTo` from the backend still needed checking

- **Problem I found:** while reading 39.3's contract, I noticed it answers `{ redirectTo }`. The obvious implementation
  is `location.assign(redirectTo)`, which means the login page sends someone wherever a response tells it to. Today
  the backend only sends a role's home. But if that ever changed, or a proxy rewrote the body, our sign-in page would
  be an open redirect right after someone typed a real code. So I wrote the check into the very first RED test,
  before any screen existed.
- **Solution I considered and why:**
  - **Trust the backend:** simplest, but it makes the frontend's safety depend on another subtask never changing.
  - **Check the URL's shape** (starts with `/`, not `//`): easy to get wrong. `/\evil.example` and encoded variants
    are the classic misses.
  - **What I chose:** an allow-list of the two real homes from `homeFor`, which are the same paths the backend's
    `landingPath` returns. Anything else goes to `/`, which already sends a signed-in user home.
- **What I did:** `safeDestination` in `email-sign-in-api.ts`, with tests for another site, a protocol-relative link,
  `javascript:`, another app page and a missing value. The browser then leaves with a full page load, like the Google
  flow, so nothing cached from before sign-in survives.

### 2. Six boxes have to behave like one field

- **Problem I found:** six separate inputs sounds simple until you paste. A pasted code lands in one box, phone
  autofill puts all six digits into the first box's `onChange`, and typing over a filled box gives the input two
  characters, the old one and the new one, in either order depending on where the cursor was.
- **Solution I considered and why:**
  - **One hidden input with six fake boxes drawn over it:** pasting and autofill work for free. But screen readers and
    focus styles get confusing, and the boxes are not real controls.
  - **A library:** an extra dependency for about a hundred lines.
  - **What I chose:** six real inputs, controlled by one string in the parent. Every change goes through one `fill`
    function that writes digits from a starting box and moves focus after the last one.
- **What I did:**
  - `CodeBoxes` keeps only digits.
  - A paste of six or more digits fills from the first box wherever it was pasted. A shorter paste fills from the box
    it was pasted into.
  - Typing over a box keeps the new digit (`digits.replace(old, "")`).
  - Backspace on an empty box steps back and clears that one.
  - Each box has an accessible name ("Digit 1 dari 6"), and only the first offers `one-time-code` autofill.
  - All of this is in the 18 tests in `code-boxes.test.tsx`.

### 3. Timers and focus follow React's render, not my code's order

- **Problem I found:** two things that looked obviously right failed in tests.
  - **The countdown:** my first version chained one `setTimeout` per second from an effect. With fake timers,
    advancing 60 seconds only ticked once, because the next timeout only exists after React re-renders.
  - **Focus:** after a wrong code I called `focus()` on the first box straight away, but the boxes were still
    `disabled` from the pending check, and a disabled input cannot take focus.
- **Solution I considered and why:**
  - **The countdown:** I could have made the tests step one second at a time. But that would just hide that the
    timer depended on render timing. So I switched to one `setInterval` per run, which counts on its own and is
    cleared at zero, on restart and on unmount.
  - **Focus:** `setTimeout(focus, 0)` would probably have worked, but it is guessing. Instead, focus moves in an effect
    that runs when `busy` goes back to null, which is exactly the render that enables the boxes.
- **What I did:**
  - `useCountdown` has tests for 60 → 59 → 1, stopping at zero, restarting while still counting (one timer only) and
    unmounting.
  - The screen test "leaves no countdown running once the screen goes back to the email step" watches the interval
    being cleared. Counting all timers did not work, because React keeps timers of its own; I fixed that test in its
    own [TEST] commit.
  - The six "announces … and clears the boxes for another try" tests check that the first box has focus again.
