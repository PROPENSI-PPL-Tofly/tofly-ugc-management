import { screenshotUploader, UploadRefused } from "./revision-note-images-api";

const SUBMISSION = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";

// A fake XMLHttpRequest: it records what the adapter sends and lets the test answer it.
class FakeRequest {
  method = "";
  url = "";
  body: unknown = null;
  status = 0;
  responseText = "";
  aborted = false;
  timeout = 0;
  upload: { onprogress: ((event: Partial<ProgressEvent>) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  ontimeout: (() => void) | null = null;

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  send(body: unknown) {
    this.body = body;
  }

  abort() {
    this.aborted = true;
    this.onabort?.();
  }

  progress(loaded: number, total: number, lengthComputable = true) {
    this.upload.onprogress?.({ loaded, total, lengthComputable });
  }

  answer(status: number, body: unknown) {
    this.answerText(status, JSON.stringify(body));
  }

  // An answer as the wire carries it, which need not be JSON at all.
  answerText(status: number, text: string) {
    this.status = status;
    this.responseText = text;
    this.onload?.();
  }
}

function setUp(submissionId = SUBMISSION) {
  const requests: FakeRequest[] = [];
  const fetchStub = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
  const uploader = screenshotUploader(submissionId, {
    request: () => {
      const request = new FakeRequest();
      requests.push(request);
      return request as unknown as XMLHttpRequest;
    },
    fetch: fetchStub,
  });
  return { uploader, requests, fetchStub };
}

const shot = () => new File(["x"], "layar.png", { type: "image/png" });

function start(uploader: ReturnType<typeof setUp>["uploader"], signal = new AbortController().signal) {
  const onProgress = vi.fn();
  const result = uploader.upload(shot(), { onProgress, signal });
  return { result, onProgress };
}

describe("screenshotUploader upload", () => {
  // Positive: 34.1's route, through this app's /api, with the file in the "file" field.
  it("posts the screenshot to the submission's images through /api", () => {
    const { uploader, requests } = setUp();
    start(uploader);

    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toBe(`/api/submissions/${SUBMISSION}/revision-note-images`);
    expect((requests[0].body as FormData).get("file")).toBeInstanceOf(File);
  });

  // AC 5: the progress of the upload, in whole percent.
  it("tells its progress in whole percent", () => {
    const { uploader, requests } = setUp();
    const { onProgress } = start(uploader);

    requests[0].progress(1, 3);
    requests[0].progress(3, 3);

    expect(onProgress.mock.calls).toEqual([[33], [100]]);
  });

  // Corner: a browser that cannot tell the size gives no percent to show.
  it("says nothing of a progress whose size is unknown", () => {
    const { uploader, requests } = setUp();
    const { onProgress } = start(uploader);

    requests[0].progress(10, 0, false);

    expect(onProgress).not.toHaveBeenCalled();
  });

  // Positive: 34.1 answers 201 { id, url }; the editor reads it as imageId.
  it("gives the stored image's id and link once 34.1 keeps it", async () => {
    const { uploader, requests } = setUp();
    const { result } = start(uploader);

    requests[0].answer(201, {
      id: "img-1",
      url: "/api/revision-note-images/img-1",
      contentType: "image/png",
      sizeBytes: 1,
      createdAt: "2026-11-06T10:00:00.000Z",
    });

    await expect(result).resolves.toEqual({
      imageId: "img-1",
      url: "/api/revision-note-images/img-1",
    });
  });

  // Negative (AC 4): a refusal from 34.1 keeps its own reason.
  it("refuses with 34.1's own reason when it turns the file down", async () => {
    const { uploader, requests } = setUp();
    const { result } = start(uploader);

    requests[0].answer(422, { code: "IMAGE_LIMIT", message: "Maksimal 5 gambar per catatan" });

    await expect(result).rejects.toEqual(new UploadRefused("Maksimal 5 gambar per catatan"));
  });

  // Negative: any other failure is a plain failure, with no reason to show from the server.
  it.each([
    ["a server error", (r: FakeRequest) => r.answer(500, { message: "Internal" })],
    ["a lost connection", (r: FakeRequest) => r.onerror?.()],
  ])("fails on %s without a refusal", async (_what, fail) => {
    const { uploader, requests } = setUp();
    const { result } = start(uploader);

    fail(requests[0]);

    const error = await result.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(UploadRefused);
  });

  // Corner: × while uploading cancels the request itself.
  it("stops the request when its upload is cancelled", async () => {
    const { uploader, requests } = setUp();
    const controller = new AbortController();
    const { result } = start(uploader, controller.signal);

    controller.abort();

    expect(requests[0].aborted).toBe(true);
    await expect(result).rejects.toBeInstanceOf(Error);
  });

  // OWASP A01: a crafted id cannot climb out of /submissions/ to another route.
  it("keeps a crafted submission id inside its own path", () => {
    const { uploader, requests } = setUp("../admin");
    start(uploader);

    expect(requests[0].url).toBe("/api/submissions/..%2Fadmin/revision-note-images");
  });
});

describe("screenshotUploader remove", () => {
  // AC 5 with 34.1: a stored image is deleted on the server.
  it("deletes the stored image through /api", async () => {
    const { uploader, fetchStub } = setUp();

    await uploader.remove("img-1");

    expect(fetchStub).toHaveBeenCalledWith(
      `/api/submissions/${SUBMISSION}/revision-note-images/img-1`,
      { method: "DELETE" },
    );
  });

  // Negative: the image stays when the server does not delete it.
  it("fails when the server does not delete the image", async () => {
    const { uploader, fetchStub } = setUp();
    fetchStub.mockResolvedValueOnce(new Response(null, { status: 404 }));

    await expect(uploader.remove("img-1")).rejects.toBeInstanceOf(Error);
  });

  // OWASP A01: a crafted image id stays inside its own path too.
  it("keeps a crafted image id inside its own path", async () => {
    const { uploader, fetchStub } = setUp();

    await uploader.remove("../../users");

    expect(fetchStub.mock.calls[0][0]).toBe(
      `/api/submissions/${SUBMISSION}/revision-note-images/..%2F..%2Fusers`,
    );
  });
});

describe("screenshotUploader edges", () => {
  // Negative: a 422 that gives no readable reason is a plain failure, not a refusal with none.
  it.each([
    ["no JSON", "Unprocessable"],
    ["no message", JSON.stringify({ code: "IMAGE_TYPE" })],
  ])("treats a 422 with %s as a plain failure", async (_what, body) => {
    const { uploader, requests } = setUp();
    const { result } = start(uploader);

    requests[0].status = 422;
    requests[0].responseText = body;
    requests[0].onload?.();

    const error = await result.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(UploadRefused);
  });

  // The app passes nothing: the browser's own XMLHttpRequest and fetch are used.
  it("uses the browser's own XMLHttpRequest and fetch when none is given", async () => {
    const requests: FakeRequest[] = [];
    vi.stubGlobal(
      "XMLHttpRequest",
      class extends FakeRequest {
        constructor() {
          super();
          requests.push(this);
        }
      },
    );
    const fetchStub = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchStub);
    try {
      const uploader = screenshotUploader(SUBMISSION);
      start(uploader);
      await uploader.remove("img-1");

      expect(requests).toHaveLength(1);
      expect(fetchStub).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("screenshotUploader answers it cannot read", () => {
  // AC 5 (review on #188): an upload must end, failed and retryable, rather than stay
  // "Mengunggah" and hold Kirim Revisi back for good.
  it.each([
    ["a page that is not JSON", "<html>Bad gateway</html>"],
    ["JSON without the image's id and link", JSON.stringify({ ok: true })],
  ])("fails on a 201 that is %s", async (_what, text) => {
    const { uploader, requests } = setUp();
    const { result } = start(uploader);

    expect(() => requests[0].answerText(201, text)).not.toThrow();

    const error = await result.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(UploadRefused);
  });

  // Corner: a connection that hangs without an error ends after a minute, enough for 5 MB on a
  // slow line.
  it("gives up on a request that hangs, after 60 seconds", async () => {
    const { uploader, requests } = setUp();
    const { result } = start(uploader);

    expect(requests[0].timeout).toBe(60_000);
    requests[0].ontimeout?.();

    await expect(result).rejects.toBeInstanceOf(Error);
  });
});

describe("screenshotUploader list", () => {
  const listed = (images: unknown[]) =>
    new Response(JSON.stringify(images), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  // Review on #188: the images a closed form left on the server come back when it opens again,
  // so the five on screen are the five the server counts.
  it("reads the note's images 34.1 still holds, through /api", async () => {
    const { uploader, fetchStub } = setUp();
    fetchStub.mockResolvedValueOnce(
      listed([
        { id: "img-1", url: "/api/revision-note-images/img-1", sent: false },
        { id: "img-2", url: "/api/revision-note-images/img-2", sent: false },
      ]),
    );

    await expect(uploader.list()).resolves.toEqual([
      { imageId: "img-1", url: "/api/revision-note-images/img-1" },
      { imageId: "img-2", url: "/api/revision-note-images/img-2" },
    ]);
    expect(fetchStub).toHaveBeenCalledWith(`/api/submissions/${SUBMISSION}/revision-note-images`);
  });

  // Negative: an image already sent with an earlier note is history, not part of this note.
  it("leaves out the images already sent", async () => {
    const { uploader, fetchStub } = setUp();
    fetchStub.mockResolvedValueOnce(
      listed([
        { id: "old", url: "/api/revision-note-images/old", sent: true },
        { id: "new", url: "/api/revision-note-images/new", sent: false },
      ]),
    );

    await expect(uploader.list()).resolves.toEqual([
      { imageId: "new", url: "/api/revision-note-images/new" },
    ]);
  });

  // Negative: a list the server refuses is a failure, not an empty note.
  it("fails when the server does not give the list", async () => {
    const { uploader, fetchStub } = setUp();
    fetchStub.mockResolvedValueOnce(new Response(null, { status: 403 }));

    await expect(uploader.list()).rejects.toBeInstanceOf(Error);
  });

  // Corner: an entry without an id or a link is skipped rather than shown as a broken tile.
  it("skips an entry it cannot read", async () => {
    const { uploader, fetchStub } = setUp();
    fetchStub.mockResolvedValueOnce(
      listed([{ sent: false }, { id: "img-1", url: "/api/revision-note-images/img-1", sent: false }]),
    );

    await expect(uploader.list()).resolves.toEqual([
      { imageId: "img-1", url: "/api/revision-note-images/img-1" },
    ]);
  });
});
