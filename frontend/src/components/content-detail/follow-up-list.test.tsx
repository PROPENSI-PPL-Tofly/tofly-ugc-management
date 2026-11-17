import { fireEvent, render, screen, within } from "@testing-library/react";
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

  // PBI-33 AC 2 with PBI-34: a formatted follow-up reads with its formatting, like the note above it.
  it("shows a formatted follow-up with its formatting", () => {
    render(
      <FollowUpList
        followUps={[
          { ...FIRST, note: "Ralat: musik", noteHtml: "<p><strong>Ralat</strong>: musik</p>" },
        ]}
      />,
    );

    expect(screen.getByText("Ralat").tagName).toBe("STRONG");
  });

  describe("screenshots", () => {
    const IMAGE = { id: "image-1", url: "/api/revision-note-images/image-1", contentType: "image/png" };
    const OTHER = { id: "image-2", url: "/api/revision-note-images/image-2", contentType: "image/png" };

    it("draws a screenshot where the admin placed it, and the rest under the note", () => {
      render(
        <FollowUpList
          followUps={[
            {
              ...FIRST,
              noteHtml: '<p>Lihat</p><img data-image-id="image-1">',
              images: [IMAGE, OTHER],
            },
          ]}
        />,
      );

      const item = screen.getAllByRole("listitem")[0];
      expect(within(item).getAllByRole("button", { name: /^Buka gambar/ })).toHaveLength(2);
      expect(item.querySelector('img[src="/api/revision-note-images/image-1"]')).not.toBeNull();
    });

    it("opens a follow-up's image in the overlay, counted among that follow-up's own", () => {
      render(
        <FollowUpList
          followUps={[{ ...FIRST, noteHtml: "<p>Lihat</p>", images: [IMAGE, OTHER] }]}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Buka gambar 2" }));

      expect(screen.getByRole("dialog", { name: "Gambar 2 dari 2" })).toBeInTheDocument();
    });
  });
});
