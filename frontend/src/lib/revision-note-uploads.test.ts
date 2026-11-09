import { SCREENSHOT_TOO_MANY, SCREENSHOT_TYPE_INVALID } from "./revision-note-images";
import {
  addScreenshots,
  failed,
  imageIds,
  isUploading,
  progressed,
  removed,
  restored,
  retried,
  uploaded,
  type Upload,
} from "./revision-note-uploads";

const png = (name = "shot.png") => ({ name, type: "image/png", size: 1024 });
const pdf = { name: "brief.pdf", type: "application/pdf", size: 1024 };

type Shot = ReturnType<typeof png>;

// Ids in order, so a test knows which upload is which.
function ids() {
  let n = 0;
  return () => `u${++n}`;
}

function startWith(count: number): Upload<Shot>[] {
  return addScreenshots(
    [],
    Array.from({ length: count }, (_, i) => png(`${i}.png`)),
    ids(),
  ).uploads;
}

describe("addScreenshots", () => {
  // Positive: each file starts uploading at 0%, in the order it was given.
  it("starts each taken file uploading at 0%, in order", () => {
    const { uploads, refusals } = addScreenshots([], [png("a.png"), png("b.png")], ids());

    expect(uploads.map((u) => [u.id, u.file?.name, u.status])).toEqual([
      ["u1", "a.png", "uploading"],
      ["u2", "b.png", "uploading"],
    ]);
    expect(uploads[0]).toMatchObject({ progress: 0 });
    expect(refusals).toEqual([]);
  });

  // Negative: a refused file gives its own reason and does not stop the others.
  it("refuses a wrong file with its reason, named, and still takes the rest", () => {
    const { uploads, refusals } = addScreenshots([], [png("a.png"), pdf, png("c.png")], ids());

    expect(uploads.map((u) => u.file?.name)).toEqual(["a.png", "c.png"]);
    expect(refusals).toEqual([`${pdf.name}: ${SCREENSHOT_TYPE_INVALID}`]);
  });

  // Corner: uploading and failed images count toward the 5 too.
  it("takes the fifth image and refuses the sixth, counting failed and uploading ones", () => {
    const four = failed(startWith(4), "u1", "Gagal diunggah");

    const { uploads, refusals } = addScreenshots(four, [png("e.png"), png("f.png")], ids());

    expect(uploads).toHaveLength(5);
    expect(refusals).toEqual([`f.png: ${SCREENSHOT_TOO_MANY}`]);
  });

  // Corner: removing one frees its place.
  it("takes a new image once one of five is removed", () => {
    const four = removed(startWith(5), "u3");

    expect(addScreenshots(four, [png("new.png")], ids()).refusals).toEqual([]);
  });
});

describe("an upload's states", () => {
  it("shows its progress while uploading, never past 0–100", () => {
    const uploads = progressed(startWith(1), "u1", 40);

    expect(uploads[0]).toMatchObject({ status: "uploading", progress: 40 });
    expect(progressed(uploads, "u1", 120)[0]).toMatchObject({ progress: 100 });
    expect(progressed(uploads, "u1", -5)[0]).toMatchObject({ progress: 0 });
  });

  it("is done with the stored image's id and link", () => {
    const done = uploaded(startWith(1), "u1", { imageId: "img-1", url: "https://signed/1" });

    expect(done[0]).toMatchObject({ status: "done", imageId: "img-1", url: "https://signed/1" });
  });

  it("fails with a reason, and Coba lagi starts it again from 0%", () => {
    const broken = failed(startWith(1), "u1", "Gagal diunggah");
    expect(broken[0]).toMatchObject({ status: "failed", reason: "Gagal diunggah" });

    expect(retried(broken, "u1")[0]).toMatchObject({ status: "uploading", progress: 0 });
  });

  // Negative: a step that does not fit the upload's state changes nothing.
  it("ignores a retry of an upload that did not fail, and progress after a failure", () => {
    const running = startWith(1);
    expect(retried(running, "u1")).toEqual(running);

    const broken = failed(running, "u1", "Gagal diunggah");
    expect(progressed(broken, "u1", 80)).toEqual(broken);
    expect(uploaded(broken, "u1", { imageId: "late", url: "x" })).toEqual(broken);
  });

  // Corner: an answer for an image already removed (the upload ended after the ×) is dropped.
  it("ignores an answer for an image that was removed", () => {
    const none = removed(startWith(1), "u1");

    expect(uploaded(none, "u1", { imageId: "img-1", url: "x" })).toEqual([]);
  });
});

describe("what the form reads", () => {
  // AC 5: Kirim Revisi waits while any image is still uploading.
  it("says it is still uploading while any image is", () => {
    const two = startWith(2);
    expect(isUploading(two)).toBe(true);

    const settled = failed(
      uploaded(two, "u1", { imageId: "img-1", url: "x" }),
      "u2",
      "Gagal diunggah",
    );
    expect(isUploading(settled)).toBe(false);
    expect(isUploading([])).toBe(false);
  });

  it("sends only the stored images, in their order", () => {
    let uploads = startWith(3);
    uploads = uploaded(uploads, "u3", { imageId: "img-3", url: "x" });
    uploads = uploaded(uploads, "u1", { imageId: "img-1", url: "x" });
    uploads = failed(uploads, "u2", "Gagal diunggah");

    expect(imageIds(uploads)).toEqual(["img-1", "img-3"]);
  });
});

describe("restored", () => {
  const kept = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ imageId: `img-${i}`, url: `/api/revision-note-images/img-${i}` }));

  // Review on #188: what a closed form left on the server comes back as stored images, older
  // than anything added now.
  it("brings the server's images back as stored, before the new ones", () => {
    const uploads = restored(startWith(1), kept(2), ids());

    expect(uploads.map((u) => [u.status, u.status === "done" ? u.imageId : u.file?.name])).toEqual([
      ["done", "img-0"],
      ["done", "img-1"],
      ["uploading", "0.png"],
    ]);
  });

  // AC 3: they count toward the five, as the server counts them.
  it("counts them toward the five", () => {
    const three = restored([], kept(3), ids());

    const { uploads, refusals } = addScreenshots(three, [png("a.png"), png("b.png"), png("c.png")], ids());

    expect(uploads).toHaveLength(5);
    expect(refusals).toEqual([`c.png: ${SCREENSHOT_TOO_MANY}`]);
  });

  it("sends them with the note", () => {
    expect(imageIds(restored([], kept(2), ids()))).toEqual(["img-0", "img-1"]);
  });

  // Corner: an image uploaded while the list was on its way is in both; it shows once.
  it("never shows an image twice", () => {
    const one = uploaded(startWith(1), "u1", { imageId: "img-0", url: "x" });

    const uploads = restored(one, kept(2), ids());

    expect(imageIds(uploads)).toEqual(["img-1", "img-0"]);
  });
});

describe("progressed without a change", () => {
  // Review on #188: XHR reports progress about every 50 ms, far more often than the whole percent
  // changes. The same list back lets React skip drawing the editor again for nothing.
  it("leaves the list as it is when the percent does not change", () => {
    const at40 = progressed(startWith(1), "u1", 40);

    expect(progressed(at40, "u1", 40)).toBe(at40);
  });

  it("gives a new list when the percent does change", () => {
    const at40 = progressed(startWith(1), "u1", 40);

    expect(progressed(at40, "u1", 41)).not.toBe(at40);
  });
});
