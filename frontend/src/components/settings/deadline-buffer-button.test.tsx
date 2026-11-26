import { act, fireEvent, render, screen } from "@testing-library/react";
import type { BufferSaver } from "@/lib/deadline-buffer";
import { DeadlineBufferButton } from "./deadline-buffer-button";
import { DeadlineBufferProvider } from "./deadline-buffer-context";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace: vi.fn(), push: vi.fn() }),
}));

function renderButton(
  saveAction = vi.fn<BufferSaver>().mockResolvedValue({ ok: true, bufferDays: 8 }),
) {
  render(
    <DeadlineBufferProvider bufferDays={6}>
      <DeadlineBufferButton saveAction={saveAction} />
    </DeadlineBufferProvider>,
  );
  return saveAction;
}

describe("DeadlineBufferButton", () => {
  beforeEach(() => refresh.mockReset());

  it("names the buffer in force and opens the modal on it", () => {
    renderButton();

    fireEvent.click(screen.getByRole("button", { name: "Atur Buffer Deadline (6 hari)" }));

    expect(screen.getByLabelText("Buffer deadline (hari)")).toHaveValue("6");
  });

  it("closes, confirms with a toast and fetches the page again so every picker reads the new buffer", async () => {
    renderButton();

    fireEvent.click(screen.getByRole("button", { name: /Atur Buffer Deadline/ }));
    fireEvent.change(screen.getByLabelText("Buffer deadline (hari)"), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ya, Ubah" }));
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Buffer deadline diubah jadi 8 hari.");
    expect(refresh).toHaveBeenCalled();
  });

  it("closes without saving when cancelled", () => {
    const saveAction = renderButton();

    fireEvent.click(screen.getByRole("button", { name: /Atur Buffer Deadline/ }));
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(saveAction).not.toHaveBeenCalled();
  });
});
