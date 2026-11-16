# SCRUM-325 — Decorator Pattern in email delivery

## Why

Before this change `SmtpEmailSender` both delivered mail and logged failed sends, and the log
line carried the recipient's address. `CodeRequestService` then logged the same failure a second
time. Logging was tied to one delivery implementation, duplicated, and leaked personal data.

## The pattern

Decorator (Gang of Four, structural): an object that implements the same interface as the one
it wraps, delegates to it, and adds a responsibility before or after the call. Callers cannot
tell a decorated object from a plain one, so behaviour is added without changing either the
wrapped class or its callers.

| Role               | Class                                   | File                                                        |
| ------------------ | --------------------------------------- | ----------------------------------------------------------- |
| Component          | `EmailSender` (interface)               | `backend/src/email/email-sender.ts`                         |
| Concrete component | `SmtpEmailSender`, `unreadyEmailSender` | `backend/src/email/smtp-email-sender.ts`, `email-sender.ts` |
| Concrete decorator | `LoggingEmailSenderDecorator`           | `backend/src/email/logging-email-sender.decorator.ts`       |
| Composition root   | `EmailModule` (`EMAIL_SENDER` provider) | `backend/src/email/email.module.ts`                         |
| Client             | `CodeRequestService`                    | `backend/src/auth/email/code-request.service.ts`            |

```
CodeRequestService ──uses──▶ EmailSender  ◀──implements── SmtpEmailSender
                                  ▲                        unreadyEmailSender (fail-closed)
                                  │ implements
                     LoggingEmailSenderDecorator ──wraps──▶ EmailSender
```

`EmailModule` builds the chain once:

```ts
new LoggingEmailSenderDecorator(
  emailSenderFromEnv(process.env, smtpTransport),
  log,
);
```

`CodeRequestService` still receives an `EmailSender` through `EMAIL_SENDER` and does not know a
decorator is there. A new provider (or a second decorator, e.g. metrics) can be added the same
way without touching the SMTP sender or the auth logic.

## What the decorator does

- `send(message)` passes the very same message to the wrapped sender.
- Accepted: logs `Email accepted for delivery`, resolves.
- Refused (an `Error`, a non-`Error` value, or a synchronous throw): logs
  `Email delivery failed (<kind>)` once, where `<kind>` is the error's class (`TypeError`,
  `PortNotReady`, ...) or its `typeof` (`string`, `object`, ...), then rethrows the same value.

## Security (OWASP Top 10 2025)

- **A04 Cryptographic Failures** — the log never holds the OTP, the subject or bodies, the
  recipient's address, the SMTP account or password, or the provider's error text.
- **A09 Security Logging and Alerting Failures** — every send through `EMAIL_SENDER` is logged
  exactly once, including the fail-closed sender's refusal, which was not logged before.
- **A10 Mishandling of Exceptional Conditions** — the original error propagates unchanged, so
  `CodeRequestService` still discards the unsent code and answers `failed`; the API still
  answers only `CODE_NOT_SENT` / "Kode gagal dikirim. Coba lagi.", never the SMTP error.

Unchanged: the whitelist, rate limit (5 per 60 min), HMAC hashing, 10-minute expiry, the decoy
rows, and the fail-closed sender when SMTP is not configured.

## Tests

- `logging-email-sender.decorator.spec.ts` — delegation, success and failure logs, same-error
  propagation, `PortNotReady`, synchronous throws, non-`Error` values, nothing sensitive logged.
- `email.module.spec.ts` — Nest DI: `EMAIL_SENDER` is the decorator around SMTP (nodemailer
  stubbed), one log line per failure, fail-closed still rejects and is logged.
- `smtp-email-sender.spec.ts`, `code-request.service.spec.ts` — neither logs the failed send
  again; discard and the `failed` answer are kept.
