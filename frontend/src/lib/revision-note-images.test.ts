import {
  SCREENSHOT_MAX_BYTES,
  SCREENSHOT_MAX_COUNT,
  SCREENSHOT_TOO_LARGE,
  SCREENSHOT_TOO_MANY,
  SCREENSHOT_TYPE_INVALID,
  noteImageSrc,
  screenshotRefusal,
} from "./revision-note-images";

const MB = 1024 * 1024;

function file(type: string, size = 200 * 1024) {
  return { name: "shot", type, size };
}

describe("screenshotRefusal", () => {
  // Positive: AC 3 takes JPG, PNG and WebP.
  it.each(["image/jpeg", "image/png", "image/webp"])("takes a %s screenshot", (type) => {
    expect(screenshotRefusal(file(type), 0)).toBeNull();
  });

  // Negative: AC 4 words each refusal on its own.
  it.each(["application/pdf", "image/gif", "image/svg+xml", ""])(
    "refuses a %s file with the format message",
    (type) => {
      expect(screenshotRefusal(file(type), 0)).toBe("Format harus JPG, PNG, atau WebP");
    },
  );

  it("refuses a file over 5 MB with the size message", () => {
    expect(screenshotRefusal(file("image/png", 8 * MB), 0)).toBe("Ukuran maksimal 5 MB");
  });

  // The images already in the note count those still uploading or failed too, as the prototype
  // does, so a sixth cannot start while five are on their way.
  it("refuses a sixth image with the count message", () => {
    expect(screenshotRefusal(file("image/png"), 5)).toBe("Maksimal 5 gambar per catatan");
  });

  // Corner: the limits themselves are allowed, one past them is not.
  it("takes a file of exactly 5 MB and refuses one byte more", () => {
    expect(screenshotRefusal(file("image/png", SCREENSHOT_MAX_BYTES), 0)).toBeNull();
    expect(screenshotRefusal(file("image/png", SCREENSHOT_MAX_BYTES + 1), 0)).toBe(
      SCREENSHOT_TOO_LARGE,
    );
  });

  it("takes the fifth image and refuses the sixth", () => {
    expect(screenshotRefusal(file("image/png"), SCREENSHOT_MAX_COUNT - 1)).toBeNull();
    expect(screenshotRefusal(file("image/png"), SCREENSHOT_MAX_COUNT)).toBe(SCREENSHOT_TOO_MANY);
  });

  // Corner: a file that breaks two rules gets the first reason, in the prototype's order.
  it("names the format before the size and the size before the count", () => {
    expect(screenshotRefusal(file("application/pdf", 8 * MB), 5)).toBe(SCREENSHOT_TYPE_INVALID);
    expect(screenshotRefusal(file("image/png", 8 * MB), 5)).toBe(SCREENSHOT_TOO_LARGE);
  });
});

describe("noteImageSrc", () => {
  it("opens an image through the app's own route, from its id alone", () => {
    expect(noteImageSrc("3c2b1a09-8f7e-4d6c-9b5a-4e3d2c1b0a9f")).toBe(
      "/api/revision-note-images/3c2b1a09-8f7e-4d6c-9b5a-4e3d2c1b0a9f",
    );
  });
});
