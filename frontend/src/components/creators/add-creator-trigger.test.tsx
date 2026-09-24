import { act, fireEvent, render, screen } from "@testing-library/react";
import type { CreateCreatorResult } from "@/lib/creators";
import { AddCreatorTrigger } from "./add-creator-trigger";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace: vi.fn(), push: vi.fn() }),
}));

const createCreator = vi.fn<(...args: unknown[]) => Promise<CreateCreatorResult>>();
vi.mock("@/lib/creators", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/creators")>()),
  createCreator: (...args: unknown[]) => createCreator(...args),
}));

describe("AddCreatorTrigger", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-24T05:00:00Z"));
    refresh.mockReset();
    createCreator.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function openAndFill() {
    fireEvent.click(screen.getByRole("button", { name: /tambah creator/i }));
    fireEvent.change(screen.getByLabelText(/nama creator/i), { target: { value: "Bagas" } });
    fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: "bagas@example.com" } });
    fireEvent.change(screen.getByLabelText(/^platform/i), { target: { value: "instagram" } });
    fireEvent.change(screen.getByLabelText(/jenis kontrak/i), { target: { value: "probation" } });
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "bagas" } });
    fireEvent.change(screen.getByLabelText(/mulai kontrak/i), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText(/akhir kontrak/i), { target: { value: "2026-12-31" } });
    fireEvent.change(screen.getByLabelText(/fixed rate/i), { target: { value: "500000" } });
    fireEvent.change(screen.getByLabelText(/jumlah konten/i), { target: { value: "2" } });
  }

  async function save() {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /simpan/i }));
    });
  }

  it("saves the creator with the previewed deadlines, closes and reloads the table", async () => {
    createCreator.mockResolvedValue({ ok: true });
    render(<AddCreatorTrigger />);
    openAndFill();

    await save();

    expect(createCreator).toHaveBeenCalledWith({
      name: "Bagas",
      email: "bagas@example.com",
      contractStart: "2026-10-01",
      contractEnd: "2026-12-31",
      interval: 14,
      quota: 2,
      fixedRate: 500000,
      socialPlatform: "instagram",
      socialUsername: "bagas",
      contractType: "probation",
      deadlines: ["2026-10-06", "2026-10-20"],
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("disables Simpan while the save is in flight", async () => {
    let finish: (result: CreateCreatorResult) => void = () => {};
    createCreator.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<AddCreatorTrigger />);
    openAndFill();

    await save();
    expect(screen.getByRole("button", { name: /simpan/i })).toBeDisabled();

    await act(async () => finish({ ok: true }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the modal open with the server's message under the rejected field", async () => {
    createCreator.mockResolvedValue({
      ok: false,
      message: "Data creator tidak valid",
      errors: { email: "Email sudah terdaftar" },
    });
    render(<AddCreatorTrigger />);
    openAndFill();

    await save();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Email sudah terdaftar")).toBeInTheDocument();
    expect(screen.getByLabelText(/nama creator/i)).toHaveValue("Bagas");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows a failure with no field errors as an alert", async () => {
    createCreator.mockResolvedValue({
      ok: false,
      message: "Creator gagal disimpan. Coba lagi.",
      errors: {},
    });
    render(<AddCreatorTrigger />);
    openAndFill();

    await save();

    expect(screen.getByRole("alert")).toHaveTextContent("Creator gagal disimpan. Coba lagi.");
  });

  it("opens clean again after a failed save is cancelled", async () => {
    createCreator.mockResolvedValue({
      ok: false,
      message: "Creator gagal disimpan. Coba lagi.",
      errors: { email: "Email sudah terdaftar" },
    });
    render(<AddCreatorTrigger />);
    openAndFill();
    await save();

    fireEvent.click(screen.getByRole("button", { name: /batal/i }));
    fireEvent.click(screen.getByRole("button", { name: /tambah creator/i }));

    expect(screen.queryByText("Email sudah terdaftar")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("closes on Batal without saving anything", () => {
    render(<AddCreatorTrigger />);
    openAndFill();

    fireEvent.click(screen.getByRole("button", { name: /batal/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(createCreator).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
