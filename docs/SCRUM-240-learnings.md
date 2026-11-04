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

`PrismaLoginCodeIssuer` is the only code that writes SQL for issuing. Behind `issue()` it does all of the following in
one transaction, so callers cannot run the steps in the wrong order:

1. Take the lock.
2. Forget requests older than the hour.
3. Count the email's requests in `login_code_requests`.
4. Store the code in `login_codes`, after placing it in issue order.
5. Record the request.

## Data model

| Table | Migration | Holds | Read by |
|---|---|---|---|
| `login_codes` | `20261104120000_login_codes` | One row per code or decoy; only the HMAC | verification (39.3): the newest row per email |
| `login_code_requests` | `20261104130000_login_code_requests` | One row per request the limit let through, sent or not | the hourly limit (AC 5) |

- **Two migrations, kept apart on purpose:** `login_code_requests` came after `login_codes` had already been applied
  to local and test databases. Editing an applied migration changes its checksum, so the request log is its own
  migration.
- **A refused request (429) records nothing.** Only requests the limit lets through are counted, so pressing the button
  again while locked out does not push the lockout further back. The issuer test "refuses with the oldest counted
  request once the window is full, storing and recording nothing" holds this.
- Both tables have check constraints on the normalized email, RLS on, and `anon` and `authenticated` revoked.
  `data-api-access.e2e-spec.ts` holds both to that.
- **Why two tables:** when an email fails, its code row is removed, so the code sent before it stays the newest and
  usable. But the request must still count towards AC 5, because the provider may have delivered it anyway.
- **Cleanup:** every request deletes all `login_code_requests` rows older than the hour, whatever their email. The
  delete uses the `requested_at` index, so while requests keep arriving the table holds about an hour of traffic.
  - If requests stop, the rows from the last active hour (at most five per email) stay until the next request. The
    limit is unaffected, because it only counts the last hour, but those emails are kept for longer than they need to
    be.
  - A scheduled cleanup is a **future maintenance improvement, outside 39.2's acceptance criteria and Definition of
    Done**. It is planned as one job shared with 39.3, which also needs a cleanup for `login_codes` (see
    "Dependencies"), and it will come in a separate PR once agreed with the 39.3 owner. This PR adds no scheduler, no
    cleanup endpoint and no new infrastructure.
- `login_codes` is not cleaned by 39.2. Its rows are what 39.3 reads (see "Dependencies").
- **Issue order:**
  - Each code is placed just after the email's newest request while the lock is held:
    `created_at = max(own clock, newest + 1 ms)`. The expiry moves with it, so every code lives exactly 10 minutes.
  - Without this, a request that read the clock first but reached the lock second gets an older `created_at`, and two
    requests can share a millisecond. Verification would then treat the wrong code as the newest. This was reproduced
    against Postgres before the fix.
  - `now()` would not help: it is fixed at the start of the transaction, before the lock wait.

## OWASP Top 10 (2025)

