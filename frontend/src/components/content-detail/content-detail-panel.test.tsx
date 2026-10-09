import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { ContentDetailError, type ContentDetail } from "@/lib/content-detail";
import type { PanelActionPorts } from "@/lib/panel-actions";
import { ContentDetailPanel } from "./content-detail-panel";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const CONTENT = "11111111-1111-1111-1111-111111111111";
const SUBMISSION = "22222222-2222-2222-2222-222222222222";

function detail(overrides: Partial<ContentDetail> = {}): ContentDetail {
  return {
    id: CONTENT,
    name: "Promo Lebaran",
    type: "specific",
    brief: "Tunjukkan fitur cashback.",
    deadline: "2026-10-05",
    status: "draft_review",
    creatorName: "Rangga Pratama",
    tags: { overdue: false, lateSubmission: false, approvalBypassed: false },
    waitingOn: "admin",
    latestSubmissionId: SUBMISSION,
    creatorActions: [],
    events: [
      {
        id: "sub-2",
        type: "draft_submitted",
        at: "2026-09-20T10:00:00.000Z",
        actor: { name: "Rangga Pratama", role: "creator" },
        payload: { version: 2, link: "https://drive.google.com/draft-v2" },
      },
      {
        id: `${CONTENT}:scheduled`,
        type: "scheduled",
        at: "2026-09-01T03:00:00.000Z",
        actor: { name: null, role: "admin" },
      },
    ],
    ...overrides,
  };
}

function open(
  loaded: ContentDetail | Promise<ContentDetail>,
  props: Partial<{
    role: "admin" | "creator";
    ports: PanelActionPorts;
    actions: ReactNode;
    onDecided: () => void;
  }> = {},
) {
  const load = vi.fn().mockResolvedValue(loaded);
  const onClose = vi.fn();

  render(
    <ContentDetailPanel
      contentId={CONTENT}
      role={props.role ?? "admin"}
      onClose={onClose}
      load={load}
      {...(props.ports && { ports: props.ports })}
      {...(props.actions && { actions: props.actions })}
      {...(props.onDecided && { onDecided: props.onDecided })}
    />,
  );

  return { load, onClose };
}

