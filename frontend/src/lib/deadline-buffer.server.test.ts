import { backendGet } from "./backend.server";
import { DEFAULT_BUFFER_DAYS } from "./deadline-buffer";
import { fetchDeadlineBuffer } from "./deadline-buffer.server";

vi.mock("./backend.server", () => ({ backendGet: vi.fn() }));

const mockedGet = vi.mocked(backendGet);

function answer(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("fetchDeadlineBuffer", () => {
  beforeEach(() => {
    mockedGet.mockReset();
  });

  it("reads the one buffer every date picker counts with", async () => {
    mockedGet.mockResolvedValue(answer({ bufferDays: 9, min: 1, max: 14 }));

    await expect(fetchDeadlineBuffer()).resolves.toBe(9);
    expect(mockedGet).toHaveBeenCalledWith("/deadline-buffer");
  });

  it.each([
    ["a refusal", () => mockedGet.mockResolvedValue(answer({}, 500))],
    ["no answer at all", () => mockedGet.mockRejectedValue(new TypeError("offline"))],
  ])("keeps the pickers on the default buffer after %s", async (_label, arrange) => {
    arrange();

    await expect(fetchDeadlineBuffer()).resolves.toBe(DEFAULT_BUFFER_DAYS);
  });
});
