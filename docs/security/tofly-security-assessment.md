# Tofly security assessment (OWASP ZAP)

Assessed on 3 November 2026 on branch `feat/last-sync-finalize-snapshot_236`. The original scans ran at commit
`a33bfe9`; the rescans ran with the patches in this document. Only a local, isolated copy of Tofly with fictional data
was scanned.

## 1. Executive Summary

OWASP ZAP 2.17.0 ran four scan types against a local copy of the Tofly backend (NestJS) and frontend (Next.js):

- an **API scan as an admin**;
- an **API scan as a creator**;
- a **full scan** (spider plus active attacks);
- a **baseline scan** (passive checks).

Both API scans used real application sessions, and an unauthenticated API run was kept as well.

| Result                                          | Count | What                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Confirmed vulnerabilities**                   | 2     | **V1:** a NUL character in a JSON text field causes an HTTP 500 on 5 endpoints (Low, OWASP A10:2025). **V2:** the backend sends a page-oriented Content Security Policy with wildcard and `'unsafe-inline'` sources on responses that reach the browser (ZAP: Medium; real impact Low; OWASP A02:2025). |
| **Patched and verified**                        | 2     | Both fixed with RED → GREEN regression tests. Rescans no longer report them.                                                                                                                                                                                                                            |
| **Potential issues (not patched, recommended)** | 3     | Frontend pages lack Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy (Low). Authenticated API responses carry no `Cache-Control` (Informational). The template `GET /` "Hello World!" route is still exposed (Low).                                                                          |
| **False positives / informational**             | 6     | "Dangerous JS functions" (ZAP's own payload, shown escaped), "User controllable HTML attribute / potential XSS" (output is escaped), "Big redirect" (page shell without data), "Suspicious comments", "Session management response identified", "Modern web application".                               |

No Critical or High finding was raised. Access control held in every scan:

- unauthenticated requests to protected routes got **401**;
- cross-site writes got **403**;
- a creator calling an admin route got **403**.

## 2. Scope and Testing Environment

| Item          | Value                                                                                                                                                                                                                                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Backend       | NestJS 11, `node dist/main.js` on `http://localhost:3001`. Development header login **off** (`DEV_AUTH_ENABLED=false`). Default production cookie settings (Secure, HttpOnly, SameSite=Lax).                                                                                                                                                     |
| Frontend      | Next.js standalone build on `http://localhost:3000`, proxying `/api/*` to the backend.                                                                                                                                                                                                                                                           |
| Database      | Disposable PostgreSQL 17.11 container on `127.0.0.1:15433`, database `zap`. Created, migrated with `prisma migrate deploy`, filled with the repository's fictional `prisma/seed.sql` (`@example.com` users), then handed to the app role `tofly_app` exactly as CI does. The developer database and every deployed environment were not touched. |
| Test accounts | `admin@tofly.id` (admin) and `rangga@example.com` (creator), both fictional seed users. Their sessions were created through the app's own `AppSessionService`, the same way the end-to-end tests sign in. No guard was bypassed and no real credentials were used.                                                                               |
| Network scope | ZAP in Docker reached only `host.docker.internal:3000` and `:3001`. No staging, production or public IP was scanned. Routes that redirect to Google, TikTok or Instagram were excluded.                                                                                                                                                          |
| Out of scope  | Denial of service, destructive exploits, and the OAuth providers themselves.                                                                                                                                                                                                                                                                     |

**Health before scanning:**

- `GET /health` returned `200 {"db":"ok"}`;
- `GET /` on the frontend returned `307 → /login`;
- `GET /api/creators` without a session returned `401`;
- with the admin session it returned `200`, and with the creator session it returned `403`.

## 3. Tools and Scan Configuration

- **Tool:** OWASP ZAP 2.17.0, `ghcr.io/zaproxy/zaproxy:stable` (image created 16 October 2026).
- **OpenAPI:** the backend publishes no OpenAPI/Swagger. A **scan-only OpenAPI 3 document** was generated from the
  routes the running app actually registers (67 Express routes, deduplicated).
  - The admin document holds 21 operations and the creator document 12. Path parameters use real ids from the
    disposable database, and write operations carry example JSON bodies.
  - Deliberately excluded: `DELETE` routes and state-ending moves (finalize, approve/reject, acknowledge,
    confirm receipt), logout, the internal scheduler route, file uploads, and OAuth redirects to external platforms.
  - This document is a scan artefact only; nothing was added to the app.
- **Authenticated scanning:** ZAP's replacer added the session cookie (`__session=<test session>`), plus
  `Origin: http://localhost:3000` and `Sec-Fetch-Site: same-origin`, as a browser on the app's own origin would send.
- **Scans run:**

| Scan          | Command (shortened)                                                         | Target                                   | Active attack?                            |
| ------------- | --------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------- |
| API (admin)   | `zap-api-scan.py -t openapi-admin.json -f openapi` + admin session          | Backend `:3001`                          | Yes, capped at 12 min                     |
| API (creator) | `zap-api-scan.py -t openapi-creator.json -f openapi` + creator session      | Backend `:3001`                          | Yes, capped at 12 min                     |
| Full          | `zap-full-scan.py -t http://host.docker.internal:3000 -m 2` + admin session | Frontend `:3000` (and `/api` through it) | Yes, capped at 6 min (shortened for time) |
| Baseline      | `zap-baseline.py -t http://host.docker.internal:3000 -m 3 -j` (AJAX spider) | Frontend `:3000`, unauthenticated        | No (passive)                              |

The reports (HTML and JSON) are in `docs/security/zap-reports/`. They contain no session tokens.

**Did the authenticated scans reach the protected handlers?** Yes. PostgreSQL's per-table counters in the disposable
database, before and after the authenticated scans, show:

| Table                 | Rows inserted by the scans                  |
| --------------------- | ------------------------------------------- |
| `contents`            | +242                                        |
| `invoice_adjustments` | +126                                        |
| `invoice_comments`    | +253 (127 by the admin, 126 by the creator) |
| `content_events`      | +369                                        |
| `app_sessions`        | 7,894 updates (session activity)            |

**Authentication failures and incomplete coverage:**

- **Path bug in the first run:** the first API run sent an empty cookie because of a Windows path bug in the scan
  script. It is kept as an **unauthenticated** API scan, in which every protected operation answered 401 or 403.
- **`POST /creators`:** it inserted nothing; every attempt was answered 422, because the example body did not match
  the validator. The route was therefore tested only at its validation layer.

## 4. Initial Scan Results

Counts are alert instances. Risk is as ZAP rated it, with confidence in brackets.

**API scan, admin (authenticated)**: 22 operations imported, 65 URLs; 120 rules passed, 2 warnings:

| Rule   | Alert                                  | Risk       | Instances                                                                                                        |
| ------ | -------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| 100000 | Server error response code             | Low (High) | 3: `POST /contents`, `POST /invoices/{contractId}/adjustments`, `POST /invoices/{contractId}/comments` → **500** |
| 100001 | Unexpected Content-Type                | Low (High) | 2: `GET /` → `text/html`                                                                                         |
| 100000 | Client error response code             | Info       | 44 (404s from ZAP probing paths, 400/422 validation)                                                             |
| 10049  | Storable and cacheable content         | Info       | 5 (authenticated `GET`s without `Cache-Control`)                                                                 |
| 10112  | Session management response identified | Info       | 17                                                                                                               |

**API scan, creator (authenticated)**: 16 operations imported, 53 URLs; 120 passed, 2 warnings:

| Rule   | Alert                          | Risk       | Instances                                                                              |
| ------ | ------------------------------ | ---------- | -------------------------------------------------------------------------------------- |
| 100000 | Server error response code     | Low (High) | 2: `POST /contents/{id}/comments`, `POST /me/invoices/{contractId}/comments` → **500** |
| 100001 | Unexpected Content-Type        | Low (High) | 2: `GET /`                                                                             |
| 10027  | Suspicious comments            | Info       | 1 (the word "admin" inside JSON data)                                                  |
| 10049  | Storable and cacheable content | Info       | 5 (`/me/contents`, `/me/contents/{id}`, …)                                             |

**Full scan (frontend, admin session)**: 55 URLs; 140 passed, 3 warnings:

| Rule  | Alert                                                             | Risk         | Instances                                           |
| ----- | ----------------------------------------------------------------- | ------------ | --------------------------------------------------- |
| 10044 | Big redirect detected                                             | Low (Medium) | 2: `GET /`                                          |
| 90004 | Cross-Origin-Embedder-Policy / Cross-Origin-Opener-Policy missing | Low (Medium) | 5 + 5 (`/admin/content-plan`, `/admin/creators`, …) |
| 10110 | Dangerous JS functions                                            | Low (Low)    | 2: `/admin/invoicing` (evidence `eval(`)            |
| 10031 | User controllable HTML element attribute (potential XSS)          | Info (Low)   | 1: `/admin/invoicing?q=…`                           |

**Baseline (frontend, unauthenticated)**: 30 URLs; 63 passed, 5 warnings:

| Rule         | Alert                                                             | Risk              | Instances                     |
| ------------ | ----------------------------------------------------------------- | ----------------- | ----------------------------- |
| 10055        | CSP: wildcard directive; CSP: `style-src unsafe-inline`           | **Medium** (High) | 1 + 1: `GET /api/auth/google` |
| 10044        | Big redirect detected                                             | Low               | 2                             |
| 90004        | Cross-Origin-Embedder-Policy / Cross-Origin-Opener-Policy missing | Low               | 5 + 5                         |
| 10049, 10109 | Cacheability, modern web application                              | Info              | 10, 2                         |

## 5. Vulnerability Analysis

### V1: a NUL character in a JSON text field causes an unhandled 500 (confirmed)

- **Severity:** Low. ZAP rates rule 100000 Low (High confidence).
- **OWASP Top 10:2025:** A10 Mishandling of Exceptional Conditions.
- **Affected:** `POST /contents`, `POST /invoices/{contractId}/adjustments`, `POST /invoices/{contractId}/comments`,
  `POST /contents/{id}/comments`, `POST /me/invoices/{contractId}/comments`. The cause is shared, so it also affected
  every other endpoint that saves request text.
- **Evidence:** in the scans, all 5 instances returned 500. The backend log for each:

  ```
  ERROR [ExceptionsHandler] PrismaClientUnknownRequestError …
  PostgresError { code: "22021", message: "invalid byte sequence for encoding \"UTF8\": 0x00" }
  ```

  Reproduced by hand with the admin and creator test sessions:

  ```
  POST /invoices/<contract>/comments  {"text":"halo\u0000"}  → 500 {"statusCode":500,"message":"Internal server error"}
  POST /invoices/<contract>/comments  {"text":"halo"}        → 201
  ```

- **Why it exists:** JSON may carry U+0000 (`\u0000`), and JavaScript strings may hold it. The field validators check
  type and length, not this character. PostgreSQL `text` and `varchar` cannot store it, so the insert fails inside the
  database. Nothing catches that error, so Nest answers 500.
- **Impact on Tofly:**
  - Any signed-in user (admin or creator) can turn a normal write into a server error at will.
  - No data is disclosed: the 500 body is generic, and no row is written.
  - It does produce error-level log noise and false alerts, and it breaks the API's contract that invalid input gets
    a 4xx.
  - It is not exploitable for injection: Prisma binds every value as a parameter.
- **Status:** **Confirmed.**

### V2: the API sends a weak, page-oriented Content Security Policy (confirmed)

- **Severity:** ZAP Medium (High confidence). Practical impact Low, because the API never serves an HTML page.
- **OWASP Top 10:2025:** A02 Security Misconfiguration.
- **Affected:** every backend response, observed through the frontend proxy at `GET /api/auth/google`.
- **Evidence:**

  ```
  content-security-policy: default-src 'self';base-uri 'self';font-src 'self' https: data:;…;
                           style-src 'self' https: 'unsafe-inline';upgrade-insecure-requests
  ```

  ZAP 10055 reported "Wildcard Directive" (`https:`) and "style-src unsafe-inline".

- **Why it exists:** `helmet()` was used with its defaults, a policy designed for HTML pages. The frontend proxy
  forwards the backend's response headers to the browser, so this policy reaches the user.
- **Impact on Tofly:** the API only returns JSON, files and redirects, so today there is no page whose scripts this
  policy would govern. If an API response were ever rendered as HTML, for example after a content-type mistake, the
  permissive sources would weaken the policy's protection. The finding is real; its impact is limited.
- **Status:** **Confirmed** as a misconfiguration.

### Potential issues (not patched: hardening, kept out of this change)

| Finding                                                            | Severity | Why it is not patched here                                                                                                                                                 | Recommendation                                                                                                                                         |
| ------------------------------------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| COOP/COEP missing on frontend pages (90004)                        | Low      | Hardening, not an exploitable flaw found here. COEP `require-corp` can break third-party resources and needs its own testing.                                              | Add `Cross-Origin-Opener-Policy: same-origin` in `next.config.ts`'s headers. Sign-in is a full-page redirect, so it is safe. Evaluate COEP separately. |
| Authenticated API responses have no `Cache-Control` (10049)        | Info     | There is no shared cache between the browser and the API. Without `Last-Modified`, browsers do not freshen these responses heuristically. Not reproducible as a leak here. | Send `Cache-Control: no-store` on authenticated API responses (A02).                                                                                   |
| `GET /` returns the template's `text/html` "Hello World!" (100001) | Low      | Harmless content, but needless surface.                                                                                                                                    | Remove `AppController`/`AppService`, or answer `204`/JSON.                                                                                             |

### False positives and informational alerts (checked by hand)

| Alert                                                                                              | Verdict            | Evidence                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dangerous JS functions (`eval(`) on `/admin/invoicing`                                             | **False positive** | The `eval(` text is ZAP's own template-injection payload (`{{range.constructor("return eval(…")}}`), which the API scan saved as an adjustment reason. The page shows it as an escaped JSON string inside React's payload; it never runs. |
| User controllable HTML attribute (potential XSS) on `?q=`                                          | **False positive** | `?q="><script>alert(1)</script>` comes back as `value="&quot;&gt;&lt;script&gt;…"`, escaped by React.                                                                                                                                     |
| Big redirect on `/`                                                                                | **Not sensitive**  | The 307 to `/login` carries a 6.5 KB Next.js page shell (script preloads, no user data). The request is unauthenticated, so there is nothing to leak.                                                                                     |
| Suspicious comments (10027)                                                                        | False positive     | The word "admin" matched inside JSON data (`authorRole`).                                                                                                                                                                                 |
| Session management response identified (10112), Modern web application (10109), client-error codes | Informational      | They describe behaviour, not flaws. The 4xx codes are the validators and guards working.                                                                                                                                                  |

## 6. Remediation and Patch Details

### V1: NUL character → 500

**Problem → Security Impact → Root Cause → Patch Applied → Verification Result**

- **Problem:** text containing `\u0000` made five scanned write endpoints, and by the same cause every text write,
  answer 500.
- **Security Impact:** any signed-in user could trigger server errors at will (log and alert noise, broken error
  contract). No data leak and no injection.
- **Root Cause:** no boundary check for a character PostgreSQL cannot store. The database error went unhandled.
- **Patch Applied:**
  - `backend/src/reject-nul-characters.interceptor.ts` checks the parsed JSON body (strings, keys, nested objects and
    lists) and answers **400** `{"code":"INVALID_CHARACTERS","message":"Teks berisi karakter yang tidak diizinkan"}`
    before any handler or query runs.
  - It is registered once for every route through `APP_INTERCEPTOR` in `backend/src/app.module.ts`.
  - It runs after the guards, so authentication and authorization still answer first (a signed-out request still gets
    401).
  - One boundary check rather than a change to every validator.
- **Verification Result:** see section 7.
  - **Rescans:** "Server error response code" is no longer reported by the admin or the creator API scan.
  - **Backend log during the rescans:** 0 unhandled exceptions.
  - **By hand:** `{"text":"halo\u0000"}` now gets `400 {"code":"INVALID_CHARACTERS",…}`.

### V2: weak CSP on API responses

**Problem → Security Impact → Root Cause → Patch Applied → Verification Result**

- **Problem:** the API sent helmet's page policy, with `https:` wildcards and `style-src 'unsafe-inline'`, to the
  browser.
- **Security Impact:** a weaker policy than an API needs. It would matter if a response were ever rendered as HTML.
- **Root Cause:** `helmet()` defaults are aimed at HTML pages, and the proxy forwards the headers.
- **Patch Applied:**
  - `backend/src/security-headers.ts` now sets `contentSecurityPolicy: { useDefaults: false, directives:
{ defaultSrc: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"], frameAncestors: ["'none'"] } }`, the
    usual policy for APIs.
  - The first version set only `default-src` and `frame-ancestors`. The first rescan then flagged
    "Failure to Define Directive with No Fallback": `base-uri` and `form-action` do not inherit from `default-src`.
    Both were added in a second RED → GREEN cycle.
  - Helmet's other headers (HSTS, `nosniff`, `X-Frame-Options`, `Referrer-Policy`, …) are unchanged.
  - The frontend keeps its own nonce-based page policy.
- **Verification Result:** see section 7. The response now carries
  `content-security-policy: default-src 'none';base-uri 'none';form-action 'none';frame-ancestors 'none'`.
  The final baseline rescan reports no CSP alert and no Medium finding.

## 7. Before/After Scan Comparison

Rescans ran against the same environment (same database and sessions) with the patched backend.

| Finding                                           | Scan                | Before                                 | After                                                                                                                                                    |
| ------------------------------------------------- | ------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1 Server error response code (100000, Low)       | API admin           | 3 instances (500)                      | **0**: not reported                                                                                                                                      |
| V1 Server error response code (100000, Low)       | API creator         | 2 instances (500)                      | **0**: not reported                                                                                                                                      |
| V2 CSP wildcard / `unsafe-inline` (10055, Medium) | Baseline            | 1 + 1                                  | First rescan: **0**, but a new 10055 "Failure to Define Directive with No Fallback" (Medium) appeared. Second rescan: **0** CSP alerts, no Medium at all |
| Unexpected Content-Type `GET /` (100001)          | API admin / creator | 2 / 2                                  | 2 / 2 (not patched; see section 5)                                                                                                                       |
| COOP/COEP missing (90004)                         | Baseline            | 5 + 5                                  | 5 + 5 (not patched; see section 5)                                                                                                                       |
| Big redirect (10044)                              | Baseline            | 2                                      | 2 (not sensitive)                                                                                                                                        |
| Backend unhandled exceptions (log)                | API admin + creator | 5 × `PrismaClientUnknownRequestError`  | 0                                                                                                                                                        |
| Overall                                           | Baseline            | 5 warnings, 63 passed, 2 Medium alerts | 4 warnings, 64 passed, **no Medium**                                                                                                                     |
| Overall                                           | API admin / creator | 2 / 2 warnings                         | 1 / 1 warning (only `GET /`'s content type)                                                                                                              |

The full scan was not rerun. Neither patched finding came from it, and its findings (COOP/COEP, big redirect, the two
false positives) are all on the frontend, which did not change.

## 8. Regression Test Evidence

Commits, RED before GREEN (no fix was committed without a failing test first):

| Commit    | What it adds                                                                                                                                                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `8bc894b` | [RED][SECURITY][OWASP-A10] Interceptor unit tests: NUL in a top-level field, a nested field, a list item, an object in a list, a key → 400; clean, empty, text and list bodies pass; non-HTTP contexts are untouched                         |
| `1e4fe8d` | [GREEN] The interceptor                                                                                                                                                                                                                      |
| `7f12887` | [RED] `test/nul-characters.e2e-spec.ts`: through the real app with real sessions, NUL in an admin comment, an adjustment reason and a creator comment → 400 with nothing stored. The same comment without NUL → 201. Signed out → still 401. |
| `b9e5a50` | [GREEN] `APP_INTERCEPTOR` registration                                                                                                                                                                                                       |
| `85e9f99` | [RED][SECURITY][OWASP-A02] `security-headers.spec.ts`: the API CSP is `default-src 'none';frame-ancestors 'none'`, and helmet's other headers stay. `test/app.e2e-spec.ts` expects the new policy.                                           |
| `3877dbf` | [GREEN] API CSP                                                                                                                                                                                                                              |
| `faf62cf` | [RED][SECURITY][OWASP-A02] The policy also names `base-uri` and `form-action` as `'none'`, after the first rescan flagged directives without a fallback                                                                                      |
| `ab16964` | [GREEN] The two directives                                                                                                                                                                                                                   |

The RED end-to-end run failed 3 of 5 with 500s, matching the scan. After GREEN it passed 5 of 5.

**Final checks:**

- **Unit tests:** 2,883 passed.
- **PostgreSQL end-to-end:** on a fresh separate database, 435 passed, 6 skipped. The 6 skips are pre-existing:
  `contents-concurrency` runs only when `CONTENTS_TEST_DATABASE_URL` is set, as in CI.
- **Lint, type check, build:** all exit 0.
- **Coverage on every changed source file:** `reject-nul-characters.interceptor.ts` and `security-headers.ts` are at
  100% statements, branches, functions and lines.

## 9. Remaining Risks and Limitations

- **No production-like transport:** the scans ran over HTTP on localhost. HSTS and Secure-cookie checks cannot be
  judged that way. The backend does send HSTS and Secure cookies; they need checking against the HTTPS deployment.
- **Generated OpenAPI coverage:** coverage is limited to the 21 admin and 12 creator operations in the generated
  documents.
  - Not actively scanned: `DELETE` routes, finalize, approve/reject, acknowledge/confirm receipt, payment-proof
    upload, link submission, sync routes and the OAuth flows. They were left out to avoid irreversible or external
    actions.
  - `POST /creators` was only reached at its validation layer.
  - **These routes are not claimed to be secure.** They are covered by the project's own guard and end-to-end tests,
    not by this scan.
- **Frontend pages:** the authenticated full scan's active phase was capped at 6 minutes, and its spider at 2, so not
  every admin and creator page state was attacked.
- **Business logic:** ZAP does not test business-logic flaws such as cross-creator access by id. Those are covered by
  the existing end-to-end tests: a creator gets 403/404 on another creator's data, as observed here.
- **Unpatched hardening:** the potential issues in section 5 (COOP/COEP, `Cache-Control` on API responses, the
  template `GET /` route) remain open as recommendations.

## 10. Conclusion

The scans found **no Critical or High** vulnerability. Authentication and authorization behaved correctly under the
authenticated and unauthenticated scans.

Two confirmed weaknesses were fixed with small, tested changes:

- **V1:** unhandled NUL characters caused 500s (A10:2025). Now a 400 at one boundary.
- **V2:** a page-oriented CSP on API responses (A02:2025). Now `default-src 'none'; frame-ancestors 'none'`.

The rescans no longer report either finding. Remaining items are low-severity hardening recommendations and the
coverage limits listed in section 9.
