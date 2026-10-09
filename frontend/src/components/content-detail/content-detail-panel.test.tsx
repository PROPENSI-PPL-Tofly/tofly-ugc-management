import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { ContentDetailError, type ContentDetail, type TimelineEvent } from "@/lib/content-detail";
import { ContentDetailPanel } from "./content-detail-panel";

// The panel is tested against a stubbed loader, not the network: what it renders for a given
// detail is its job, how the detail is fetched and worded is lib/content-detail's.

/** Midday in Jakarta on 9 Oct 2026, three days before the fixture's deadline. */
const NOW = new Date("2026-10-09T05:00:00Z");

function event(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    type: "scheduled",
    title: "Dijadwalkan",
    actorName: "Dewi Lestari",
    actorRole: "admin",
    timestamp: "2026-09-20T03:00:00.000Z",
    link: null,
    linkLabel: null,
    note: null,
    noteBy: null,
    ...overrides,
  };
}

function detail(overrides: Partial<ContentDetail> = {}): ContentDetail {
  return {
    contentId: "content-7",
    name: "Promo Lebaran",
    type: "specific",
    status: "draft_review",
    deadline: "2026-10-12",
    brief: "Tunjukkan fitur cashback.\nDurasi maksimal 30 detik.",
    creatorName: "Rangga Pratama",
    periodNumber: 2,
    currentStep: { waitingFor: "admin", title: "Review draft v2" },
    events: [
      event({
        type: "draft_submitted",
        title: "Draft v2 dikirim",
        actorName: "Rangga Pratama",
        actorRole: "creator",
        timestamp: "2026-10-03T03:00:00.000Z",
        link: "https://drive.google.com/file/d/draft-v2",
        linkLabel: "Buka draft v2",
        note: "Opening sudah aku ganti kak.",
        noteBy: "Catatan Rangga Pratama",
      }),
      event({
        type: "revision_requested",
        title: "Revisi ke-1 diminta",
        timestamp: "2026-10-02T03:00:00.000Z",
        note: "Audio terlalu pelan.\nTambahkan subtitle.",
        noteBy: "Catatan Admin",
      }),
      event({
        type: "draft_submitted",
        title: "Draft v1 dikirim",
        actorName: "Rangga Pratama",
        actorRole: "creator",
        timestamp: "2026-10-01T03:00:00.000Z",
        link: "https://drive.google.com/file/d/draft-v1",
        linkLabel: "Buka draft v1",
      }),
      event(),
    ],
    ...overrides,
  };
}

type Props = ComponentProps<typeof ContentDetailPanel>;
type Loader = NonNullable<Props["load"]>;

function renderPanel(props: Partial<Props> = {}) {
  const onClose = vi.fn();
  // Hand back the loader the panel was actually given, so a test that passes its own can
  // assert on it rather than on an unused default.
  const load = props.load ?? vi.fn<Loader>().mockResolvedValue(detail());
  const utils = render(
    <ContentDetailPanel contentId="content-7" onClose={onClose} now={NOW} {...props} load={load} />,
  );
  return { ...utils, onClose, load };
}

function renderWith(overrides: Partial<ContentDetail>, props: Partial<Props> = {}) {
  return renderPanel({ ...props, load: vi.fn<Loader>().mockResolvedValue(detail(overrides)) });
}

