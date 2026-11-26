// Shared by every email template: words put into an HTML body go through here, so a name, a
// content title or a note can never become markup in a recipient's mail reader (OWASP A05).

/** The five characters that would otherwise become markup in an HTML body. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}
