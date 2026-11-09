import { render, screen, within } from "@testing-library/react";
import type { FollowUp } from "@/lib/content-detail";
import { formatTimestamp } from "@/lib/format";
import { FollowUpList } from "./follow-up-list";

const FIRST: FollowUp = {
  id: "f1",
  note: "Tambahan: logo di detik 3.",
  at: "2026-11-08T03:00:00.000Z",
  actor: { name: "Bastian" },
};
const SECOND: FollowUp = {
  id: "f2",
  note: "Ralat: musiknya yang\nversi kedua.",
  at: "2026-11-09T04:30:00.000Z",
  actor: { name: null },
};

describe("FollowUpList", () => {
  it("lists the follow-ups in the order they were added, each labelled with its time", () => {
    render(<FollowUpList followUps={[FIRST, SECOND]} />);

    const items = within(screen.getByRole("list", { name: "Catatan susulan" })).getAllByRole(
      "listitem",
    );
    expect(items).toHaveLength(2);

    expect(items[0]).toHaveTextContent("Catatan susulan");
    expect(items[0]).toHaveTextContent(FIRST.note);
    const firstTime = within(items[0]).getByText(formatTimestamp(FIRST.at));
    expect(firstTime.tagName).toBe("TIME");
    expect(firstTime).toHaveAttribute("dateTime", FIRST.at);

    expect(items[1]).toHaveTextContent("Ralat: musiknya yang");
    expect(within(items[1]).getByText(formatTimestamp(SECOND.at))).toBeInTheDocument();
  });

  it("keeps the line breaks the admin typed", () => {
    render(<FollowUpList followUps={[SECOND]} />);

    expect(screen.getByText(/Ralat: musiknya yang/)).toHaveClass("whitespace-pre-line");
  });

  it("draws nothing while there is no follow-up", () => {
    const { container } = render(<FollowUpList followUps={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