/** Settles only when the test says so, to look at the panel while it is still loading. */
function deferred() {
  let resolve!: (value: ContentDetail) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<ContentDetail>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function timelineItems() {
  const timeline = await screen.findByRole("list", { name: "Timeline" });
  return within(timeline).getAllByRole("listitem");
}

describe("ContentDetailPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("while loading", () => {
    it("says it is loading and asks for the content it was opened on", () => {
      const { load } = renderPanel({ load: vi.fn<Loader>().mockReturnValue(deferred().promise) });

      expect(screen.getByText("Memuat konten...")).toBeInTheDocument();
      expect(load).toHaveBeenCalledWith("content-7");
    });

    it("opens as a side sheet with a neutral title until the name is known", () => {
      renderPanel({ load: vi.fn<Loader>().mockReturnValue(deferred().promise) });

      const dialog = screen.getByRole("dialog", { name: "Detail Konten" });
      expect(dialog).toHaveClass("h-full", "max-w-[520px]");
      expect(screen.queryByTestId("modal-eyebrow")).not.toBeInTheDocument();
      expect(screen.queryByTestId("modal-meta")).not.toBeInTheDocument();
    });

    it("keeps the actions hidden until there is a step to act on", () => {
      renderPanel({
        load: vi.fn<Loader>().mockReturnValue(deferred().promise),
        actions: <button type="button">Approve</button>,
      });

      expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    });
  });

  describe("header", () => {
    it("titles the sheet with the content name", async () => {
      renderPanel();

      expect(await screen.findByRole("dialog", { name: "Promo Lebaran" })).toBeInTheDocument();
    });

    it.each([
      ["the creator and the period", {}, "Rangga Pratama › Periode 2"],
      ["the creator alone", { periodNumber: null }, "Rangga Pratama"],
      ["the period alone", { creatorName: null }, "Periode 2"],
    ])("says where the content sits with %s", async (_label, overrides, crumb) => {
      renderWith(overrides);

      expect(await screen.findByTestId("modal-eyebrow")).toHaveTextContent(crumb);
    });

    it("has no breadcrumb when neither the creator nor the period is known", async () => {
      renderWith({ creatorName: null, periodNumber: null });

      await screen.findByRole("dialog", { name: "Promo Lebaran" });
      expect(screen.queryByTestId("modal-eyebrow")).not.toBeInTheDocument();
    });

    it("shows the content type, the status with its colour, and the deadline", async () => {
      renderPanel();

      const meta = await screen.findByTestId("modal-meta");
      expect(within(meta).getByText("Specific")).toBeInTheDocument();
      expect(within(meta).getByText("Draft Menunggu Review")).toBeInTheDocument();
      // Same colour as the tables: a draft waiting on the admin is brand blue.
      expect(
        within(meta).getByText("Draft Menunggu Review").querySelector(".bg-accent"),
      ).not.toBeNull();
      expect(meta).toHaveTextContent("Deadline 12 Okt 2026");
    });

    it.each([
      ["2026-10-12", "H-3"],
      ["2026-10-10", "H-1"],
      ["2026-10-09", "Hari ini"],
      ["2026-10-07", "Lewat 2 hari"],
    ])("counts a %s deadline from today as %s", async (deadline, due) => {
      renderWith({ deadline });

      expect(await screen.findByTestId("modal-meta")).toHaveTextContent(due);
    });

    it("reads Selesai once the video link is in, however late the deadline", async () => {
      renderWith({ status: "link_submitted", deadline: "2026-10-01", currentStep: null });

      const meta = await screen.findByTestId("modal-meta");
      expect(meta).toHaveTextContent("Selesai");
      expect(meta).not.toHaveTextContent("Lewat");
    });
  });

  describe("brief", () => {
    it("shows a Specific content's brief with its line breaks kept", async () => {
      renderPanel();

      const brief = await screen.findByText(/Tunjukkan fitur cashback\./);
      expect(brief).toHaveTextContent("Durasi maksimal 30 detik.");
      expect(brief).toHaveClass("whitespace-pre-line");
    });

    it("leaves the brief out for Evergreen content, which has none", async () => {
      renderWith({ type: "evergreen", brief: "Sisa brief lama." });

      await timelineItems();
      expect(screen.queryByText("Brief")).not.toBeInTheDocument();
      expect(screen.queryByText("Sisa brief lama.")).not.toBeInTheDocument();
    });

    it("leaves the brief out when a Specific content has none written", async () => {
      renderWith({ brief: "" });

      await timelineItems();
      expect(screen.queryByText("Brief")).not.toBeInTheDocument();
    });

    it("shows a brief of exactly 160 characters whole, with nothing to expand", async () => {
      const brief = "a".repeat(160);
      renderWith({ brief });

      expect(await screen.findByText(brief)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Selengkapnya" })).not.toBeInTheDocument();
    });

    it("cuts a longer brief at 160 characters and offers the rest", async () => {
      const brief = `${"a".repeat(160)}b`;
      renderWith({ brief });

      const more = await screen.findByRole("button", { name: "Selengkapnya" });
      expect(more).toHaveAttribute("aria-expanded", "false");
      expect(screen.getByText(`${"a".repeat(160)}…`)).toBeInTheDocument();
      expect(screen.queryByText(brief)).not.toBeInTheDocument();
    });

    it("expands to the whole brief and folds it back", async () => {
      const brief = `${"a".repeat(160)}b`;
      renderWith({ brief });

      fireEvent.click(await screen.findByRole("button", { name: "Selengkapnya" }));

      const less = screen.getByRole("button", { name: "Ringkas" });
      expect(less).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByText(brief)).toBeInTheDocument();

      fireEvent.click(less);

      expect(screen.getByRole("button", { name: "Selengkapnya" })).toBeInTheDocument();
      expect(screen.queryByText(brief)).not.toBeInTheDocument();
    });
  });

  describe("timeline", () => {
    it("lists the current step first, then the events in the order it was given", async () => {
      renderPanel();

      const items = await timelineItems();

      expect(items).toHaveLength(5);
      expect(items[0]).toHaveTextContent("Review draft v2");
      expect(items[1]).toHaveTextContent("Draft v2 dikirim");
      expect(items[2]).toHaveTextContent("Revisi ke-1 diminta");
      expect(items[3]).toHaveTextContent("Draft v1 dikirim");
      expect(items[4]).toHaveTextContent("Dijadwalkan");
    });

    it("shows when each event happened, in Jakarta time, and who did it in which role", async () => {
      renderPanel();

      const [, draft, revision] = await timelineItems();

      expect(draft).toHaveTextContent("3 Okt 2026, 10.00 WIB");
      expect(within(draft).getByText("3 Okt 2026, 10.00 WIB")).toHaveAttribute(
        "datetime",
        "2026-10-03T03:00:00.000Z",
      );
      expect(draft).toHaveTextContent("Rangga Pratama · Kreator");
      expect(revision).toHaveTextContent("Dewi Lestari · Admin");
    });

    it("colours each event's dot by what happened", async () => {
      renderWith({
        events: [
          event({ type: "link_submitted", title: "Link video dikirim" }),
          event({ type: "creator_comment", title: "Komentar kreator" }),
          event({ type: "draft_approved", title: "Draft di-approve" }),
          event({ type: "revision_requested", title: "Revisi ke-1 diminta" }),
          event({ type: "draft_submitted", title: "Draft v1 dikirim" }),
          event(),
        ],
        currentStep: null,
      });

      const dots = (await timelineItems()).map(
        (item) => item.querySelector("[data-timeline-dot]")?.className ?? "",
      );

      expect(dots[0]).toContain("bg-green");
      expect(dots[1]).toContain("bg-rule");
      expect(dots[2]).toContain("bg-green");
      expect(dots[3]).toContain("bg-red");
      expect(dots[4]).toContain("bg-amber");
      expect(dots[5]).toContain("bg-accent");
    });

    it("opens a draft in a new tab, labelled with its version", async () => {
      renderPanel();

      const link = await screen.findByRole("link", { name: /Buka draft v2/ });

      expect(link).toHaveAttribute("href", "https://drive.google.com/file/d/draft-v2");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
      expect(screen.getByRole("link", { name: /Buka draft v1/ })).toBeInTheDocument();
    });

    it("shows a link that is not a web address as text, never as something to click", async () => {
      renderWith({
        events: [
          event({
            type: "draft_submitted",
            title: "Draft v1 dikirim",
            link: "javascript:alert(1)",
            linkLabel: "Buka draft v1",
          }),
        ],
      });

      const [, draft] = await timelineItems();

      expect(within(draft).queryByRole("link")).not.toBeInTheDocument();
      expect(draft).toHaveTextContent("javascript:alert(1)");
      expect(draft).toHaveTextContent("Link ini bukan link web yang valid, jadi tidak bisa dibuka.");
    });

    it("shows no link on an event that has none", async () => {
      renderPanel();

      const items = await timelineItems();

      expect(within(items[2]).queryByRole("link")).not.toBeInTheDocument();
      expect(items[2]).not.toHaveTextContent("bukan link web");
    });

    it("quotes a note under its event, signed and with its line breaks kept", async () => {
      renderPanel();

      const [, draft, revision] = await timelineItems();

      expect(within(revision).getByText("Catatan Admin")).toBeInTheDocument();
      const note = within(revision).getByText(/Audio terlalu pelan\./);
      expect(note).toHaveTextContent("Tambahkan subtitle.");
      expect(note).toHaveClass("whitespace-pre-line");

      expect(within(draft).getByText("Catatan Rangga Pratama")).toBeInTheDocument();
      expect(within(draft).getByText("Opening sudah aku ganti kak.")).toBeInTheDocument();
    });

    it("quotes nothing under an event without a note", async () => {
      renderPanel();

      const items = await timelineItems();

      expect(within(items[3]).queryByText(/^Catatan/)).not.toBeInTheDocument();
    });

    it("says so when a content has neither a step nor any history yet", async () => {
      renderWith({ currentStep: null, events: [] });

      expect(await screen.findByText("Belum ada aktivitas.")).toBeInTheDocument();
      expect(screen.queryByRole("list", { name: "Timeline" })).not.toBeInTheDocument();
    });
  });

  describe("current step", () => {
    it.each([
      ["admin", "Menunggu Admin"],
      ["creator", "Menunggu kreator"],
    ] as const)("says the content waits on the %s", async (waitingFor, label) => {
      renderWith({ currentStep: { waitingFor, title: "Kirim draft" } });

      const [step] = await timelineItems();

      expect(within(step).getByText(label)).toBeInTheDocument();
      expect(within(step).getByText("Kirim draft")).toBeInTheDocument();
    });

    it("is the only item while nothing has happened yet", async () => {
      renderWith({ currentStep: { waitingFor: "creator", title: "Kirim draft" }, events: [] });

      expect(await timelineItems()).toHaveLength(1);
    });

    it("is left out once nothing is left to do, so only the history shows", async () => {
      renderWith({ status: "link_submitted", currentStep: null });

      const items = await timelineItems();

      expect(items).toHaveLength(4);
      expect(screen.queryByText(/^Menunggu/)).not.toBeInTheDocument();
    });

    it("puts the actions it is handed on the current step", async () => {
      renderPanel({ actions: <button type="button">Approve</button> });

      const [step, firstEvent] = await timelineItems();

      expect(within(step).getByRole("button", { name: "Approve" })).toBeInTheDocument();
      expect(within(firstEvent).queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    });

    it("shows no actions when there is no step to act on", async () => {
      renderWith(
        { status: "link_submitted", currentStep: null },
        { actions: <button type="button">Approve</button> },
      );

      await timelineItems();
      expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    });
  });

  describe("when loading fails", () => {
    it("says the content was not found on a 404, with nothing to retry", async () => {
      renderPanel({ load: vi.fn<Loader>().mockRejectedValue(new ContentDetailError(404)) });

      expect(await screen.findByText("Konten tidak ditemukan.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Muat ulang" })).not.toBeInTheDocument();
      expect(screen.getByRole("dialog", { name: "Detail Konten" })).toBeInTheDocument();
    });

    it.each([
      ["a server error", new ContentDetailError(500)],
      ["a refused request", new ContentDetailError(403)],
      ["a network failure", new TypeError("Failed to fetch")],
    ])("raises an alert with a way to retry on %s", async (_label, error) => {
      renderPanel({ load: vi.fn<Loader>().mockRejectedValue(error) });

      const alert = await screen.findByRole("alert");

      expect(alert).toHaveTextContent("Detail konten gagal dimuat");
      expect(within(alert).getByRole("button", { name: "Muat ulang" })).toBeInTheDocument();
    });

    it("loads again on retry, showing the loading state and then the content", async () => {
      const second = deferred();
      const load = vi
        .fn<Loader>()
        .mockRejectedValueOnce(new ContentDetailError(500))
        .mockReturnValueOnce(second.promise);
      renderPanel({ load });

      fireEvent.click(await screen.findByRole("button", { name: "Muat ulang" }));

      expect(screen.getByText("Memuat konten...")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(load).toHaveBeenCalledTimes(2);

      await act(async () => second.resolve(detail()));

      expect(screen.getByRole("dialog", { name: "Promo Lebaran" })).toBeInTheDocument();
    });
  });

  describe("closing", () => {
    it("closes on Escape and on the close button", async () => {
      const { onClose } = renderPanel();
      await timelineItems();

      fireEvent.keyDown(document, { key: "Escape" });
      fireEvent.click(screen.getByRole("button", { name: "Tutup dialog" }));

      expect(onClose).toHaveBeenCalledTimes(2);
    });

    it("ignores an answer that arrives after it was closed", async () => {
      const pending = deferred();
      const { unmount } = renderPanel({ load: vi.fn<Loader>().mockReturnValue(pending.promise) });

      unmount();
      await act(async () => pending.resolve(detail()));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("ignores a failure that arrives after it was closed", async () => {
      const pending = deferred();
      const { unmount } = renderPanel({ load: vi.fn<Loader>().mockReturnValue(pending.promise) });

      unmount();
      await act(async () => pending.reject(new ContentDetailError(500)));

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  it("counts the deadline from the current day when no day is pinned", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-11T05:00:00Z"));

    try {
      render(
        <ContentDetailPanel
          contentId="content-7"
          onClose={() => {}}
          load={vi.fn<Loader>().mockResolvedValue(detail())}
        />,
      );

      expect(await screen.findByTestId("modal-meta")).toHaveTextContent("H-1");
    } finally {
      vi.useRealTimers();
    }
  });
});