describe("ContentDetailPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks for the content it was opened by and shows the loading line meanwhile", async () => {
    let resolve!: (detail: ContentDetail) => void;
    const pending = new Promise<ContentDetail>((r) => {
      resolve = r;
    });

    open(pending);

    expect(await screen.findByText("Memuat konten...")).toBeInTheDocument();

    resolve(detail());
    await screen.findByText("Promo Lebaran");
  });

  it("renders the header with type, status, deadline and the D-n countdown beside them", async () => {
    open(detail());

    expect(await screen.findByText("Rangga Pratama")).toBeInTheDocument();
    expect(screen.getByText("Draft Menunggu Review")).toBeInTheDocument();
    expect(screen.getByText("Brief")).toBeInTheDocument();
    expect(screen.getByText(/H-\d+|Hari ini|Lewat \d+ hari/)).toBeInTheDocument();
  });

  it("draws the Overdue tag beside the status, never as the status", async () => {
    open(
      detail({
        status: "draft_revision",
        tags: { overdue: true, lateSubmission: false, approvalBypassed: false },
      }),
    );

    expect(await screen.findByText("Overdue")).toBeInTheDocument();
    expect(screen.getByText("Draft Perlu Revisi")).toBeInTheDocument();
  });

  it("shows the step waiting on the admin with Approve and Minta Revisi for an admin", async () => {
    open(detail());

    expect(await screen.findByText("Menunggu Admin")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Minta Revisi" })).toBeInTheDocument();
  });

  it("shows an admin nothing to do while the step waits on the creator", async () => {
    open(detail({ waitingOn: "creator", status: "scheduled", latestSubmissionId: null }));

    expect(await screen.findByText("Menunggu kreator")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("keeps Kirim disabled while the note is empty or only spaces, and opens it after real text", async () => {
    open(detail());

    fireEvent.click(await screen.findByRole("button", { name: "Minta Revisi" }));
    const kirim = screen.getByRole("button", { name: "Kirim Revisi" });
    const note = screen.getByRole("textbox");

    expect(kirim).toBeDisabled();

    fireEvent.change(note, { target: { value: "   " } });
    expect(kirim).toBeDisabled();

    fireEvent.change(note, { target: { value: "Audio terlalu pelan." } });
    expect(kirim).toBeEnabled();
  });

  it("sends the trimmed note and reports the decision upward", async () => {
    const revise = vi.fn().mockResolvedValue(undefined);
    const onDecided = vi.fn();
    open(detail(), { ports: { revise }, onDecided });

    fireEvent.click(await screen.findByRole("button", { name: "Minta Revisi" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "  Audio terlalu pelan.  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Kirim Revisi" }));

    await waitFor(() => {
      expect(revise).toHaveBeenCalledWith(SUBMISSION, "Audio terlalu pelan.");
      expect(onDecided).toHaveBeenCalled();
    });
  });

  it("keeps the panel open with the backend's reason when a decision fails", async () => {
    const revise = vi
      .fn()
      .mockRejectedValue(new Error("Draft ini sudah tidak menunggu keputusan"));
    const onDecided = vi.fn();
    open(detail(), { ports: { revise }, onDecided });

    fireEvent.click(await screen.findByRole("button", { name: "Minta Revisi" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Audio terlalu pelan." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Kirim Revisi" }));

    expect(
      await screen.findByText("Draft ini sudah tidak menunggu keputusan"),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("Audio terlalu pelan.");
    expect(onDecided).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("approves the latest hand-in through its command", async () => {
    const approve = vi.fn().mockResolvedValue(undefined);
    const onDecided = vi.fn();
    open(detail(), { ports: { approve }, onDecided });

    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));

    await waitFor(() => {
      expect(approve).toHaveBeenCalledWith(SUBMISSION);
      expect(refresh).toHaveBeenCalled();
      expect(onDecided).toHaveBeenCalled();
    });
  });

  it("shows a creator their own next step instead of the review buttons", async () => {
    const onCreatorAction = vi.fn();
    open(
      detail({
        waitingOn: "creator",
        status: "draft_review",
        latestSubmissionId: null,
        creatorActions: ["submit_video"],
      }),
      { role: "creator", ports: { onCreatorAction } },
    );

    const button = await screen.findByRole("button", { name: "Submit Link (H-1)" });
    fireEvent.click(button);

    expect(onCreatorAction).toHaveBeenCalledWith("submit_video");
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("renders an injected action list instead of its own commands", async () => {
    open(detail(), { actions: <button type="button">Tinjau pengajuan</button> });

    expect(await screen.findByRole("button", { name: "Tinjau pengajuan" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("reads a 404 as content that does not exist, not as a failure", async () => {
    open(Promise.reject(new ContentDetailError(404)));

    expect(await screen.findByText("Konten tidak ditemukan.")).toBeInTheDocument();
  });

  it("reads any other failure as something to retry", async () => {
    open(Promise.reject(new ContentDetailError(500)));

    expect(
      await screen.findByText("Detail konten gagal dimuat"),
    ).toBeInTheDocument();
  });

  it("lists the journey newest first with each draft's version", async () => {
    open(detail());

    const journey = await screen.findByLabelText("Riwayat konten");
    const entries = journey.querySelectorAll("li");

    expect(entries[0]).toHaveTextContent("Draft v2 dikirim");
    expect(entries[1]).toHaveTextContent("Ditambahkan Admin");
  });

  it("names every event kind, counts a missing version, and shows an unusable link as inert text", async () => {
    open(
      detail({
        events: [
          {
            id: "sub-2",
            type: "draft_submitted",
            at: "2026-09-20T10:00:00.000Z",
            actor: { name: "Rangga Pratama", role: "creator" },
          },
          {
            id: "sub-2:revision",
            type: "revision_requested",
            at: "2026-09-19T10:00:00.000Z",
            actor: { name: null, role: "admin" },
            payload: { note: "Perbaiki bagian intro." },
          },
          {
            id: `${CONTENT}:approved`,
            type: "draft_approved",
            at: "2026-09-21T10:00:00.000Z",
            actor: { name: null, role: "admin" },
          },
          {
            id: `${CONTENT}:link`,
            type: "link_submitted",
            at: "2026-09-22T10:00:00.000Z",
            actor: { name: "Rangga Pratama", role: "creator" },
            payload: { link: "javascript:alert(1)" },
          },
        ],
      }),
    );

    const journey = await screen.findByLabelText("Riwayat konten");
    expect(journey).toHaveTextContent("Draft v1 dikirim");
    expect(journey).toHaveTextContent("Revisi ke-1 diminta");
    expect(journey).toHaveTextContent("Perbaiki bagian intro.");
    expect(journey).toHaveTextContent("Draft di-approve");
    expect(journey).toHaveTextContent("Link video dikirim");
    expect(journey).toHaveTextContent(
      "Link ini bukan link web yang valid, jadi tidak bisa dibuka.",
    );
    expect(within(journey).queryByRole("link")).toBeNull();
  });

  it("leaves out a missing creator name and an empty brief, and shows every tag pill", async () => {
    open(
      detail({
        type: "specific",
        creatorName: "",
        brief: "",
        tags: { overdue: true, lateSubmission: true, approvalBypassed: true },
      }),
    );

    await screen.findByText("Draft Menunggu Review");
    // Neither gets a placeholder: the breadcrumb and the Brief section are simply not there.
    expect(screen.queryByText("—")).not.toBeInTheDocument();
    expect(screen.queryByText("Brief")).not.toBeInTheDocument();
    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.getByText("Late Submission")).toBeInTheDocument();
    expect(screen.getByText("Approval di-bypass")).toBeInTheDocument();
  });

  it("reads a load that fails without a status as a plain failure", async () => {
    open(Promise.reject(new Error("gateway exploded")));

    expect(
      await screen.findByText("Detail konten gagal dimuat"),
    ).toBeInTheDocument();
  });

  it("stops caring about a load that settles after the panel was closed", async () => {
    let resolve!: (detail: ContentDetail) => void;
    const pending = new Promise<ContentDetail>((r) => {
      resolve = r;
    });

    const { unmount } = render(
      <ContentDetailPanel
        contentId={CONTENT}
        role="admin"
        onClose={vi.fn()}
        load={() => pending}
      />,
    );

    expect(await screen.findByText("Memuat konten...")).toBeInTheDocument();

    unmount();
    resolve(detail());

    await waitFor(() => {
      expect(screen.queryByText("Promo Lebaran")).not.toBeInTheDocument();
    });
  });

  it("stops caring about a load that fails after the panel was closed", async () => {
    let reject!: (reason: unknown) => void;
    const pending = new Promise<ContentDetail>((_, r) => {
      reject = r;
    });

    const { unmount } = render(
      <ContentDetailPanel
        contentId={CONTENT}
        role="admin"
        onClose={vi.fn()}
        load={() => pending}
      />,
    );

    expect(await screen.findByText("Memuat konten...")).toBeInTheDocument();

    unmount();
    reject(new Error("too late"));

    await waitFor(() => {
      expect(screen.queryByText("Detail konten gagal dimuat")).not.toBeInTheDocument();
    });
  });

  it("keeps the panel open and shows the reason when Approve is refused", async () => {
    const approve = vi
      .fn()
      .mockRejectedValue(new Error("Draft ini sudah tidak menunggu keputusan"));
    const onDecided = vi.fn();
    open(detail(), { ports: { approve }, onDecided });

    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));

    expect(
      await screen.findByText("Draft ini sudah tidak menunggu keputusan"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(onDecided).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("answers a decision that fails without an Error with its own generic message", async () => {
    const approve = vi.fn().mockRejectedValue("not even an error");
    open(detail(), { ports: { approve } });

    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));

    expect(await screen.findByText("Terjadi kesalahan. Coba lagi.")).toBeInTheDocument();
  });
});

// Subtask 6.5: the panel as a side sheet with a worded, vertical timeline. Rendered through its
// own helper so a test can pin "today", close the panel, or re-render it.
describe("ContentDetailPanel as the content's side sheet (6.5)", () => {
  /** Midday in Jakarta on 2 Oct 2026, three days before the fixture's deadline. */
  const NOW = new Date("2026-10-02T05:00:00Z");

  type Loader = NonNullable<Parameters<typeof ContentDetailPanel>[0]["load"]>;

  function show(overrides: Partial<ContentDetail> = {}, load?: Loader) {
    const loader = load ?? vi.fn<Loader>().mockResolvedValue(detail(overrides));
    const onClose = vi.fn();
    const utils = render(
      <ContentDetailPanel contentId={CONTENT} role="admin" onClose={onClose} load={loader} now={NOW} />,
    );
    return { ...utils, load: loader, onClose };
  }

  async function journeyItems() {
    const journey = await screen.findByLabelText("Riwayat konten");
    return within(journey).getAllByRole("listitem");
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("header", () => {
    it("opens docked to the right edge, titled with the content name", async () => {
      show();

      const dialog = await screen.findByRole("dialog", { name: "Promo Lebaran" });
      expect(dialog).toHaveClass("h-full", "max-w-[520px]");
    });

    it("names the creator above the title, and nothing when the name is unknown", async () => {
      const { unmount } = show();
      expect(await screen.findByTestId("modal-eyebrow")).toHaveTextContent("Rangga Pratama");
      unmount();

      show({ creatorName: "" });
      await screen.findByRole("dialog", { name: "Promo Lebaran" });
      expect(screen.queryByTestId("modal-eyebrow")).not.toBeInTheDocument();
    });

    it("keeps type and status as dots, so the tag pills beside them stand out", async () => {
      show({ tags: { overdue: true, lateSubmission: false, approvalBypassed: true } });

      const meta = await screen.findByTestId("modal-meta");
      const status = within(meta).getByText("Draft Menunggu Review");

      expect(within(meta).getByText("Specific")).not.toHaveClass("rounded-full");
      expect(status).not.toHaveClass("rounded-full");
      expect(status.querySelector(".bg-accent")).not.toBeNull();
      expect(within(meta).getByText("Overdue")).toHaveClass("rounded-full", "bg-red-wash");
      expect(within(meta).getByText("Approval di-bypass")).toHaveClass("rounded-full", "bg-amber-wash");
    });

    it("shows the deadline as a date with its countdown", async () => {
      show();

      const meta = await screen.findByTestId("modal-meta");
      expect(meta).toHaveTextContent("Deadline 5 Okt 2026");
      expect(within(meta).getByTestId("deadline-due")).toHaveTextContent("H-3");
    });

    it.each([
      ["2026-09-30", "Lewat 2 hari", "text-red-ink"],
      ["2026-10-01", "Lewat 1 hari", "text-red-ink"],
      ["2026-10-02", "Hari ini", "text-amber-ink"],
      ["2026-10-03", "H-1", "text-amber-ink"],
    ])("warns about a %s deadline: %s in %s", async (deadline, label, tone) => {
      show({ deadline });

      const due = await screen.findByTestId("deadline-due");
      expect(due).toHaveTextContent(label);
      expect(due).toHaveClass(tone);
    });

    it.each([
      ["two days away", "2026-10-04", "H-2"],
      ["that cannot be read", "segera", "—"],
    ])("leaves a deadline %s uncoloured", async (_label, deadline, label) => {
      show({ deadline });

      const due = await screen.findByTestId("deadline-due");
      expect(due).toHaveTextContent(label);
      expect(due.className).not.toMatch(/text-(red|amber|green)-ink/);
    });

    it("reads Selesai in green once the video link is in, however late the deadline", async () => {
      show({ status: "link_submitted", waitingOn: null, deadline: "2026-09-01" });

      const due = await screen.findByTestId("deadline-due");
      expect(due).toHaveTextContent("Selesai");
      expect(due).toHaveClass("text-green-ink");
    });

    it("counts the deadline from the current day when no day is pinned", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-04T05:00:00Z"));

      try {
        render(
          <ContentDetailPanel
            contentId={CONTENT}
            role="admin"
            onClose={() => {}}
            load={vi.fn<Loader>().mockResolvedValue(detail())}
          />,
        );

        expect(await screen.findByTestId("deadline-due")).toHaveTextContent("H-1");
      } finally {
        vi.useRealTimers();
      }
    });

    it("shows a status this build does not know as its raw name, with no step text, and does not crash", async () => {
      show({ status: "archived" as ContentDetail["status"] });

      const meta = await screen.findByTestId("modal-meta");
      const status = within(meta).getByText("archived");

      expect(status.querySelector(".bg-rule")).not.toBeNull();
      expect(screen.getByText("Menunggu Admin")).toBeInTheDocument();
      expect(screen.queryByTestId("step-text")).not.toBeInTheDocument();
    });
  });

  describe("brief", () => {
    it("shows a Specific content's brief with its line breaks kept", async () => {
      show({ brief: "Tunjukkan fitur cashback.\nDurasi maksimal 30 detik." });

      const brief = await screen.findByText(/Tunjukkan fitur cashback\./);
      expect(brief).toHaveTextContent("Durasi maksimal 30 detik.");
      expect(brief).toHaveClass("whitespace-pre-line");
    });

    it.each([
      ["Evergreen content, which has none", { type: "evergreen", brief: "Sisa brief lama." }],
      ["a Specific content with none written", { brief: "" }],
    ] as const)("leaves the brief out for %s", async (_label, overrides) => {
      show(overrides);

      await journeyItems();
      expect(screen.queryByText("Brief")).not.toBeInTheDocument();
      expect(screen.queryByText("Sisa brief lama.")).not.toBeInTheDocument();
    });

    it("shows a brief of exactly 160 characters whole, with nothing to expand", async () => {
      const brief = "a".repeat(160);
      show({ brief });

      expect(await screen.findByText(brief)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Selengkapnya" })).not.toBeInTheDocument();
    });

    it("cuts a longer brief at 160 characters, then expands and folds it back", async () => {
      const brief = `${"a".repeat(160)}b`;
      show({ brief });

      const more = await screen.findByRole("button", { name: "Selengkapnya" });
      expect(more).toHaveAttribute("aria-expanded", "false");
      expect(screen.getByText(`${"a".repeat(160)}…`)).toBeInTheDocument();

      fireEvent.click(more);
      const less = screen.getByRole("button", { name: "Ringkas" });
      expect(less).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByText(brief)).toBeInTheDocument();

      fireEvent.click(less);
      expect(screen.queryByText(brief)).not.toBeInTheDocument();
    });

    it("never cuts through an emoji sitting on the 160th character", async () => {
      show({ brief: `${"a".repeat(159)}😀b` });

      await screen.findByRole("button", { name: "Selengkapnya" });
      expect(screen.getByText(`${"a".repeat(159)}😀…`)).toBeInTheDocument();
    });
  });

  describe("current step", () => {
    it.each([
      ["admin", "Menunggu Admin", ["border-accent", "bg-accent-wash"], "text-accent-deep"],
      ["creator", "Menunggu kreator", ["border-amber", "bg-amber-wash"], "text-amber-ink"],
    ] as const)("tints the step by who it waits on: %s", async (waitingOn, label, card, text) => {
      show({ waitingOn });

      const who = await screen.findByText(label);
      expect(who).toHaveClass(text);
      expect(screen.getByTestId("current-step")).toHaveClass(...card);
    });

    it("turns the step green and reads Selesai once nothing is left to do", async () => {
      show({ status: "link_submitted", waitingOn: null });

      const step = await screen.findByTestId("current-step");
      expect(within(step).getByText("Selesai")).toHaveClass("text-green-ink");
      expect(step).toHaveClass("border-green", "bg-green-wash");
      expect(within(step).getByTestId("step-text")).toHaveTextContent("Link video sudah dikirim.");
    });

    it("sits above the history, so the next step is read first", async () => {
      show();

      const step = await screen.findByTestId("current-step");
      const journey = screen.getByLabelText("Riwayat konten");
      expect(step.compareDocumentPosition(journey)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });
  });

  describe("timeline", () => {
    const FULL: ContentDetail["events"] = [
      {
        id: "link",
        type: "link_submitted",
        at: "2026-09-24T03:00:00.000Z",
        actor: { name: "Rangga Pratama", role: "creator" },
        payload: { link: "https://www.instagram.com/reel/abc" },
      },
      { id: "ok", type: "draft_approved", at: "2026-09-23T03:00:00.000Z", actor: { name: null, role: "admin" } },
      {
        id: "sub-2",
        type: "draft_submitted",
        at: "2026-09-22T03:00:00.000Z",
        actor: { name: "Rangga Pratama", role: "creator" },
        payload: { version: 2, link: "https://drive.google.com/draft-v2", note: "Opening sudah diganti." },
      },
      {
        id: "rev-1",
        type: "revision_requested",
        at: "2026-09-21T03:00:00.000Z",
        actor: { name: "Dewi Lestari", role: "admin" },
        payload: { note: "Audio terlalu pelan.\nTambahkan subtitle." },
      },
      {
        id: "sub-1",
        type: "draft_submitted",
        at: "2026-09-20T03:00:00.000Z",
        actor: { name: "Rangga Pratama", role: "creator" },
        payload: { version: 1, link: "https://drive.google.com/draft-v1" },
      },
      { id: "sch", type: "scheduled", at: "2026-09-01T03:00:00.000Z", actor: { name: null, role: "admin" } },
    ];

    it("titles every event with its draft version or revision round, newest first", async () => {
      show({ events: FULL });

      const titles = (await journeyItems()).map(
        (item) => item.querySelector("[data-step-title]")?.textContent,
      );

      expect(titles).toEqual([
        "Link video dikirim",
        "Draft di-approve",
        "Draft v2 dikirim",
        "Revisi ke-1 diminta",
        "Draft v1 dikirim",
        "Ditambahkan Admin",
      ]);
    });

    it("marks each event with a ringed dot in the colour of what happened", async () => {
      show({ events: FULL });

      const dots = (await journeyItems()).map(
        (item) => item.querySelector("[data-timeline-dot]")?.className ?? "",
      );

      expect(dots[0]).toContain("bg-green ring-green");
      expect(dots[1]).toContain("bg-green ring-green");
      expect(dots[2]).toContain("bg-amber ring-amber");
      expect(dots[3]).toContain("bg-red ring-red");
      expect(dots[4]).toContain("bg-amber ring-amber");
      expect(dots[5]).toContain("bg-accent ring-accent");
    });

    it("shows when each event happened in Jakarta time, and who did it in which role", async () => {
      show({ events: FULL });

      const items = await journeyItems();

      expect(within(items[2]).getByText("22 Sep 2026, 10.00 WIB")).toHaveAttribute(
        "datetime",
        "2026-09-22T03:00:00.000Z",
      );
      expect(items[2]).toHaveTextContent("Rangga Pratama · Kreator");
      expect(items[3]).toHaveTextContent("Dewi Lestari · Admin");
    });

    it("names only the role when the API sends no actor name", async () => {
      show({ events: FULL });

      const actor = (await journeyItems())[5].querySelector("[data-step-actor]");
      expect(actor).toHaveTextContent(/^Admin$/);
    });

    it("opens a draft or the video in a new tab from a chip labelled with what it is", async () => {
      show({ events: FULL });

      const draft = await screen.findByRole("link", { name: /Buka draft v2/ });
      expect(draft).toHaveAttribute("href", "https://drive.google.com/draft-v2");
      expect(draft).toHaveAttribute("target", "_blank");
      expect(draft).toHaveAttribute("rel", "noopener noreferrer");
      expect(draft).toHaveClass("border");
      expect(screen.getByRole("link", { name: /Buka video/ })).toHaveAttribute(
        "href",
        "https://www.instagram.com/reel/abc",
      );
      expect(within((await journeyItems())[1]).queryByRole("link")).not.toBeInTheDocument();
    });

    it("quotes a note under its event, signed, with its line breaks kept", async () => {
      show({ events: FULL });

      const items = await journeyItems();
      const note = within(items[3]).getByText(/Audio terlalu pelan\./);

      expect(within(items[3]).getByText("Catatan Admin")).toBeInTheDocument();
      expect(note).toHaveTextContent("Tambahkan subtitle.");
      expect(note).toHaveClass("whitespace-pre-line");
      expect(within(items[2]).getByText("Catatan Rangga Pratama")).toBeInTheDocument();
      expect(within(items[4]).queryByText(/^Catatan/)).not.toBeInTheDocument();
    });

    it("says so when nothing has happened yet", async () => {
      show({ events: [] });

      expect(await screen.findByText("Belum ada riwayat.")).toBeInTheDocument();
      expect(screen.queryByLabelText("Riwayat konten")).not.toBeInTheDocument();
    });
  });

  describe("loading", () => {
    it("raises an alert with a way to retry when the load fails", async () => {
      show({}, vi.fn<Loader>().mockRejectedValue(new ContentDetailError(500)));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Detail konten gagal dimuat");
      expect(within(alert).getByRole("button", { name: "Muat ulang" })).toBeInTheDocument();
    });

    it("offers no retry for a content that does not exist", async () => {
      show({}, vi.fn<Loader>().mockRejectedValue(new ContentDetailError(404)));

      expect(await screen.findByText("Konten tidak ditemukan.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Muat ulang" })).not.toBeInTheDocument();
    });

    it("loads again on retry, showing the loading line and then the content", async () => {
      let finish!: (value: ContentDetail) => void;
      const load = vi
        .fn<Loader>()
        .mockRejectedValueOnce(new ContentDetailError(500))
        .mockReturnValueOnce(new Promise<ContentDetail>((resolve) => (finish = resolve)));
      show({}, load);

      fireEvent.click(await screen.findByRole("button", { name: "Muat ulang" }));

      expect(screen.getByText("Memuat konten...")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(load).toHaveBeenCalledTimes(2);

      finish(detail());
      expect(await screen.findByRole("dialog", { name: "Promo Lebaran" })).toBeInTheDocument();
    });

    it("hands the loader a signal and cancels the request when the panel closes", async () => {
      const load = vi.fn<Loader>().mockReturnValue(new Promise<ContentDetail>(() => {}));
      const { unmount } = show({}, load);

      const signal = load.mock.calls[0][2];
      expect(load).toHaveBeenCalledWith(CONTENT, "admin", expect.any(AbortSignal));
      expect(signal?.aborted).toBe(false);

      unmount();

      expect(signal?.aborted).toBe(true);
    });

    it("does not load again when the parent re-renders with a new loader function", async () => {
      const first = vi.fn<Loader>().mockResolvedValue(detail());
      const second = vi.fn<Loader>().mockResolvedValue(detail({ name: "Lain" }));
      const { rerender } = show({}, first);
      await screen.findByRole("dialog", { name: "Promo Lebaran" });

      rerender(
        <ContentDetailPanel contentId={CONTENT} role="admin" onClose={() => {}} load={second} now={NOW} />,
      );

      expect(first).toHaveBeenCalledTimes(1);
      expect(second).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog", { name: "Promo Lebaran" })).toBeInTheDocument();
    });
  });
});
