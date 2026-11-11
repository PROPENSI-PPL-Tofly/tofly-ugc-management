import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ContentDetail } from "@/lib/content-detail";
import type { ContentManagePorts } from "@/lib/content-edit";
import { DecisionError } from "@/lib/decisions";
import { ContentDetailPanel, DECISION_CONFIRMATIONS, type Decision } from "./content-detail-panel";

// PBI-25 (25.2): Ubah and Hapus in the admin's Content Detail panel.

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const CONTENT = "11111111-1111-4111-8111-111111111111";
const WINDOW = { earliestDeadline: "2026-11-10", latestDeadline: "2026-12-26" };

function scheduled(overrides: Partial<ContentDetail> = {}): ContentDetail {
  return {
    id: CONTENT,
    name: "Promo Lebaran",
    type: "specific",
    brief: "Tunjukkan fitur kirim kilat.",
    deadline: "2026-11-20",
    status: "scheduled",
    creatorName: "Rangga Pratama",
    tags: [],
    waitingOn: "creator",
    latestSubmissionId: null,
    creatorActions: [],
    links: [],
    events: [
      {
        id: `${CONTENT}:scheduled`,
        type: "scheduled",
        at: "2026-11-01T03:00:00.000Z",
        actor: { name: null, role: "admin" },
      },
    ],
    edit: WINDOW,
    ...overrides,
  };
}

function evergreen(overrides: Partial<ContentDetail> = {}): ContentDetail {
  return scheduled({ type: "evergreen", name: "Evg_3_Rangga Pratama_20112026", brief: "", ...overrides });
}

function open(
  first: ContentDetail,
  options: {
    role?: "admin" | "creator";
    manage?: Partial<ContentManagePorts>;
    then?: ContentDetail;
    onDecided?: (decision: Decision) => void;
    onEdited?: () => void;
  } = {},
) {
  const load = vi.fn().mockResolvedValueOnce(first).mockResolvedValue(options.then ?? first);
  const update = vi.fn().mockResolvedValue({ ok: true });
  const remove = vi.fn().mockResolvedValue(undefined);
  const onDecided = options.onDecided ?? vi.fn();

  render(
    <ContentDetailPanel
      contentId={CONTENT}
      role={options.role ?? "admin"}
      onClose={vi.fn()}
      load={load}
      onDecided={onDecided}
      {...(options.onEdited && { onEdited: options.onEdited })}
      manage={{ update, remove, ...options.manage }}
    />,
  );

  return { load, update, remove, onDecided };
}

async function startEdit() {
  fireEvent.click(await screen.findByRole("button", { name: "Ubah konten" }));
  return screen.getByRole("form", { name: "Ubah konten" });
}

function confirmDialog() {
  return screen.getByRole("alertdialog");
}

beforeEach(() => {
  vi.clearAllMocks();
});

