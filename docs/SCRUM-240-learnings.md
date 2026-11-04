# SCRUM-240 (PBI-39.2): Code Request API: engineering notes

Branch `feat/email-code-request_240`, based on `feat/pbi-39-email-sign-in` at `06f8c6f`.

`POST /auth/email/request` with `{ "email": "creator@example.com" }`:

| Outcome | Status | Body |
|---|---|---|
| Any valid address, registered or not | 200 | `{ "message": "Kalau email kamu terdaftar, kode sudah dikirim." }` |
| Sixth request in a rolling hour | 429, `Retry-After: <seconds>` | `{ "code": "TOO_MANY_REQUESTS", "message": "Terlalu banyak permintaan. Coba lagi dalam <n> menit.", "retryAfterMinutes": <n> }` |
| The email could not be sent | 503 | `{ "code": "CODE_NOT_SENT", "message": "Kode gagal dikirim. Coba lagi." }` |
| Malformed or missing email, over 254 characters | 422 | `{ "message": "Data tidak valid", "errors": { "email": "..." } }` |
| Another origin | 403 | Nest's default body |

Every answer carries `Cache-Control: no-store`.

## Design patterns

### Ports and Adapters, with Dependency Injection

`CodeRequestService` (`backend/src/auth/email/code-request.service.ts`) knows the outside world only through ports. Nest
injects them by token in `email-request.module.ts`, and each test hands in a fake instead.

