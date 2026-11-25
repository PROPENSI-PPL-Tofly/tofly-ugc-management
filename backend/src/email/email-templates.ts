// The template port of PBI-11 (11.1 ↔ 11.4): the helper names a template and hands it the
// event's data; the templates (11.4) answer the subject and both bodies. The helper never knows
// the copy, and the templates never know how or whether the email is sent (DIP).

/** One email as its template words it, before it has a recipient. */
export interface RenderedEmail {
  subject: string;
  /** The plain-text version every email carries (AC 7). */
  text: string;
  html: string;
}

export interface EmailTemplates {
  /** Throws for a template it does not know; the helper logs that as a failed email. */
  render(template: string, data: Record<string, unknown>): RenderedEmail;
}

/** Nest injection token for EmailTemplates, since an interface does not exist at runtime. */
export const EMAIL_TEMPLATES = Symbol('EMAIL_TEMPLATES');