| Category | Risk | Mitigation | Where | Test |
|---|---|---|---|---|
| A01 Broken Access Control | A code for someone who has no access | Only a principal from the whitelist gets a real code. Revoked creators and unknown emails get a decoy no code matches. The route is same-origin only, so another site cannot make a browser spend a user's limit. Both tables are closed to `anon` and `authenticated`, with RLS on. | `code-request.service.ts`, `email-request.controller.ts`, migrations `20261104120000_login_codes` and `20261104130000_login_code_requests` | service spec: "a revoked creator"; controller spec: "refuses a request from another site"; e2e `email-code-request`: revoked creator; `data-api-access.e2e-spec.ts` |
| A04 Cryptographic Failures | A database dump reveals codes | Only HMAC-SHA256 under `LOGIN_CODE_SECRET` is stored, with #172's helper. The plain code exists only in the email. Codes come from `crypto.randomInt`; decoys from `randomBytes(32)`. | `login-code-hash.ts` (from #172), `login-code-generator.ts`, `code_hash` check constraint | "hashes exactly as the verification of #172 will"; e2e: stored hash equals `hashLoginCode(email, sentCode, secret)`; `login-codes.e2e-spec.ts`: refuses a plain code |
| A05 Injection | SQL through the email | Strict email rule (PRD 3.4, at most 254 characters), checked before any lookup. All SQL goes through Prisma; the one raw statement binds the email as a parameter. | `request-body.ts`, `prisma-login-code-issuer.ts` | request-body spec: a quote in the address; issuer spec: "as a bound value" |
| A06 Insecure Design | Account enumeration; flooding an inbox | The same answer and the same rate limit for every address. Decoys look exactly like real hashes. The limit counts every request let through, failed sends included, and holds under concurrency through an advisory lock. | `code-request.service.ts`, `prisma-login-code-issuer.ts`, `login_code_requests` | "answers exactly what a registered email gets"; "limits ... exactly as a registered one"; "still counts the unsent request"; e2e: 5 of 12 / 5 of 10 simultaneous requests, "counts a failed send towards the hourly limit" |
| A07 Authentication Failures | Guessable or long-lived codes; the wrong code treated as live | Six digits from a CSPRNG, valid exactly 10 minutes. A new code replaces the old one through the newest-row rule, and `created_at` follows issue order so "newest" is never wrong or tied. Five requests per hour. | `login-code-generator.ts`, `code-request.service.ts`, `prisma-login-code-issuer.ts` | "lets the code live exactly ten minutes"; "makes the new code the newest"; issuer e2e "issue order"; e2e: "replaces the earlier code" |
| A09 Security Logging and Alerting Failures | Codes or addresses in the logs | Only the error class is logged, never the email, code, hash or provider message. | `code-request.service.ts` | "logs the error class only: no email, code, hash or provider message" |
| A10 Mishandling of Exceptional Conditions | A failure that leaves a dead code or a 500 | Every failure answers `failed` (503). An unsent row is removed by its own id, so the earlier code still works. Missing pieces fail closed: no sender, no secret. | `code-request.service.ts`, `email-sender.ts`, `email-request.module.ts` | "removes the unsent code, so the code sent before it still verifies"; e2e: "keeps the earlier code the newest when the new one cannot be sent"; module spec: "fails closed" |

## Known security limitations (for the Product Owner)

Account enumeration is **reduced, not completely prevented**. Three signals remain. The first two come from what
the PBI asks for; the third lasts only until 39.1 is merged:

1. **Timing.** A registered address waits for the email to be handed to SMTP; an unknown one does not. A careful attacker
   measuring response times may tell them apart. Answering before sending would hide this, but then the backend could
   not answer "Kode gagal dikirim" as the PBI requires.
2. **Delivery failure.** "Kode gagal dikirim. Coba lagi." can only reach a registered address, because unknown
   addresses never send. While SMTP is failing, a 503 reveals that the address is registered.

Signals 1 and 2 are accepted for now (decision T1). Either can be revisited with the PO: for example, send asynchronously and
drop the failure message, or add a randomized delay to the decoy path.

3. **Before 39.1 is merged, every registered address is revealed.** Until the SMTP adapter of 39.1 replaces
   `unreadyEmailSender`, sending always fails:
   - a registered address answers **503** "Kode gagal dikirim";
   - an unknown or revoked one answers **200**.

   Anyone could tell the two apart with a single request.
   - **Where this matters:** CI deploys only `main` (production) and `staging`. The `build` job in
     `.github/workflows/backend.yml` requires one of those refs, and `feat/pbi-39-email-sign-in` is never deployed.
   - **Rule:** 39.1 must be merged into `feat/pbi-39-email-sign-in` **before** PBI-39 is merged into `main` or
     `staging`, or deployed anywhere.

### A send that fails may still have been delivered

A provider can accept an email and then time out before our call returns. The backend sees a failure in both cases and
cannot tell the two apart. In both cases it:

