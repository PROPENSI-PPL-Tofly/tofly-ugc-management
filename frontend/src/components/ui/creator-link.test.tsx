import { render, screen } from "@testing-library/react";
import { CreatorLink } from "./creator-link";

const DRIVE = "https://drive.google.com/file/d/draft-2";

describe("CreatorLink", () => {
  describe("a web address", () => {
    it("opens in a new tab that cannot reach back into this one", () => {
      render(<CreatorLink link={DRIVE} label="Buka file draft" />);

      const link = screen.getByRole("link", { name: "Buka file draft" });

      expect(link).toHaveAttribute("href", DRIVE);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("prints the address under an inline link, which is the default look", () => {
      render(<CreatorLink link={DRIVE} label="Buka file draft" />);

      expect(screen.getByText(DRIVE)).toBeInTheDocument();
      expect(screen.getByRole("link")).toHaveClass("underline");
    });

    it("draws a chip without the address, marked as leaving the page", () => {
      render(<CreatorLink link={DRIVE} label="Buka draft v2" look="chip" />);

      const link = screen.getByRole("link", { name: /Buka draft v2/ });

      expect(link).toHaveClass("border");
      expect(link).toHaveTextContent("↗");
      expect(screen.queryByText(DRIVE)).not.toBeInTheDocument();
    });

    it("keeps the arrow out of what a screen reader announces", () => {
      render(<CreatorLink link={DRIVE} label="Buka draft v2" look="chip" />);

      expect(screen.getByText("↗", { exact: false, selector: "span" })).toHaveAttribute(
        "aria-hidden",
        "true",
      );
    });

    it("accepts plain http as well", () => {
      render(<CreatorLink link="http://example.com/a" label="Buka" />);

      expect(screen.getByRole("link", { name: "Buka" })).toHaveAttribute(
        "href",
        "http://example.com/a",
      );
    });
  });

  describe("anything that is not a web address", () => {
    it.each([
      ["a script", "javascript:alert(1)"],
      ["a data URL", "data:text/html,<script>alert(1)</script>"],
      ["a bare word", "nanti-aku-kirim"],
      ["an empty value", ""],
    ])("shows %s as text with a reason, never as a link", (_label, link) => {
      const { container } = render(<CreatorLink link={link} label="Buka file draft" />);

      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(container.querySelector("span")).toHaveTextContent(link, { normalizeWhitespace: false });
      expect(
        screen.getByText("Link ini bukan link web yang valid, jadi tidak bisa dibuka."),
      ).toBeInTheDocument();
    });

    it("says the same thing whichever look was asked for", () => {
      render(<CreatorLink link="javascript:alert(1)" label="Buka draft v2" look="chip" />);

      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(screen.getByText("javascript:alert(1)")).toBeInTheDocument();
    });
  });
});
