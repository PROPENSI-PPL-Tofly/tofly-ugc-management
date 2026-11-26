import { join } from 'node:path';
import { escapeHtml } from '../html.js';
import { notificationEmail } from './notification-email.js';
import { NOTIFICATION_SAMPLES } from './notification-samples.js';
import {
  NOTIFICATION_TEMPLATES,
  type NotificationTemplate,
} from './notification-templates.js';

// The 11.4 preview: every template rendered with its sample data, as an HTML page and a text
// file, plus an index linking them all — so the copy can be read the way a recipient sees it
// without sending anything. Pure rendering here; preview-notifications-cli.ts writes the files.

/** The app address the previews' buttons point at. */
export const PREVIEW_APP_URL = 'http://localhost:3000';

export interface PreviewFile {
  name: string;
  content: string;
}

function page(title: string, body: string): string {
  return [
    '<!doctype html>',
    '<html lang="id"><head><meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    '</head><body style="margin:24px">',
    body,
    '</body></html>',
  ].join('\n');
}

export function renderPreviews(): PreviewFile[] {
  const templates = Object.keys(
    NOTIFICATION_TEMPLATES,
  ) as NotificationTemplate[];
  const files: PreviewFile[] = [];
  const entries: string[] = [];

  for (const template of templates) {
    const email = notificationEmail(
      template,
      NOTIFICATION_SAMPLES[template],
      PREVIEW_APP_URL,
    );
    const attached = (email.attachments ?? []).map(
      (file) => `Lampiran: ${file.filename} (${file.content.length} byte)`,
    );

    files.push(
      { name: `${template}.html`, content: page(email.subject, email.html) },
      {
        name: `${template}.txt`,
        content: [`Subjek: ${email.subject}`, ...attached, '', email.text].join(
          '\n',
        ),
      },
    );
    entries.push(
      `<li><a href="${template}.html">${escapeHtml(email.subject)}</a> · <a href="${template}.txt">teks</a> · ${NOTIFICATION_TEMPLATES[template].audience}</li>`,
    );
  }

  files.push({
    name: 'index.html',
    content: page(
      'Preview email Tofly',
      `<h1>Preview email Tofly</h1>\n<ul>\n${entries.join('\n')}\n</ul>`,
    ),
  });
  return files;
}

/** The two file-system calls the writer makes, so a test can fake them. */
export interface PreviewFileSystem {
  mkdir(dir: string): Promise<unknown>;
  writeFile(path: string, content: string): Promise<unknown>;
}

/** Writes every preview into `dir` and answers with the index's path. */
export async function writePreviews(
  dir: string,
  fs: PreviewFileSystem,
): Promise<string> {
  await fs.mkdir(dir);
  for (const file of renderPreviews()) {
    await fs.writeFile(join(dir, file.name), file.content);
  }
  return join(dir, 'index.html');
}