// Ubah and Hapus sit in the panel's header as a pencil and a bin, one press each, rather than
// behind a "⋯" menu.
describe("Ubah and Hapus visibility (AC 1, 9)", () => {
  it("offers Ubah and Hapus as icons in the header for Scheduled content with no draft", async () => {
    open(scheduled());

    const ubah = await screen.findByRole("button", { name: "Ubah konten" });
    const hapus = screen.getByRole("button", { name: "Hapus konten" });
    expect(ubah.querySelector("svg")).not.toBeNull();
    expect(hapus.querySelector("svg")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Aksi lain" })).toBeNull();
    // In the header, beside the title, not with the step's buttons in the foot.
    const header = screen.getByRole("heading", { name: "Promo Lebaran" }).closest("header, div") as HTMLElement;
    expect(header.parentElement).toContainElement(ubah);
  });

  it("offers neither once the API closed the edit window: a draft, another status or a finalized invoice", async () => {
    open(scheduled({ edit: null }));

    await screen.findByText("Promo Lebaran");
    expect(screen.queryByRole("button", { name: "Ubah konten" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Hapus konten" })).toBeNull();
  });

  it("offers neither to a creator, whatever the payload says", async () => {
    open(scheduled(), { role: "creator" });

    await screen.findByText("Promo Lebaran");
    expect(screen.queryByRole("button", { name: "Ubah konten" })).toBeNull();
  });

  it("offers neither on a payload from before 25.2, which has no edit window", async () => {
    const old = scheduled();
    delete (old as Partial<ContentDetail>).edit;
    open(old);

    await screen.findByText("Promo Lebaran");
    expect(screen.queryByRole("button", { name: "Hapus konten" })).toBeNull();
  });
});

describe("the inline edit form (AC 2, 3)", () => {
  it("opens inside the panel, not as a dialog over it, filled with the content as it is", async () => {
    open(scheduled());

    const form = await startEdit();

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(within(form).getByLabelText(/Nama Konten/)).toHaveValue("Promo Lebaran");
    expect(within(form).getByLabelText(/Brief/)).toHaveValue("Tunjukkan fitur kirim kilat.");
    expect(within(form).getByLabelText(/Deadline/)).toHaveValue("2026-11-20");
  });

  it("holds the date picker to the earliest day and the H-5 day the API allows (AC 3)", async () => {
    open(scheduled());

    const deadline = within(await startEdit()).getByLabelText(/Deadline/);

    expect(deadline).toHaveAttribute("min", "2026-11-10");
    expect(deadline).toHaveAttribute("max", "2026-12-26");
  });

  it("uses the same limits as Tambah Konten", async () => {
    open(scheduled());

    const form = await startEdit();

    expect(within(form).getByLabelText(/Nama Konten/)).toHaveAttribute("maxLength", "100");
    expect(within(form).getByLabelText(/Brief/)).toHaveAttribute("maxLength", "2000");
  });

  it("has no name field for an Evergreen item, whose name the app writes", async () => {
    open(evergreen());

    const form = await startEdit();

    expect(within(form).queryByLabelText(/Nama Konten/)).toBeNull();
    expect(within(form).getByLabelText(/Brief/)).toBeInTheDocument();
  });

  it("keeps Simpan unavailable until something changes", async () => {
    open(scheduled());

    const form = await startEdit();
    const save = within(form).getByRole("button", { name: "Simpan" });
    expect(save).toBeDisabled();

    fireEvent.change(within(form).getByLabelText(/Brief/), { target: { value: "Brief baru." } });
    expect(save).toBeEnabled();
  });

  it("names a deadline past H-5 and keeps Simpan unavailable", async () => {
    open(scheduled());

    const form = await startEdit();
    fireEvent.change(within(form).getByLabelText(/Deadline/), { target: { value: "2026-12-27" } });

    expect(within(form).getByText("Deadline paling lambat 26 Des 2026 (H-5 akhir kontrak)")).toBeInTheDocument();
    expect(within(form).getByRole("button", { name: "Simpan" })).toBeDisabled();
  });

  it("names an emptied name once the field is left", async () => {
    open(scheduled());

    const form = await startEdit();
    const name = within(form).getByLabelText(/Nama Konten/);
    fireEvent.change(name, { target: { value: " " } });
    fireEvent.blur(name);

    expect(within(form).getByText("Nama konten wajib diisi")).toBeInTheDocument();
  });

  it("names an emptied brief on a Specific item once the field is left", async () => {
    open(scheduled());

    const form = await startEdit();
    const brief = within(form).getByLabelText(/Brief/);
    fireEvent.change(brief, { target: { value: "" } });
    fireEvent.blur(brief);

    expect(within(form).getByText("Brief wajib diisi")).toBeInTheDocument();
  });

  it("asks nothing when the form is sent with nothing changed", async () => {
    open(scheduled());

    fireEvent.submit(await startEdit());

    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("goes back to the panel as it was on Batal, sending nothing", async () => {
    const { update } = open(scheduled());

    const form = await startEdit();
    fireEvent.change(within(form).getByLabelText(/Brief/), { target: { value: "Brief baru." } });
    fireEvent.click(within(form).getByRole("button", { name: "Batal" }));

    expect(screen.queryByRole("form", { name: "Ubah konten" })).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
});

describe("saving an edit (AC 4, 5)", () => {
  async function editDeadline(to: string) {
    const form = await startEdit();
    fireEvent.change(within(form).getByLabelText(/Deadline/), { target: { value: to } });
    fireEvent.click(within(form).getByRole("button", { name: "Simpan" }));
    return form;
  }

  it("asks first, showing the old and the new deadline (AC 4)", async () => {
    const { update } = open(scheduled());

    await editDeadline("2026-11-25");

    const dialog = confirmDialog();
    expect(within(dialog).getByText("Simpan Perubahan Konten?")).toBeInTheDocument();
    expect(within(dialog).getByText("Rangga langsung melihat perubahan ini di Tugas Saya.")).toBeInTheDocument();
    expect(within(dialog).getByText("20 Nov 2026 → 25 Nov 2026")).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it("sends nothing when the confirmation is cancelled, and keeps what was typed", async () => {
    const { update } = open(scheduled());

    const form = await editDeadline("2026-11-25");
    fireEvent.click(within(confirmDialog()).getByRole("button", { name: "Batal" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(update).not.toHaveBeenCalled();
    expect(within(form).getByLabelText(/Deadline/)).toHaveValue("2026-11-25");
  });

  it("saves every field the form shows, confirms with Konten diperbarui and reads the content again (AC 4, 5)", async () => {
    const { update, load, onDecided } = open(scheduled(), {
      then: scheduled({ deadline: "2026-11-25" }),
    });

    await editDeadline("2026-11-25");
    fireEvent.click(within(confirmDialog()).getByRole("button", { name: "Simpan" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Konten diperbarui");
    expect(update).toHaveBeenCalledWith(CONTENT, {
      name: "Promo Lebaran",
      brief: "Tunjukkan fitur kirim kilat.",
      deadline: "2026-11-25",
    });
    expect(refresh).toHaveBeenCalled();
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("form", { name: "Ubah konten" })).toBeNull();
    // The panel stays on the content: an edit is not a decision that closes it.
    expect(onDecided).not.toHaveBeenCalled();
  });

  it("tells the touchpoint about a saved edit, so a list it holds itself can be read again", async () => {
    const onEdited = vi.fn();
    open(scheduled(), { onEdited });

    await editDeadline("2026-11-25");
    fireEvent.click(within(confirmDialog()).getByRole("button", { name: "Simpan" }));

    await screen.findByRole("status");
    expect(onEdited).toHaveBeenCalledTimes(1);
  });

  it("puts the API's field errors back on their fields", async () => {
    open(scheduled(), {
      manage: {
        update: vi.fn().mockResolvedValue({
          ok: false,
          status: 422,
          message: "Data konten tidak valid",
          errors: { deadline: "Deadline paling cepat 12 Nov 2026" },
        }),
      },
    });

    const form = await editDeadline("2026-11-11");
    fireEvent.click(within(confirmDialog()).getByRole("button", { name: "Simpan" }));

    expect(await within(form).findByText("Deadline paling cepat 12 Nov 2026")).toBeInTheDocument();
  });

  it("drops the API's error on a field once that field changes, and only then", async () => {
    open(scheduled(), {
      manage: {
        update: vi.fn().mockResolvedValue({
          ok: false,
          status: 422,
          message: "Data konten tidak valid",
          errors: { deadline: "Deadline paling cepat 12 Nov 2026" },
        }),
      },
    });

    const form = await editDeadline("2026-11-11");
    fireEvent.click(within(confirmDialog()).getByRole("button", { name: "Simpan" }));
    await within(form).findByText("Deadline paling cepat 12 Nov 2026");

    fireEvent.change(within(form).getByLabelText(/Brief/), { target: { value: "Brief baru." } });
    expect(within(form).getByText("Deadline paling cepat 12 Nov 2026")).toBeInTheDocument();

    fireEvent.change(within(form).getByLabelText(/Deadline/), { target: { value: "2026-11-12" } });
    expect(within(form).queryByText("Deadline paling cepat 12 Nov 2026")).toBeNull();
  });

  it("closes the form and reads the content again after a 409, showing why", async () => {
    const { load } = open(scheduled(), {
      then: scheduled({ status: "draft_review", edit: null }),
      manage: {
        update: vi.fn().mockResolvedValue({
          ok: false,
          status: 409,
          message: "Konten hanya bisa diubah atau dihapus selama berstatus Scheduled dan belum ada draft",
          errors: {},
        }),
      },
    });

    await editDeadline("2026-11-25");
    fireEvent.click(within(confirmDialog()).getByRole("button", { name: "Simpan" }));

    expect(
      await screen.findByText(
        "Konten hanya bisa diubah atau dihapus selama berstatus Scheduled dan belum ada draft",
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("form", { name: "Ubah konten" })).toBeNull();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Ubah konten" })).toBeNull());
  });

  it("keeps the form open with the reason when the save fails for another reason", async () => {
    open(scheduled(), {
      manage: {
        update: vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          message: "Konten gagal disimpan. Coba lagi.",
          errors: {},
        }),
      },
    });

    const form = await editDeadline("2026-11-25");
    fireEvent.click(within(confirmDialog()).getByRole("button", { name: "Simpan" }));

    expect(await within(form).findByRole("alert")).toHaveTextContent("Konten gagal disimpan. Coba lagi.");
  });
});

describe("deleting (AC 6, 7, 8)", () => {
  async function askDelete() {
    fireEvent.click(await screen.findByRole("button", { name: "Hapus konten" }));
    return confirmDialog();
  }

  it("asks first: Konten ini akan dihapus permanen. (AC 6)", async () => {
    open(scheduled());

    const dialog = await askDelete();

    expect(within(dialog).getByText("Hapus Konten Ini?")).toBeInTheDocument();
    expect(within(dialog).getByText("Konten ini akan dihapus permanen.")).toBeInTheDocument();
  });

  it("warns about the Evergreen quota when the item is Evergreen (AC 7)", async () => {
    open(evergreen());

    const dialog = await askDelete();

    expect(
      within(dialog).getByText(
        "Konten ini akan dihapus permanen. Kuota Evergreen jadi kurang 1. Jadwalkan ulang lewat Tambah Konten kalau perlu.",
      ),
    ).toBeInTheDocument();
  });

  it("deletes nothing when cancelled", async () => {
    const { remove } = open(scheduled());

    fireEvent.click(within(await askDelete()).getByRole("button", { name: "Batal" }));

    expect(remove).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("deletes the content and reports it upward, so the touchpoint closes the panel and refreshes (AC 8)", async () => {
    const { remove, onDecided } = open(scheduled());

    fireEvent.click(within(await askDelete()).getByRole("button", { name: "Hapus" }));

    await waitFor(() => expect(onDecided).toHaveBeenCalledWith("delete_content"));
    expect(remove).toHaveBeenCalledWith(CONTENT);
    expect(refresh).toHaveBeenCalled();
    // What every admin touchpoint toasts once it has closed the panel.
    expect(DECISION_CONFIRMATIONS.delete_content).toBe("Konten dihapus.");
  });

  it("stays on the content with the reason when the delete is refused, and reads it again", async () => {
    const { load, onDecided } = open(scheduled(), {
      then: scheduled({ edit: null }),
      manage: {
        remove: vi
          .fn()
          .mockRejectedValue(
            new DecisionError(409, "Invoice sudah difinalisasi. Konten tidak bisa diubah atau dihapus lagi"),
          ),
      },
    });

    fireEvent.click(within(await askDelete()).getByRole("button", { name: "Hapus" }));

    expect(
      await screen.findByText("Invoice sudah difinalisasi. Konten tidak bisa diubah atau dihapus lagi"),
    ).toBeInTheDocument();
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(onDecided).not.toHaveBeenCalled();
  });
});

describe("the timeline", () => {
  it("shows an admin's edit with what changed (AC 4)", async () => {
    open(
      scheduled({
        events: [
          {
            id: "edit",
            type: "content_updated",
            at: "2026-11-05T03:00:00.000Z",
            actor: { name: null, role: "admin" },
            payload: { changes: { deadline: { from: "2026-11-20", to: "2026-11-25" } } },
          },
          ...scheduled().events,
        ],
      }),
    );

    expect(await screen.findByText("Konten diubah")).toBeInTheDocument();
    expect(screen.getByText("Deadline 20 Nov 2026 → 25 Nov 2026")).toBeInTheDocument();
  });
});
