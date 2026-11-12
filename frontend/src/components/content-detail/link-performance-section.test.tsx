import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PHONE_TARGET } from "@/components/ui/touch-target";
import type { LinkPerformance } from "@/lib/link-performance";
import type { ContentLink } from "@/lib/platform-links";
import { LinkPerformanceSection } from "./link-performance-section";

const CONTENT = "11111111-1111-1111-1111-111111111111";
const REEL = "https://www.instagram.com/reel/C9xYz/";
const VIDEO = "https://www.tiktok.com/@rani/video/7312345678901234567";

function measured(overrides: Partial<LinkPerformance> = {}): LinkPerformance {
  return {
    views: null,
    likes: null,
    comments: null,
    shares: null,
    state: "waiting",
    lastSyncedAt: null,
    manualAt: null,
    ...overrides,
  };
}

function link(platform: "instagram" | "tiktok", performance: LinkPerformance | null): ContentLink {
  return { platform, url: platform === "instagram" ? REEL : VIDEO, submittedAt: "2026-10-30", performance };
}

const SYNCED = link(
  "instagram",
  measured({ views: 12400, likes: 0, state: "synced", lastSyncedAt: "2026-11-01T19:00:00.000Z" }),
);
const NOT_CONNECTED = link("tiktok", measured({ state: "not_connected" }));

function show(
  links: ContentLink[],
  overrides: Partial<Parameters<typeof LinkPerformanceSection>[0]> = {},
) {
  const props = {
    contentId: CONTENT,
    links,
    role: "admin" as const,
    creatorFirstName: "Rani",
    save: vi.fn().mockResolvedValue({ ok: true }),
    sync: vi.fn().mockResolvedValue({ ok: true, toast: "Data performa diperbarui" }),
    onChanged: vi.fn(),
    ...overrides,
  };
  render(<LinkPerformanceSection {...props} />);
  return props;
}

function card(platform: "Instagram" | "TikTok") {
  return screen.getByRole("group", { name: `Performa ${platform}` });
}

describe("LinkPerformanceSection: the cards (PBI-27 AC 3, 19)", () => {
  it("shows one card per link with its platform, link, four numbers in Indonesian format and state", () => {
    show([SYNCED, NOT_CONNECTED]);

    const instagram = card("Instagram");
    expect(within(instagram).getByRole("link", { name: /instagram\.com\/reel\/C9xYz/ })).toHaveAttribute(
      "href",
      REEL,
    );
    expect(within(instagram).getByText("12.400")).toBeInTheDocument();
    expect(within(instagram).getByText("Views")).toBeInTheDocument();
    expect(within(instagram).getByText("Tersinkron")).toBeInTheDocument();
    expect(within(card("TikTok")).getByText("Akun belum terhubung")).toBeInTheDocument();
  });

  it("shows each link once, as a chip that opens it in a new tab, without printing the address again", () => {
    show([SYNCED]);

    const instagram = card("Instagram");
    expect(within(instagram).getByRole("link", { name: /instagram\.com\/reel\/C9xYz/ })).toHaveAttribute(
      "target",
      "_blank",
    );
    expect(within(instagram).queryByText(REEL)).toBeNull();
  });

  it("shows a real 0 as 0 and no data as a dash, never as 0 (AC 2)", () => {
    show([SYNCED]);

    const numbers = within(card("Instagram")).getAllByRole("definition").map((cell) => cell.textContent);
    expect(numbers).toEqual(["12.400", "0", "—", "—"]);
  });

  it("explains the state in its tip", () => {
    show([NOT_CONNECTED]);

    expect(within(card("TikTok")).getByRole("button", { name: "Tentang Akun belum terhubung" })).toHaveAccessibleDescription(
      "Rani belum menghubungkan akun ini.",
    );
  });

  it("lists a link with no platform without numbers, as before", () => {
    show([{ platform: null, url: "https://example.com/v", submittedAt: "2026-09-01", performance: null }]);

    expect(screen.getByRole("link", { name: /example\.com\/v/ })).toBeInTheDocument();
    expect(screen.queryByRole("definition")).toBeNull();
  });
});

