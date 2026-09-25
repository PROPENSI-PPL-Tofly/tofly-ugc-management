import { safeHref } from "./safe-href";

describe("safeHref", () => {
  it.each([
    "https://drive.google.com/file/d/abc/view",
    "http://example.com/draft.mp4",
    "https://drive.google.com/file/d/abc/view?usp=sharing#t=10",
  ])("lets the web link %s through unchanged", (link) => {
    expect(safeHref(link)).toBe(link);
  });

  it("accepts a scheme written in capitals", () => {
    expect(safeHref("HTTPS://drive.google.com/file/d/abc")).toBe(
      "HTTPS://drive.google.com/file/d/abc",
    );
  });

  it("trims the spaces a pasted link often carries", () => {
    expect(safeHref("  https://drive.google.com/file/d/abc \n")).toBe(
      "https://drive.google.com/file/d/abc",
    );
  });

  // Anything a browser would run or open locally instead of navigating to a web page.
  it.each([
    "javascript:alert(document.cookie)",
    "JavaScript:alert(1)",
    "  javascript:alert(1)",
    "\tjava\nscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "mailto:admin@tofly.id",
  ])("refuses the non-web link %j", (link) => {
    expect(safeHref(link)).toBeNull();
  });

  // Without a scheme the browser would resolve these against this app, not the creator's
  // host, so the admin would land on one of our own pages instead of the draft.
  it.each([
    "drive.google.com/file/d/abc",
    "/admin/creators",
    "//evil.example/draft",
    "not a link",
  ])("refuses %j, which is not an absolute web address", (link) => {
    expect(safeHref(link)).toBeNull();
  });

  it.each(["", "   "])("refuses the empty link %j", (link) => {
    expect(safeHref(link)).toBeNull();
  });
});
