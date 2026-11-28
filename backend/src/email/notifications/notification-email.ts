import type { RenderedEmail } from '../email-templates.js';
import { renderNotification } from './notification-layout.js';
import {
  NOTIFICATION_TEMPLATES,
  type NotificationData,
  type NotificationTemplate,
} from './notification-templates.js';

/**
 * One notification as the helper sends it (11.1's RenderedEmail): the template's words drawn in
 * the shared layout, its button pointing at `appUrl`. Pure — nothing is read or sent here — so
 * the helper decides when and to whom (and adds the sender "Tofly"), and this file only what the
 * email says.
 */
export function notificationEmail<T extends NotificationTemplate>(
  template: T,
  data: NotificationData[T],
  appUrl: string,
): RenderedEmail {
  const definition = NOTIFICATION_TEMPLATES[template];
  const { text, html } = renderNotification(
    {
      greetingName: data.recipientName,
      lines: definition.lines(data),
      button: definition.button(data),
    },
    appUrl,
  );

  return {
    subject: definition.subject(data),
    text,
    html,
    ...(definition.attachments
      ? { attachments: definition.attachments(data) }
      : {}),
  };
}
