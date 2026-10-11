import { render, screen, within } from "@testing-library/react";
import { StatCards } from "./stat-cards";

const COUNTS = { scheduled: 3, draft_revision: 1, draft_approved: 2 };

function renderCards(props: Partial<Parameters<typeof StatCards>[0]> = {}) {
  return render(<StatCards counts={COUNTS} nearestDeadline="5 hari lagi" {...props} />);
}

describe("StatCards", () => {
  it("shows the three status cards and then the nearest deadline, in the dashboard's order", () => {
    renderCards();

    const cards = screen.getAllByRole("listitem");

    expect(cards).toHaveLength(4);
    expect(cards[0]).toHaveTextContent("Draft Perlu Disubmit");
    expect(cards[1]).toHaveTextContent("Draft Perlu Direvisi");
    expect(cards[2]).toHaveTextContent("Link Konten Perlu Diupload");
    expect(cards[3]).toHaveTextContent("Deadline Terdekat");
  });

  it.each([
    ["Draft Perlu Disubmit", "3"],
    ["Draft Perlu Direvisi", "1"],
    ["Link Konten Perlu Diupload", "2"],
  ])("shows how many tasks %s counts", (label, count) => {
    renderCards();

    const card = screen.getByRole("link", { name: new RegExp(label) });

    expect(within(card).getByText(count)).toBeInTheDocument();
  });

  it.each([
    ["Draft Perlu Disubmit", "/creator/tasks?status=scheduled"],
    ["Draft Perlu Direvisi", "/creator/tasks?status=draft_revision"],
    ["Link Konten Perlu Diupload", "/creator/tasks?status=draft_approved"],
  ])("makes %s a link to Task Saya for its status", (label, href) => {
    renderCards();

    expect(screen.getByRole("link", { name: new RegExp(label) })).toHaveAttribute("href", href);
  });

  it("shows a zero, not an empty card, when a status has no tasks", () => {
    renderCards({ counts: { scheduled: 0, draft_revision: 0, draft_approved: 0 } });

    for (const link of screen.getAllByRole("link")) {
      expect(within(link).getByText("0")).toBeInTheDocument();
    }
  });

  it("reads a status it was given no count for as zero", () => {
    renderCards({ counts: { scheduled: 4 } });

    expect(
      within(screen.getByRole("link", { name: /Draft Perlu Direvisi/ })).getByText("0"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("link", { name: /Draft Perlu Disubmit/ })).getByText("4"),
    ).toBeInTheDocument();
  });

  it("shows the nearest deadline as the text it was given", () => {
    renderCards({ nearestDeadline: "12 hari lagi" });

    const card = screen.getAllByRole("listitem")[3];

    expect(within(card).getByText("12 hari lagi")).toBeInTheDocument();
  });

  it("does not make the nearest deadline a link: it is not a status with a tab to open", () => {
    renderCards();

    const card = screen.getAllByRole("listitem")[3];

    expect(within(card).queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });
});
