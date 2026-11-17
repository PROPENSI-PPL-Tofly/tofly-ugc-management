type Env = Record<string, string | undefined>;

const REQUIRED = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'EMAIL_FROM',
] as const;

/** The SMTP account the adapter sends through; its password never leaves the server config. */
export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  /** The address the adapter sends from; the display name comes with each message. */
  from: string;
}

function value(env: Env, name: (typeof REQUIRED)[number]): string {
  return env[name]?.trim() ?? '';
}

/**
 * The outgoing-mail account from the environment, or undefined while any part of it is
 * missing or the port is no whole number. Credentials come from server config (Secret Manager
 * on staging, .env locally) — never from the repo and never from a log (AC 3's rule).
 */
export function smtpConfig(env: Env): SmtpConfig | undefined {
  const [host, port, user, pass, from] = REQUIRED.map((name) => value(env, name));
  if (!host || !user || !pass || !from) {
    return undefined;
  }
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    return undefined;
  }
  return { host, port: Number(port), user, pass, from };
}
