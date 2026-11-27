import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { CreatorPeriod, CreatorProfile } from "@/lib/creator-detail";
import type { UsernameLocks } from "@/lib/creator-edit";
import type { SaveCreatorEditResult } from "@/lib/creator-edit-api";
import { EditCreatorTrigger } from "./edit-creator-trigger";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace: vi.fn(), push: vi.fn() }),
}));

// The API is stubbed: creator-edit-api.test covers the request itself.
const saveCreatorEdit = vi.fn<(...args: unknown[]) => Promise<SaveCreatorEditResult>>();
vi.mock("@/lib/creator-edit-api", () => ({
  saveCreatorEdit: (...args: unknown[]) => saveCreatorEdit(...args),
}));

const CREATOR: CreatorProfile = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Salsa Amelia",
  email: "salsa@example.com",
  socials: { instagram: "salsa.ig" },
  accessRevokeDate: null,
};
const CONTRACT = "22222222-2222-4222-8222-222222222222";
const UNLOCKED: UsernameLocks = { instagram: null, tiktok: null };

function period(overrides: Partial<CreatorPeriod> = {}): CreatorPeriod {
  return {
    contractId: CONTRACT,
    periodNumber: 2,
    type: "probation",
    startDate: "2026-09-01",
    endDate: "2026-12-15",
    status: "active",
    contentQuota: 6,
    evergreenCount: 5,
    evergreenPlanned: 5,
    remainingEvergreenQuota: 1,
    daysBetween: 14,
    fixedRate: 4_000_000,
    invoiceStatus: "running",
    earlyEndReason: null,
    progress: { submitted: 0, total: 6, percent: 0 },
    performance: { onTimeRate: null, avgRevisions: 0, productivity: "no_data", productivityLabel: "Belum Ada Data" },
    ...overrides,
  };
}

const NEXT = period({ contractId: "c3", periodNumber: 3, startDate: "2027-01-01", endDate: "2027-03-31", status: "upcoming" });

function open({
  selected = period(),
  periods = selected ? [NEXT, selected] : [],
  locks = UNLOCKED,
}: { selected?: CreatorPeriod | null; periods?: CreatorPeriod[]; locks?: UsernameLocks } = {}) {
  render(<EditCreatorTrigger creator={CREATOR} period={selected} periods={periods} usernameLocks={locks} />);
  fireEvent.click(screen.getByRole("button", { name: "Ubah Data" }));
  return screen.getByRole("dialog", { name: "Ubah Data Creator — Salsa Amelia" });
}

