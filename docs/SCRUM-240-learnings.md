# SCRUM-240 (PBI-39.2): Code request API: engineering notes

Branch `feat/code-request-api_240`, based on `feat/pbi-39-email-sign-in` at `06f8c6f2`.

## Design pattern: Ports and Adapters

`EmailCodeRequestService` (`backend/src/auth/email/email-code-request.service.ts`) depends on four ports and no
framework or database:

| Port | Adapter here | Fake in tests |
| --- | --- | --- |
| `LoginCodeIssuer` (`login-code-issuer.ts`) | `PrismaLoginCodeIssuer` | `FakeIssuer` in the service spec |
| `SignInCodeMailer` (`sign-in-code-mailer.ts`) | `unreadySignInCodeMailer`, a **placeholder** until SCRUM-239 | `vi.fn()` mailer; e2e overrides the provider |
| `WhitelistResolver` (Google's `ports.ts`) | `PrismaWhitelistResolver`, the same one Google sign-in uses | `vi.fn()` resolver |
| `LoginCodeHasher` (SCRUM-241's `login-code-hash.ts`) | `loginCodeHasher(LOGIN_CODE_SECRET)` | the real hasher with a test secret |

The clock, the code draw and the decoy draw are constructor parameters too, so every outcome is tested without
waiting, guessing or a database. `EmailCodeRequestModule` is the one place the adapters are chosen, which is where
39.1 swaps the placeholder for its `EmailSender` adapter.

## Three technical learnings

### 1. Answering the same is not enough to stop user enumeration

- **Problem found:** AC 2 asks for the same sentence whether or not an email is registered. But three other
  signals would still tell an attacker who is registered:
  - verify's answers: "Sisa 4 percobaan" for a real code, and nothing to count for an unknown one;
  - the hourly limit: it would only ever bite a registered email;
  - a missing `LOGIN_CODE_SECRET`: it would fail only the path that hashes.
- **Online research:** the OWASP *Forgot Password Cheat Sheet* asks for:
  - a consistent message for existing and non-existing accounts;
  - uniform response times, by processing asynchronously or by running the same logic for both instead of
    returning early;
  - protection against flooding, such as a per-account limit.
- **Solution applied:**
  - Every address takes one path. A code is drawn and hashed for everyone, and a row is stored for everyone.
  - An unknown or revoked email gets a **decoy row**: 32 random bytes as `code_hash`, the same length as an
    HMAC-SHA256, so no code matches it. This is what #172 asked for.
  - The limit counts decoys too, so it behaves the same for every address.
  - Hashing happens before the whitelist branch, so a missing secret fails every address alike.
- **What is left:** sending the email still takes time that an unknown email's request does not. AC 6 needs the
  send's result in the answer, so the send cannot be made asynchronous as OWASP suggests. The hourly limit caps
  how many timing samples one email allows.
- **Test evidence:**
  - `email-code-request.service.spec.ts`: unknown and registered emails get equal answers, and the decoy is
    stored; the limit refuses both alike; a missing secret fails both.
  - `email-code-request.e2e-spec.ts`: the same, through the real app and PostgreSQL.

### 2. Count-then-insert is a race; a transaction-level advisory lock closes it

- **Problem found:** "at most 5 codes per hour" is a read (count the rows) followed by a write (insert one). Under
  PostgreSQL's default Read Committed, two requests can both count four and both insert, giving six. A unique
  constraint cannot express "five per rolling hour".
- **Online research:**
  - The PostgreSQL documentation on Advisory Locks (§13.3.5, Explicit Locking) describes locks whose meaning the
    application defines.
  - Its Advisory Lock Functions (§9.28.10) describe `pg_advisory_xact_lock(bigint)`, a transaction-level lock
    that is released automatically when the transaction ends, with no unlock call to forget.
  - Vlad Mihalcea's *How do PostgreSQL advisory locks work* shows the same pattern for serialising work per key.
- **Solution applied:**
  - `PrismaLoginCodeIssuer` runs one interactive transaction per request.
  - Its first statement is `select pg_advisory_xact_lock(hashtextextended($1, 0))`, with
    `'login_codes:' || email` bound as a parameter (OWASP A05). The prefix keeps the key apart from any other
    advisory lock.
  - Requests for the same email queue behind it; other emails never wait.
  - The count, the "end every earlier live code" update and the insert all happen under that lock.
- **Test evidence:**
  - `prisma-login-code-issuer.spec.ts`: the call order (lock, window, end earlier, store); the exact SQL with the
    email bound; the 5th code is let through and the 6th refused.
  - `email-code-request.e2e-spec.ts`: ten **simultaneous** requests for one email yield exactly five 200s, five
    429s and five rows.

### 3. A six-digit code needs a uniform CSPRNG and a keyed hash

- **Problem found:**
  - `Math.random()` is not cryptographically secure.
  - `randomBytes(n) % 1_000_000` is biased, because 2^32 is not a multiple of a million, so low codes come up
    more often.
  - A plain SHA-256 of six digits is reversed by trying all million codes against a stolen row.
- **Online research:**
  - The Node.js `crypto.randomInt(min, max)` documentation says it returns a uniformly distributed integer and
    rejects out-of-range samples instead of taking a modulo.
  - SCRUM-241's notes explain the HMAC choice, with the key outside the database.
- **Solution applied:**
  - `newLoginCode` uses `crypto.randomInt(0, 1_000_000)`, zero-padded to six digits.
  - `login_codes.code_hash` has a check of `^[0-9a-f]{64}$`, so even a bug cannot store a code in the clear (AC 12).
  - The hash comes from SCRUM-241's own `loginCodeHasher`, brought in byte-identical, so request and verify
    cannot drift apart.
- **Test evidence:**
  - `login-code-request.spec.ts`: the draw covers `[0, 1_000_000)`, and `0`, `42` and `999999` are padded.
  - `login-codes-table.e2e-spec.ts`: `'123456'`, an upper-case hash and a 63-character hash are all refused.
  - The e2e request test checks that the stored hash is the HMAC of the emailed code.

## OWASP Top 10:2025 safeguards

| Category | Safeguard | Test |
| --- | --- | --- |
| A01 Broken Access Control | Same-origin only. Only a whitelisted creator or admin is sent a code; a revoked creator, for whom the resolver answers null, gets a decoy. `login_codes` has RLS on and all rights revoked from `anon`/`authenticated`. | controller spec, service spec, table e2e |
| A04 Cryptographic Failures | CSPRNG code, HMAC-SHA256 under `LOGIN_CODE_SECRET`, a 64-hex check on the column. | rules spec, table e2e, request e2e |
| A05 Injection | The body is validated with Add Creator's email rule (at most 254 characters, 422 naming the field). The email is bound, never spliced, into the lock query. | body spec, issuer spec |
| A06 Insecure Design | An atomic per-email rolling-hour limit, with `Retry-After` on refusal. | issuer spec, concurrency e2e |
| A07 Authentication Failures | One answer, one path, decoy rows and a limit that counts decoys: whether an email is registered cannot be read. A new code ends every earlier one (AC 4). | service spec, request e2e |
| A09 Logging and Alerting Failures | A failed send is logged as "Sign-in code email not sent: <ErrorClass>", other failures as "Sign-in code request failed: <ErrorClass>"; the email and the code never reach the log (AC 6, 12). | service spec |

## Integration dependencies

1. **SCRUM-239 (39.1):** `SIGN_IN_CODE_MAILER` is bound to `unreadySignInCodeMailer`, a **placeholder** that
   rejects with `PortNotReady`.
   - 39.1 implements `SignInCodeMailer.sendSignInCode(to, code)` over its `EmailSender` and template (sender
     "Tofly", subject "Kode masuk Tofly"), rejecting on failure.
   - It binds that adapter in `email-code-request.module.ts`.
   - Until then a whitelisted email answers `503 CODE_SEND_FAILED`.
2. **SCRUM-241 (39.3, #172):** the table is ready for its `LoginCodeStore` Prisma adapter. The shared files are
   byte-identical to its branch, so the two PRs merge cleanly in either order.

## Sources

- [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
- PostgreSQL documentation, §13.3.5 Advisory Locks and §9.28.10 Advisory Lock Functions (postgresql.org/docs)
- [Vlad Mihalcea, How do PostgreSQL advisory locks work](https://vladmihalcea.com/how-do-postgresql-advisory-locks-work)
- Node.js documentation, `crypto.randomInt([min, ]max[, callback])` (nodejs.org/api/crypto.html)