| Port | File | Production adapter | Test double |
|---|---|---|---|
| `LoginCodeIssuer` | `auth/email/login-code-issuer.ts` | `PrismaLoginCodeIssuer` (`prisma-login-code-issuer.ts`) | `FakeIssuer`, an in-memory table with the same rules (`code-request.service.spec.ts`) |
| `EmailSender` | `email/email-sender.ts` | `unreadyEmailSender`, fail-closed until 39.1 | `vi.fn` mock (unit); `OutboxSender` fake (e2e) |
| `WhitelistResolver` | `auth/google/ports.ts` (existing) | `PrismaWhitelistResolver` (existing) | stub with canned principals |
| `LoginCodeHasher` | `auth/email/login-code-hash.ts` (from #172) | `loginCodeHasher(loginCodeSecret(env))` | **the real helper**, so hash compatibility is really tested |
| clock, code generator | constructor defaults | `new Date()`, `generateLoginCode` | fixed functions |

Why this pattern fits here:

- Three of these dependencies are other people's work that does not exist yet or is not merged: the SMTP adapter of
  39.1, the hasher of 39.3, and the verify-side store.
- A port lets 39.2 finish and be tested now, and lets each of those pieces arrive without changing the service.
- The same structure is already used for Google sign-in: `ports.ts` and `unready-ports.ts`.
- It is why the service spec needs no database and no SMTP server, and still covers every branch.

### Interface Segregation: `LoginCodeIssuer` beside #172's `LoginCodeStore`

#172's `LoginCodeStore` holds what *verifying* needs: `latest`, `recordWrongAttempt` and `claim`. Requesting a code needs
`issue` and `discard`.

- Adding them to `LoginCodeStore` would have changed a file in an unmerged PR. It would also have forced 39.3's fakes and
  unready stub to implement methods they never use.
- So 39.2 has its own port. One Prisma class can later implement both ports over the same table.

### Repository

`PrismaLoginCodeIssuer` is the only code that writes SQL for issuing. It keeps the lock, the count and the insert in one
transaction behind `issue()`, so callers cannot run them in the wrong order.

## OWASP Top 10 (2025)

| Category | Risk | Mitigation | Where | Test |
|---|---|---|---|---|
| A01 Broken Access Control | A code for someone who has no access | Only a principal from the whitelist gets a real code. Revoked creators and unknown emails get a decoy no code matches. The route is same-origin only, so another site cannot make a browser spend a user's limit. The table is closed to `anon` and `authenticated`, with RLS on. | `code-request.service.ts`, `email-request.controller.ts`, migration `20261104120000_login_codes` | service spec: "a revoked creator"; controller spec: "refuses a request from another site"; e2e `email-code-request`: revoked creator; `data-api-access.e2e-spec.ts` |
| A04 Cryptographic Failures | A database dump reveals codes | Only HMAC-SHA256 under `LOGIN_CODE_SECRET` is stored, with #172's helper. The plain code exists only in the email. Codes come from `crypto.randomInt`; decoys from `randomBytes(32)`. | `login-code-hash.ts` (from #172), `login-code-generator.ts`, `code_hash` check constraint | "hashes exactly as the verification of #172 will"; e2e: stored hash equals `hashLoginCode(email, sentCode, secret)`; `login-codes.e2e-spec.ts`: refuses a plain code |
| A05 Injection | SQL through the email | Strict email rule (PRD 3.4, at most 254 characters), checked before any lookup. All SQL goes through Prisma; the one raw statement binds the email as a parameter. | `request-body.ts`, `prisma-login-code-issuer.ts` | request-body spec: a quote in the address; issuer spec: "as a bound value" |
| A06 Insecure Design | Account enumeration; flooding an inbox | The same answer and the same rate limit for every address. Decoys look exactly like real hashes. The limit holds under concurrency through an advisory lock. | `code-request.service.ts`, `prisma-login-code-issuer.ts` | "answers exactly what a registered email gets"; "limits ... exactly as a registered one"; e2e: 5 of 12 / 5 of 10 simultaneous requests |
| A07 Authentication Failures | Guessable or long-lived codes | Six digits from a CSPRNG, valid exactly 10 minutes. A new code replaces the old one through the newest-row rule. Five requests per hour. | `login-code-generator.ts`, `code-request.service.ts` | "lets the code live exactly ten minutes"; "makes the new code the newest"; e2e: "replaces the earlier code" |
| A09 Security Logging and Alerting Failures | Codes or addresses in the logs | Only the error class is logged, never the email, code, hash or provider message. | `code-request.service.ts` | "logs the error class only: no email, code, hash or provider message" |
| A10 Mishandling of Exceptional Conditions | A failure that leaves a dead code or a 500 | Every failure answers `failed` (503). An unsent row is removed by its own id, so the earlier code still works. Missing pieces fail closed: no sender, no secret. | `code-request.service.ts`, `email-sender.ts`, `email-request.module.ts` | "removes the unsent code, so the code sent before it still verifies"; e2e: "keeps the earlier code the newest when the new one cannot be sent"; module spec: "fails closed" |

## Known security limitations (for the Product Owner)

Account enumeration is **reduced, not completely prevented**. Two signals remain because of what the PBI asks for:

1. **Timing.** A registered address waits for the email to be handed to SMTP; an unknown one does not. A careful attacker
   measuring response times may tell them apart. Answering before sending would hide this, but then the backend could
   not answer "Kode gagal dikirim" as the PBI requires.
2. **Delivery failure.** "Kode gagal dikirim. Coba lagi." can only reach a registered address, because unknown
   addresses never send. While SMTP is failing, a 503 reveals that the address is registered.

Both are accepted for now (decision T1). Either can be revisited with the PO: for example, send asynchronously and
drop the failure message, or add a randomized delay to the decoy path.

Also note: a request whose email failed is not counted towards the hourly limit, because its row is removed. No email
went out, so nothing is flooded, but a stream of 503s is not rate-limited.

## Dependencies and coordination

- **39.1 (SMTP), owner to confirm:**
  - `EmailSender` in `backend/src/email/email-sender.ts` is a proposal: `send({ to, senderName, subject, text })`,
    injected under `EMAIL_SENDER`.
  - The 39.1 owner should confirm or adjust this shape before either PR merges.
  - Until then the module binds `unreadyEmailSender`, so every registered request answers 503 and nothing is stored for
    it. That is fail-closed by design.
- **39.3 (#172):**
  - `login-code-hash.ts`, `login-code-config.ts` and their specs are byte-identical copies from `56d99bf`.
    `checkEmail` is exported with the same one-line change.
  - After #172 merges, rebase. The copy commit becomes empty and drops out. If #172 changed those files meanwhile, keep
    the merged version.
  - **The verify-side Prisma adapter is still missing (decision V(a)).** #172 binds `unreadyLoginCodeStore`
    "until login_codes exists". This PR creates the table, but nothing implements `latest`, `recordWrongAttempt` or
    `claim` on it yet.
  - That belongs to 39.3. Until it lands, verifying any code answers 503, even with both PRs merged.
  - What 39.3 needs from this table:
    - `latest` = newest row by `created_at desc`, using the `(email, created_at desc)` index;
    - `attempts` is capped at 5 by a check constraint;
    - decoy rows look exactly like real ones.
  - `app.module.ts`: both PRs add one import and one module. They are placed on different lines, so git should merge
    them without a conflict.
  - #172 adds `requireLoginCodeSecretInProduction` to the boot validation; this PR relies on it rather than adding it
    again. Without the secret, every code request answers 503 alike: registered and unknown addresses fail the same
    way.

## Three technical learnings

### 1. A transaction alone did not stop the rate limit race; an advisory lock did

- **Problem I found:**
  - My first idea for "five requests per hour" was simple: count the email's rows from the last hour, and insert a new
    one if there are fewer than five.
  - I put both steps in one Prisma transaction and expected that to be safe.
  - It was not. Postgres runs in READ COMMITTED by default, so two transactions can both count the same four rows and
    both insert a fifth.
  - I checked this instead of assuming it. I ran `login-code-issuer.e2e-spec.ts`, which fires 12 simultaneous requests
    for one email at a real Postgres, against the adapter without a lock. **All 12 were issued, in 3 runs out of 3.**
- **Solution I considered and why:**
  - **`SELECT ... FOR UPDATE` on the user's row:** this is what the invoices code does (`contract-lock.ts`). But
    unknown emails have no user row to lock. Unknown addresses would then not be limited the same way, which leaks
    which emails are registered.
  - **SERIALIZABLE isolation:** correct, but Postgres then aborts one of the conflicting transactions, so I would need
    retry logic.
  - **A counter table:** gives a fixed window, not a rolling 60 minutes.
  - **What I chose:** `pg_advisory_xact_lock(hashtextextended('login_codes:' || email, 0))`. It locks a *key* rather
    than a row, so it works for addresses that have no row at all. It is released automatically at commit or rollback.
- **What I did:**
  - `PrismaLoginCodeIssuer.issue()` takes the lock first, then counts the newest five rows inside the window, then
    inserts, all in one transaction.
  - The unit spec checks the order `begin → lock → count → insert → commit`, and that the email is a bound parameter,
    not part of the SQL text.
  - With the lock, the same e2e test gives **exactly 5 issued and 7 refused, in 5 runs out of 5**. Through HTTP,
    `email-code-request.e2e-spec.ts` sends 10 simultaneous requests and gets 5 × 200 and 5 × 429.
  - What I learned: under READ COMMITTED each statement takes a fresh snapshot. So the count that runs *after* waiting
    for the lock sees the row the previous holder committed. That is why it works without SERIALIZABLE.

### 2. Making unknown emails look exactly like registered ones

- **Problem I found:**
  - If the endpoint said "email not found", anyone could test which addresses are Tofly creators.
  - Returning the same message is not enough on its own. My friend's verify step (#172) answers "expired" when no row
    exists but "wrong code" when one does. The rate limit would also only start counting for registered emails.
  - So an unknown address must leave a trace in the table that behaves like a real code but can never be used.
- **Solution I considered and why:**
  - **A marked decoy such as `decoy:<random>`:** can never match by its structure. But anyone who reads the table could
    filter out every unregistered address.
  - **What I chose:** 32 random bytes as hex. That is the same 64-character shape as an HMAC-SHA256, and the check
    constraint `code_hash ~ '^[0-9a-f]{64}$'` holds for both kinds of row. It does not come from any code, so matching
    it would mean finding an HMAC collision.
  - I also noticed that the registered path calls the hasher and the decoy path did not. If `LOGIN_CODE_SECRET` was
    missing, only registered emails would fail, which is a leak of its own. So the service now hashes for every address
    before checking the whitelist.
- **What I did:**
  - `decoyCodeHash()` is in `login-code-generator.ts`.
  - In `CodeRequestService`, the whitelist decides only *which* hash is stored and whether an email goes out.
  - Tests in `code-request.service.spec.ts`:
    - "answers exactly what a registered email gets";
    - "limits ... exactly as a registered one";
    - "stores a decoy shaped like a real hash";
    - "fails ... alike without a hashing secret".
  - In `email-code-request.e2e-spec.ts`, an unregistered email and a revoked creator get the identical 200 body, one
    decoy row and no email.
  - What I learned: enumeration protection is about every observable difference, not only the response text. I also
    learned to say honestly what is left: timing, and the delivery-failure message (see "Known security limitations").

### 3. Undoing a failed email without breaking someone else's code

- **Problem I found:**
  - Verification only reads the newest row, so inserting a new code automatically kills the previous one. That is
    good, until sending the new code fails.
  - Then the user has an old code in their inbox that no longer works, and a new code they never received.
- **Solution I considered and why:**
  - **Keep the transaction open while sending and roll back on failure:** this holds a database connection and the
    lock for the whole SMTP call. And if the commit fails after the email went out, the user holds a dead code.
  - **Send first, insert after:** the user could type the code before the row exists.
  - **What I chose:** commit the row, send, and if sending fails, delete *that row by its id*. Deleting "the newest row
    for this email" would be wrong when two requests overlap: it could remove the code the other request just sent
    successfully.
- **What I did:**
  - `issue()` returns the new row's id, and `deliver()` in the service calls `discard(id)` when `send` rejects.
  - `discard` is `deleteMany({ where: { id } })`.
  - The unit test "removes only its own row, never the code a simultaneous request sent" holds request A's email open,
    lets request B finish, then fails A. Only B's row remains, and it is the newest.
  - "removes the unsent code, so the code sent before it still verifies" and the e2e test "keeps the earlier code the
    newest when the new one cannot be sent" check the user-visible side: the earlier code's hash is the newest row
    again, and the answer is 503 "Kode gagal dikirim. Coba lagi."
  - What I learned: undoing a failed step should name the exact thing it created, not "the latest one", because under
    concurrency "the latest" can belong to someone else.