- answers 503 "Kode gagal dikirim. Coba lagi.";
- removes the new code's row, so the code sent before it stays the newest and usable;
- **keeps the request counted** in `login_code_requests`, so retries after ambiguous failures cannot get past five
  emails an hour (AC 5).

**What we accept:** if that email did arrive, the code in it **does not work**, because its row is gone. The user
uses the earlier code or asks for a new one, inside the same hourly limit. Telling "rejected" apart from "maybe
delivered" would need error types from 39.1's adapter; that is not part of this PR.

## Dependencies and coordination

- **39.1 (SMTP), owner to confirm:**
  - `EmailSender` in `backend/src/email/email-sender.ts` is still `send({ to, senderName, subject, text })`, injected
    under `EMAIL_SENDER`. It is a generic transport meant to be reusable (PBI-11) and kept apart from template
    rendering.
  - **Pending with the 39.1 owner:** 39.1 requires HTML and plain-text sign-in templates. The proposal is to add
    `html` to the same transport, `send({ to, senderName, subject, text, html })`. Who owns the sign-in templates and
    how they are rendered must be agreed with the 39.1 owner before this shared interface changes. No
    template-specific sender is introduced.
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
    - `attempts` is capped at 5 by a check constraint (`between 0 and 5`);
    - decoy rows look exactly like real ones.
  - **The attempts cap was checked against #172's code.** `LoginCodeStore.recordWrongAttempt` answers `null` "when the
    code had already reached the limit", `MAX_CODE_ATTEMPTS` is 5, and #172's fake store returns `null` at 5 without
    incrementing. An adapter that keeps that contract never writes 6.
  - **Merging with #172 has been checked.** `git merge-tree --write-tree HEAD origin/feat/email-code-verification_241`
    merged without conflicts at #172's `56d99bf`. That includes `app.module.ts`, where both PRs add an import and a
    module on different lines, and the identical `checkEmail` export.
  - #172 adds `requireLoginCodeSecretInProduction` to the boot validation; this PR relies on it rather than adding it
    again. Without the secret, every code request answers 503 alike: registered and unknown addresses fail the same
    way.
  - 39.3 reads `login_codes` only. It needs nothing from `login_code_requests`, and its `latest()` keeps ordering by
    `created_at desc`. That order is now the issue order, with no ties.
  - Removing old `login_codes` rows (used, expired or replaced) is left open. Any cleanup must keep the newest row per
    email, because verification reads it.
  - **Future improvement, separate PR:** one scheduled cleanup shared by both tables, which removes
    `login_code_requests` rows older than the hour and old `login_codes` rows, to be designed with the 39.3 owner.
    Cloud Run scales to zero, so it would need an external trigger (such as Cloud Scheduler, like the performance sync)
    rather than a timer in the app. It is not part of 39.2's acceptance criteria.
- **39.4 (frontend):** AC 4's "Kirim Ulang" unlocks after 60 seconds with a visible countdown. That is the sign-in
  screen's job. The backend enforces only AC 5's five requests per rolling hour, and a new code still replaces the old
  one.

## Three technical learnings

### 1. A transaction alone did not stop the rate limit race; an advisory lock did