function type(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

const save = () => screen.getByRole("button", { name: "Simpan" });

/** Simpan on the form, then Simpan on the confirmation stacked over it. */
async function confirm() {
  fireEvent.click(save());
  const dialog = screen.getByRole("alertdialog");
  await act(async () => {
    fireEvent.click(within(dialog).getByRole("button", { name: "Simpan Perubahan" }));
  });
}

describe("EditCreatorTrigger", () => {
  beforeEach(() => {
    refresh.mockReset();
    saveCreatorEdit.mockReset();
  });

  it("opens the form on the creator and the period on show", () => {
    open();

    expect(screen.getByLabelText(/nama creator/i)).toHaveValue("Salsa Amelia");
    expect(screen.getByLabelText(/^email/i)).toHaveValue("salsa@example.com");
    expect(screen.getByLabelText(/username instagram/i)).toHaveValue("salsa.ig");
    expect(screen.getByLabelText(/username tiktok/i)).toHaveValue("");
    expect(screen.getByLabelText(/jenis kontrak/i)).toHaveValue("probation");
    expect(screen.getByLabelText(/fixed rate/i)).toHaveValue("4.000.000");
    expect(screen.getByLabelText(/mulai kontrak/i)).toHaveValue("1 Sep 2026");
    expect(screen.getByLabelText(/akhir kontrak/i)).toHaveValue("2026-12-15");
    expect(screen.getByLabelText(/jumlah konten/i)).toHaveValue("6");
    expect(screen.getByLabelText(/jarak antar-deadline/i)).toHaveValue("14");
    expect(screen.getByRole("group", { name: "Kontrak & Jadwal · Periode 2" })).toBeInTheDocument();
  });

  it("shows only who the creator is when they have no contract", () => {
    open({ selected: null });

    expect(screen.getByRole("group", { name: "Data Creator" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /kontrak/i })).not.toBeInTheDocument();
  });

  it("limits the end date picker to later days, up to the day before the next period", () => {
    open();
    const end = screen.getByLabelText(/akhir kontrak/i);
    expect(end).toHaveAttribute("min", "2026-12-15");
    expect(end).toHaveAttribute("max", "2026-12-31");
  });

  // QA: Mulai Kontrak reads "19 Agu 2026" while the native picker shows the browser's own format;
  // the picked end is spelled the same way beneath it.
  it("spells the picked end date the way Mulai Kontrak reads, beneath the picker", () => {
    open();
    const end = screen.getByLabelText(/akhir kontrak/i);
    expect(end).toHaveAccessibleDescription("15 Des 2026");

    type(/akhir kontrak/i, "2026-12-20");

    expect(screen.getByLabelText(/akhir kontrak/i)).toHaveAccessibleDescription("20 Des 2026");
  });

  it("sets no last day when no period follows", () => {
    open({ periods: [period()] });
    expect(screen.getByLabelText(/akhir kontrak/i)).not.toHaveAttribute("max");
  });

  describe("read-only fields", () => {
    // Focusable on purpose: a keyboard or screen reader user reaches the value and its reason.
    it.each([
      [/username instagram/i, { instagram: "connected", tiktok: null }, "Mengikuti akun yang terhubung."],
      [/username tiktok/i, { instagram: null, tiktok: "link_submitted" }, "Sudah ada link konten yang dikirim di platform ini."],
    ] as const)("makes %s read-only with its reason", (label, locks, reason) => {
      open({ locks });
      const field = screen.getByLabelText(label);
      expect(field).toHaveAttribute("readonly");
      expect(field).not.toBeDisabled();
      expect(screen.getByText(reason)).toBeInTheDocument();
    });

    it("locks the rate once the invoice no longer runs, and nothing else of an active period", () => {
      open({ selected: period({ invoiceStatus: "finalized" }) });
      expect(screen.getByLabelText(/fixed rate/i)).toHaveAttribute("readonly");
      expect(screen.getByLabelText(/fixed rate/i)).toHaveValue("Rp4.000.000");
      expect(screen.getByLabelText(/akhir kontrak/i)).not.toHaveAttribute("readonly");
      expect(screen.getByLabelText(/jumlah konten/i)).not.toHaveAttribute("readonly");
    });

    it("keeps only the type and a running rate open on an ended period", () => {
      open({ selected: period({ status: "expired" }) });
      expect(screen.getByLabelText(/akhir kontrak/i)).toHaveValue("15 Des 2026");
      expect(screen.getByLabelText(/jumlah konten/i)).toHaveAttribute("readonly");
      expect(screen.getByLabelText(/jenis kontrak/i)).toBeEnabled();
      expect(screen.getByLabelText(/fixed rate/i)).not.toHaveAttribute("readonly");
    });
  });

  describe("Simpan", () => {
    it("waits for a change", () => {
      open();
      expect(save()).toBeDisabled();
      type(/nama creator/i, "Rani");
      expect(save()).toBeEnabled();
      type(/nama creator/i, "Salsa Amelia");
      expect(save()).toBeDisabled();
    });

    it("waits for every change to be valid, and says what is wrong once the field is left", () => {
      open();
      type(/^email/i, "bukan-email");
      expect(save()).toBeDisabled();
      expect(screen.queryByText("Format email tidak valid")).not.toBeInTheDocument();
      fireEvent.blur(screen.getByLabelText(/^email/i));
      expect(screen.getByText("Format email tidak valid")).toBeInTheDocument();
    });

    // A date is picked, not typed: its verdict is due at once.
    it("judges a picked end date at once", () => {
      open();
      type(/akhir kontrak/i, "2027-01-01");
      expect(
        screen.getByText("Paling lambat 31 Des 2026, sehari sebelum Periode 3 mulai"),
      ).toBeInTheDocument();
    });

    it.each([
      [/nama creator/i, "", "Nama wajib diisi"],
      [/username instagram/i, "a".repeat(101), "Username maksimal 100 karakter"],
      [/username tiktok/i, "a".repeat(101), "Username maksimal 100 karakter"],
      [/jenis kontrak/i, "", "Jenis kontrak wajib dipilih"],
      [/fixed rate/i, "", "Fixed rate wajib diisi"],
      [/jumlah konten/i, "4", "Minimal 5, sesuai konten Evergreen yang sudah ada"],
      [/jumlah konten/i, "", "Jumlah konten harus lebih dari 0"],
      [/akhir kontrak/i, "", "Tanggal berakhir wajib diisi"],
    ])("explains %s left as %j", (label, value, message) => {
      open();
      type(label, value);
      fireEvent.blur(screen.getByLabelText(label));
      expect(screen.getByText(message)).toBeInTheDocument();
    });
  });

  // AC 4: the confirmation lists every change.
  it("lists every change before saving, old and new", () => {
    open();
    type(/nama creator/i, "Rani Kusuma");
    type(/jenis kontrak/i, "regular");
    type(/fixed rate/i, "4500000");
    type(/jumlah konten/i, "8");
    type(/akhir kontrak/i, "2026-12-31");
    type(/username tiktok/i, "rani.tt");
    type(/username instagram/i, "");
    fireEvent.click(save());

    const dialog = screen.getByRole("alertdialog", { name: "Simpan perubahan data?" });
    for (const text of [
      "Salsa Amelia → Rani Kusuma",
      "@salsa.ig → Kosong",
      "Kosong → @rani.tt",
      "Probation → Regular",
      "Rp4.000.000 → Rp4.500.000",
      "15 Des 2026 → 31 Des 2026",
      "6 → 8",
    ]) {
      expect(within(dialog).getByText(text)).toBeInTheDocument();
    }
    expect(within(dialog).queryByText(/sesi yang sedang aktif/i)).not.toBeInTheDocument();
    expect(saveCreatorEdit).not.toHaveBeenCalled();
  });

  it("warns that a new email signs the creator out", () => {
    open();
    type(/^email/i, "rani@example.com");
    fireEvent.click(save());
    expect(
      within(screen.getByRole("alertdialog")).getByText(
        "Creator harus masuk dengan email baru. Sesi yang sedang aktif akan diakhiri.",
      ),
    ).toBeInTheDocument();
  });

  it("goes back to the form, as it was, from the confirmation", () => {
    open();
    type(/nama creator/i, "Rani");
    fireEvent.click(save());
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Kembali" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/nama creator/i)).toHaveValue("Rani");
    expect(saveCreatorEdit).not.toHaveBeenCalled();
  });

  it("saves just the changes, closes, says what happened and reloads the page", async () => {
    saveCreatorEdit.mockResolvedValue({ ok: true });
    open();
    type(/fixed rate/i, "4500000");
    await confirm();

    expect(saveCreatorEdit).toHaveBeenCalledExactlyOnceWith(CREATOR.id, {
      contractId: CONTRACT,
      fixedRate: 4_500_000,
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Data creator disimpan. Invoice Periode 2 dihitung ulang.",
    );
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("cannot be saved twice while saving", async () => {
    let finish: (result: SaveCreatorEditResult) => void = () => {};
    saveCreatorEdit.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    open();
    type(/nama creator/i, "Rani");
    await confirm();

    expect(screen.getByRole("button", { name: "Menyimpan…" })).toBeDisabled();
    await act(async () => finish({ ok: true }));
  });

  it("puts the server's message under its field and keeps what was typed", async () => {
    saveCreatorEdit.mockResolvedValue({
      ok: false,
      message: "Data creator tidak valid",
      errors: { email: "Email sudah terdaftar" },
    });
    open();
    type(/^email/i, "taken@example.com");
    await confirm();

    expect(screen.getByText("Email sudah terdaftar")).toBeInTheDocument();
    expect(screen.getByLabelText(/^email/i)).toHaveValue("taken@example.com");
    expect(refresh).not.toHaveBeenCalled();

    type(/^email/i, "free@example.com");
    expect(screen.queryByText("Email sudah terdaftar")).not.toBeInTheDocument();
  });

  it("shows a failure that belongs to no field as an alert", async () => {
    saveCreatorEdit.mockResolvedValue({
      ok: false,
      message: "Data creator sudah berubah. Muat ulang halaman lalu coba lagi.",
      errors: {},
    });
    open();
    type(/nama creator/i, "Rani");
    await confirm();

    expect(screen.getByRole("alert")).toHaveTextContent("Data creator sudah berubah");
  });

  it("closes at once when nothing changed, and asks first when something did", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ubah Data" }));
    type(/nama creator/i, "Rani");
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(screen.getByRole("alertdialog", { name: "Buang perubahan?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Buang" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("counts an email close to its limit out loud", () => {
    open();
    type(/^email/i, `${"a".repeat(250)}@b.co`.slice(0, 254));
    expect(screen.getByLabelText(/^email/i)).toHaveAttribute("aria-describedby");
  });
});
