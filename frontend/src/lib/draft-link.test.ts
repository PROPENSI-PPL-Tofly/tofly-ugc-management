import { DRAFT_LINK_NOT_DRIVE, isGoogleDriveLink, MAX_DRAFT_LINK_LENGTH } from "./draft-link";

describe("isGoogleDriveLink", () => {
  it.each([
    "https://drive.google.com/file/d/abc123/view",
    "https://drive.google.com/drive/folders/xyz",
    "  https://drive.google.com/file/d/abc/view  ",
    "HTTPS://DRIVE.GOOGLE.COM/file/d/abc",
  ])("accepts a Google Drive link: %s", (link) => {
    expect(isGoogleDriveLink(link)).toBe(true);
  });

  it.each([
    ["another host", "https://dropbox.com/s/abc"],
    ["plain http", "http://drive.google.com/file/d/abc"],
    ["a look-alike domain", "https://drive.google.com.evil.example/file"],
    ["a Google host that is not Drive", "https://mail.google.com/"],
    ["a Google Docs link", "https://docs.google.com/document/d/abc/edit"],
    ["a subdomain trick", "https://evil.drive-google.com/"],
    ["credentials before the host", "https://drive.google.com@evil.example/"],
    ["a script link", "javascript:alert(1)"],
    ["no scheme", "drive.google.com/file/d/abc"],
    ["empty text", ""],
  ])("refuses %s", (_label, link) => {
    expect(isGoogleDriveLink(link)).toBe(false);
  });

  it("names the hosts it accepts in its message", () => {
    expect(DRAFT_LINK_NOT_DRIVE).toBe(
      "Link draft harus dari Google Drive (drive.google.com)",
    );
    expect(MAX_DRAFT_LINK_LENGTH).toBe(2048);
  });
});