- **Problem I found:**
  - The obvious way to do "five requests per hour" is: count the email's rows from the last hour, and insert a new one
    if there are fewer than five.
  - It is tempting to think that wrapping both steps in one Prisma transaction makes this safe.
  - It does not. Postgres runs in READ COMMITTED by default. A row inserted by one transaction is invisible to the others
    until it commits, so simultaneous requests can all count the same rows and all insert.
  - I wanted to see this rather than take it on trust, so I ran an **experiment**. The adapter I committed always had
    the lock; the version without it only ever existed in the experiment.
  - I ran the adapter's exact queries 12 times at once for one email against a real Postgres, once inside a plain
    transaction and once with the lock. Without the lock, **12 of 12 were issued in 3 rounds out of 3**.
  - The experiment is now `backend/scripts/login-code-lock-experiment.mjs`. It only runs against a disposable local
    database named in `LOGIN_CODE_EXPERIMENT_DATABASE_URL`.
  - It is a script and not a test on purpose: a test that expects a race to happen would be flaky.
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
  - `PrismaLoginCodeIssuer.issue()` takes the lock first. Then it counts the email's requests in
    `login_code_requests` inside the window, stores the code and records the request, all in one transaction.
  - The unit spec checks that order, and that the email is a bound parameter, not part of the SQL text.
  - The lock also turned out to be the safe place to fix ordering. While it is held, nothing else can issue for that
    email, so placing each code just after the newest request makes `created_at` follow the real issue order (see
    "Data model").
  - With the lock, the experiment gives **5 of 12 in every round**. The committed e2e test
    `login-code-issuer.e2e-spec.ts` ("lets exactly five of twelve simultaneous requests for one email through") holds
    the lock version to that, and passed 5 runs out of 5.
  - Through HTTP, `email-code-request.e2e-spec.ts` sends 10 simultaneous requests and gets 5 × 200 and 5 × 429.
  - Only these real-database runs prove the locking. The unit spec uses a fake transaction, so it can check the order of
    the steps but not what Postgres does.
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
  - While designing the decoy path, I spotted a less obvious difference. A decoy does not need the HMAC, so the natural
    design would only call the hasher for registered addresses.
  - But the hasher throws when `LOGIN_CODE_SECRET` is missing. With a misconfigured secret, registered emails would
    fail and unknown ones would succeed, which is a leak of its own.
  - So I designed the service to hash for every address, before asking the whitelist, from the first version that had
    decoys.
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
  - Later I noticed a second problem. My first fix removed the failed request's row, and the limit counted those same
    rows. So a failed request did not count towards "five per hour".
  - A provider can accept an email and still time out, so a "failed" email may have been delivered. Retries could then
    put more than five emails an hour into someone's inbox.
- **Solution I considered and why:**
  - **Keep the transaction open while sending and roll back on failure:** this holds a database connection and the
    lock for the whole SMTP call. And if the commit fails after the email went out, the user holds a dead code.
  - **Send first, insert after:** the user could type the code before the row exists.
  - **What I chose:** commit the row, send, and if sending fails, delete *that row by its id*. Deleting "the newest row
    for this email" would be wrong when two requests overlap: it could remove the code the other request just sent
    successfully.
  - For the limit, I compared three options:
    - **Keep the failed code row:** it would count, but it would also become the newest and kill the earlier code.
    - **Have 39.1 report "rejected" vs "maybe delivered":** this depends on another subtask's error types.
    - **What I chose:** a separate request log, `login_code_requests`. Its only job is counting, so removing a code row
      never frees a slot.
- **What I did:**
  - `issue()` returns the new row's id, and `deliver()` in the service calls `discard(id)` when `send` rejects.
  - `discard` is `deleteMany({ where: { id } })`.
  - The unit test "removes only its own row, never the code a simultaneous request sent" holds request A's email open,
    lets request B finish, then fails A. Only B's row remains, and it is the newest.
  - "removes the unsent code, so the code sent before it still verifies" and the e2e test "keeps the earlier code the
    newest when the new one cannot be sent" check the user-visible side: the earlier code's hash is the newest row
    again, and the answer is 503 "Kode gagal dikirim. Coba lagi."
  - Tests that a failed send still counts:
    - "still counts the unsent request towards the limit: the provider may have delivered it" (service spec);
    - "still counts a request whose code was discarded, so a failed email cannot free its slot" (issuer e2e);
    - "counts a failed send towards the hourly limit, while its code row is removed" (HTTP e2e): one success, one
      failure, three successes, then 429, with 4 code rows but 5 requests recorded.
  - What I learned:
    - Undoing a failed step should name the exact thing it created, not "the latest one". Under concurrency, "the
      latest" can belong to someone else.
    - When one table does two jobs (the live code and the rate-limit count), undoing one job can quietly undo the
      other.
    - I also had to be honest about what is left: a code that was delivered after a timeout will not work.