describe("LinkPerformanceSection: Sinkronkan Sekarang (AC 12, 13)", () => {
  it("syncs every link of the content at once, disabled while it runs, then toasts and reloads", async () => {
    let finish: (value: { ok: true; toast: string }) => void = () => undefined;
    const sync = vi.fn(() => new Promise<{ ok: true; toast: string }>((resolve) => (finish = resolve)));
    const props = show([SYNCED], { sync });

    fireEvent.click(screen.getByRole("button", { name: "Sinkronkan Sekarang" }));

    const running = screen.getByRole("button", { name: "Menyinkronkan…" });
    expect(running).toBeDisabled();
    expect(sync).toHaveBeenCalledWith(CONTENT);

    finish({ ok: true, toast: "Sebagian link gagal disinkronkan" });
    expect(await screen.findByText("Sebagian link gagal disinkronkan")).toBeInTheDocument();
    expect(props.onChanged).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Sinkronkan Sekarang" })).toBeEnabled();
  });

  it("toasts the reason a sync did not run, and reloads nothing", async () => {
    const props = show([SYNCED], {
      sync: vi.fn().mockResolvedValue({ ok: false, message: "Sinkronisasi otomatis belum tersedia." }),
    });

    fireEvent.click(screen.getByRole("button", { name: "Sinkronkan Sekarang" }));

    expect(await screen.findByText("Sinkronisasi otomatis belum tersedia.")).toBeInTheDocument();
    expect(props.onChanged).not.toHaveBeenCalled();
  });

  // PBI-28 AC 13, as the prototype's "Link & Performa" puts it for a creator (review #160).
  it.each([
    ["reminds a creator", "creator", true],
    ["does not remind an admin", "admin", false],
  ] as const)("%s, above the cards, that the numbers lock at Finalize", (_, role, reminded) => {
    show([SYNCED, NOT_CONNECTED], { role });

    const note = screen.queryByRole("note");
    expect(note !== null).toBe(reminded);
    if (note) {
      expect(note).toHaveTextContent(
        "Angka performa dikunci saat invoice difinalisasi. Views yang masuk setelah itu tidak mengubah bonusmu.",
      );
      expect(note.compareDocumentPosition(card("Instagram")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("is not offered to a creator, who only reads the numbers (AC 20)", () => {
    show([SYNCED, NOT_CONNECTED], { role: "creator" });

    expect(screen.queryByRole("button", { name: "Sinkronkan Sekarang" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Isi Manual/ })).toBeNull();
    expect(within(card("Instagram")).getByText("12.400")).toBeInTheDocument();
  });
});

// SCRUM-282: a Refresh button on each card syncs only that card's link, like Sinkronkan Sekarang.
describe("LinkPerformanceSection: Refresh on each link card (SCRUM-282)", () => {
  it("syncs only that card's link, with every sync button disabled while it runs, then toasts and reloads", async () => {
    let finish: (value: { ok: true; toast: string }) => void = () => undefined;
    const syncLink = vi.fn(() => new Promise<{ ok: true; toast: string }>((resolve) => (finish = resolve)));
    const props = show([SYNCED, NOT_CONNECTED], { syncLink });

    fireEvent.click(within(card("TikTok")).getByRole("button", { name: "Sinkronkan TikTok" }));

    expect(syncLink).toHaveBeenCalledWith(CONTENT, "tiktok");
    expect(props.sync).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sinkronkan Sekarang" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sinkronkan Instagram" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sinkronkan TikTok" })).toBeDisabled();

    finish({ ok: true, toast: "Data performa TikTok diperbarui" });
    expect(await screen.findByText("Data performa TikTok diperbarui")).toBeInTheDocument();
    expect(props.onChanged).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Sinkronkan TikTok" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Sinkronkan Sekarang" })).toBeEnabled();
  });

  it("toasts the reason that link's sync did not run, and reloads nothing", async () => {
    const props = show([SYNCED], {
      syncLink: vi.fn().mockResolvedValue({ ok: false, message: "Konten ini sedang disinkronkan. Tunggu sebentar." }),
    });

    fireEvent.click(screen.getByRole("button", { name: "Sinkronkan Instagram" }));

    expect(await screen.findByText("Konten ini sedang disinkronkan. Tunggu sebentar.")).toBeInTheDocument();
    expect(props.onChanged).not.toHaveBeenCalled();
  });

  it("keeps every card's Refresh disabled while Sinkronkan Sekarang runs", () => {
    show([SYNCED, NOT_CONNECTED], { sync: vi.fn(() => new Promise<{ ok: true; toast: string }>(() => undefined)) });

    fireEvent.click(screen.getByRole("button", { name: "Sinkronkan Sekarang" }));

    expect(screen.getByRole("button", { name: "Sinkronkan Instagram" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sinkronkan TikTok" })).toBeDisabled();
  });

  it("is not offered to a creator, who only reads the numbers (AC 20)", () => {
    show([SYNCED, NOT_CONNECTED], { role: "creator" });

    expect(screen.queryByRole("button", { name: /^Sinkronkan (Instagram|TikTok)$/ })).toBeNull();
  });

  // Button already makes it 44px tall on a phone; the icon alone leaves it narrow, so it widens too.
  it("is at least 44px wide on a phone, as Button makes it tall", () => {
    show([SYNCED]);

    expect(screen.getByRole("button", { name: "Sinkronkan Instagram" })).toHaveClass("max-sm:min-w-11", PHONE_TARGET);
  });
});

describe("LinkPerformanceSection: manual input (AC 14-18)", () => {
  it("offers Isi Manual only on a link the platform cannot read", () => {
    show([SYNCED, NOT_CONNECTED]);

    expect(within(card("Instagram")).queryByRole("button", { name: "Isi Manual" })).toBeNull();
    expect(within(card("TikTok")).getByRole("button", { name: "Isi Manual" })).toBeInTheDocument();
  });

  it("opens four fields inline in the card, starting from the numbers it has", () => {
    show([link("tiktok", measured({ state: "sync_failed", views: 900 }))]);

    fireEvent.click(screen.getByRole("button", { name: "Isi Manual" }));

    const form = within(card("TikTok"));
    expect(form.getByRole("textbox", { name: "Views" })).toHaveValue("900");
    expect(form.getByRole("textbox", { name: "Likes" })).toHaveValue("");
    expect(form.getByText(/Kolom kosong tetap "belum ada data", bukan 0/)).toBeInTheDocument();
  });

  it("puts each refused field's message under it, and asks nothing yet", () => {
    const props = show([NOT_CONNECTED]);
    fireEvent.click(screen.getByRole("button", { name: "Isi Manual" }));

    fireEvent.change(screen.getByRole("textbox", { name: "Views" }), { target: { value: "1000000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));

    expect(screen.getByRole("textbox", { name: "Views" })).toHaveAccessibleDescription(
      "Isi bilangan bulat 0 sampai 999.999.999",
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(props.save).not.toHaveBeenCalled();
  });

  it("asks for at least one number", () => {
    show([NOT_CONNECTED]);
    fireEvent.click(screen.getByRole("button", { name: "Isi Manual" }));

    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));

    expect(screen.getByText("Isi minimal satu angka")).toBeInTheDocument();
  });

  it("confirms, saves, toasts and reloads (AC 16)", async () => {
    const props = show([NOT_CONNECTED]);
    fireEvent.click(screen.getByRole("button", { name: "Isi Manual" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Views" }), { target: { value: "12400" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Shares" }), { target: { value: "7" } });

    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    const dialog = screen.getByRole("alertdialog", { name: "Simpan Angka Manual?" });
    expect(within(dialog).getByText(/Angka TikTok untuk konten ini disimpan sebagai "Diisi manual"/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));

    await waitFor(() =>
      expect(props.save).toHaveBeenCalledWith(CONTENT, "tiktok", {
        views: 12400,
        likes: null,
        comments: null,
        shares: 7,
      }),
    );
    expect(await screen.findByText("Angka performa disimpan.")).toBeInTheDocument();
    expect(props.onChanged).toHaveBeenCalledOnce();
    expect(screen.queryByRole("textbox", { name: "Views" })).toBeNull();
  });

  it("keeps the form and says why when the invoice was finalized meanwhile (AC 18)", async () => {
    show([NOT_CONNECTED], {
      save: vi.fn().mockResolvedValue({
        ok: false,
        code: "INVOICE_FINALIZED",
        message: "Invoice sudah difinalisasi. Koreksi lewat penyesuaian.",
      }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Isi Manual" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Views" }), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Simpan" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invoice sudah difinalisasi. Koreksi lewat penyesuaian.",
    );
    expect(screen.getByRole("textbox", { name: "Views" })).toHaveValue("1");
  });

  it("puts the API's field messages under the fields", async () => {
    show([NOT_CONNECTED], {
      save: vi.fn().mockResolvedValue({
        ok: false,
        message: "Angka performa tidak valid",
        errors: { likes: "Isi bilangan bulat 0 sampai 999.999.999" },
      }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Isi Manual" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Views" }), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Simpan" }));

    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Likes" })).toHaveAccessibleDescription(
        "Isi bilangan bulat 0 sampai 999.999.999",
      ),
    );
  });

  it("goes back to the form, as typed, when the confirmation is cancelled", () => {
    const props = show([NOT_CONNECTED]);
    fireEvent.click(screen.getByRole("button", { name: "Isi Manual" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Views" }), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));

    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Batal" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Views" })).toHaveValue("5");
    expect(props.save).not.toHaveBeenCalled();
  });

  it("closes the form on Batal without saving", () => {
    const props = show([NOT_CONNECTED]);
    fireEvent.click(screen.getByRole("button", { name: "Isi Manual" }));

    fireEvent.click(screen.getByRole("button", { name: "Batal" }));

    expect(screen.queryByRole("textbox", { name: "Views" })).toBeNull();
    expect(props.save).not.toHaveBeenCalled();
  });
});
