import { fireEvent, render, screen } from "@testing-library/react";
import { PageSyncButton } from "./page-sync-button";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const LINKS = ["33333333-3333-4333-8333-333333333333", "55555555-5555-4555-8555-555555555555"];

beforeEach(() => {
  refresh.mockReset();
});

describe("PageSyncButton (Sinkronkan Sekarang on Performa Konten, SCRUM-285)", () => {
  it("syncs the page's links at once, disabled while it runs, then toasts and reloads the page", async () => {
    let finish: (value: { ok: true; toast: string }) => void = () => undefined;
    const sync = vi.fn(() => new Promise<{ ok: true; toast: string }>((resolve) => (finish = resolve)));
    render(<PageSyncButton linkIds={LINKS} sync={sync} />);

    fireEvent.click(screen.getByRole("button", { name: "Sinkronkan Sekarang" }));

    expect(screen.getByRole("button", { name: "Menyinkronkan…" })).toBeDisabled();
    expect(sync).toHaveBeenCalledWith(LINKS);

    finish({ ok: true, toast: "Data performa 2 link diperbarui" });
    expect(await screen.findByText("Data performa 2 link diperbarui")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Sinkronkan Sekarang" })).toBeEnabled();
  });

  it("toasts why a sync did not run, and reloads nothing", async () => {
    const sync = vi.fn().mockResolvedValue({ ok: false, message: "Sinkronisasi gagal. Coba lagi." });
    render(<PageSyncButton linkIds={LINKS} sync={sync} />);

    fireEvent.click(screen.getByRole("button", { name: "Sinkronkan Sekarang" }));

    expect(await screen.findByText("Sinkronisasi gagal. Coba lagi.")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("explains beside it that only this page, as filtered, is synced", () => {
    render(<PageSyncButton linkIds={LINKS} sync={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Tentang Sinkronkan Sekarang" })).toHaveAccessibleDescription(
      "Hanya link di halaman ini yang disinkronkan, sesuai filter yang dipakai. Link di halaman lain tidak ikut.",
    );
  });
});
