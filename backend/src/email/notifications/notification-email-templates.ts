import { PortNotReady } from '../../auth/google/unready-ports.js';
import type { InvoicePdfService } from '../../invoices/invoice-pdf.service.js';
import type { EmailTemplates, RenderedEmail } from '../email-templates.js';
import type { ContractFacts } from './contract-facts.js';
import { notificationEmail } from './notification-email.js';
import { readPayload } from './notification-payload.js';
import {
  NOTIFICATION_TEMPLATES,
  type NotificationData,
  type NotificationTemplate,
} from './notification-templates.js';

// 11.4 behind 11.1's EMAIL_TEMPLATES port (Adapter): the helper names a template and hands it
// the logged data; this reads that data field by field, adds what the trigger does not send (the
// period number, the total, the Paid email's PDF) and draws the email in the shared layout.
// Anything missing throws, so the helper marks the email failed and the 08:00 run retries it.

/** The helper logged a template name no template answers to. */
export class UnknownNotificationTemplate extends Error {}

/** The PBI-31 file the Paid email attaches; tests hand in a stub of just that call. */
export type InvoicePdfs = Pick<InvoicePdfService, 'forContract'>;

/** The facts each template reads beside its data, by what it needs. */
const READS: Partial<Record<NotificationTemplate, 'period' | 'invoice'>> = {
  payment_proof_uploaded: 'period',
  period_added: 'period',
  invoice_acknowledged: 'period',
  invoice_finalized: 'invoice',
  invoice_paid: 'invoice',
};

function isTemplate(name: string): name is NotificationTemplate {
  // Own keys only, so "toString" or "__proto__" is no template.
  return Object.hasOwn(NOTIFICATION_TEMPLATES, name);
}

export class NotificationEmailTemplates implements EmailTemplates {
  constructor(
    private readonly facts: ContractFacts,
    private readonly pdfs: InvoicePdfs,
    /** The app the buttons open (FRONTEND_URL), read on each render. */
    private readonly appUrl: () => string | undefined = () =>
      process.env.FRONTEND_URL,
  ) {}

  async render(
    template: string,
    payload: Record<string, unknown>,
  ): Promise<RenderedEmail> {
    if (!isTemplate(template)) {
      throw new UnknownNotificationTemplate(`No email template ${template}`);
    }
    const appUrl = this.appUrl()?.trim();
    // Without the app's address the button leads nowhere; the email waits instead (AC 7, AC 9).
    if (!appUrl) throw new PortNotReady('FRONTEND_URL is not set');

    const data = readPayload(template, payload);
    const contractId = data.contractId as string;
    const reads = READS[template];
    if (reads === 'period')
      Object.assign(data, await this.facts.period(contractId));
    if (reads === 'invoice')
      Object.assign(data, await this.facts.invoice(contractId));
    // AC 3: the invoice PDF as PBI-31 makes it; the helper is no creator, so no ownership check.
    if (template === 'invoice_paid') {
      const pdf = await this.pdfs.forContract(contractId, {}, 'invoice');
      data.invoicePdf = { filename: pdf.fileName, content: pdf.bytes };
    }

    return notificationEmail(
      template,
      data as unknown as NotificationData[typeof template],
      appUrl,
    );
  }
}
