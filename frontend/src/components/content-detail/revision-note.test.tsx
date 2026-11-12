import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { RevisionNote } from "./revision-note";

const FIRST = { id: "image-1", url: "/api/note-images/image-1", contentType: "image/png" };
const SECOND = { id: "image-2", url: "/api/note-images/image-2", contentType: "image/jpeg" };

function thumbnail(position: number) {
  return screen.getByRole("button", { name: `Buka gambar ${position}` });
}

function picture(container: HTMLElement) {
  return container.querySelector("img") as HTMLImageElement;
}

describe("RevisionNote", () => {
  afterEach(cleanup);

  describe("a note from before formatting (AC 9)", () => {
    it("shows its words as it always did, line breaks kept", () => {
      // Act
      const { container } = render(<RevisionNote note={"Audio terlalu pelan.\nTambahkan subtitle."} />);

      // Assert
      const words = container.querySelector("p");
      expect(words?.textContent).toBe("Audio terlalu pelan.\nTambahkan subtitle.");
      expect(words).toHaveClass("whitespace-pre-line");
    });

    it("reads anything that looks like markup as plain words", () => {
      // Act
      const { container } = render(<RevisionNote note="Pakai <strong>font</strong> tebal" />);

      // Assert
      expect(container.querySelector("strong")).toBeNull();
      expect(screen.getByText("Pakai <strong>font</strong> tebal")).toBeInTheDocument();
    });

    it("has no thumbnails", () => {
      // Act
      render(<RevisionNote note="Perbaiki intro." />);

      // Assert
      expect(screen.queryByRole("button")).toBeNull();
      expect(screen.queryByRole("img")).toBeNull();
    });
  });

  describe("a formatted note (AC 8)", () => {
    it("shows the formatting the admin wrote instead of the plain words", () => {
      // Act
      const { container } = render(
        <RevisionNote
          note="Perbaiki intro dan audio"
          noteHtml="<p>Perbaiki <strong>intro</strong> dan <em>audio</em></p><ul><li>Satu</li></ul><ol><li>Dua</li></ol>"
        />,
      );

      // Assert
      expect(container.querySelector("p strong")?.textContent).toBe("intro");
      expect(container.querySelector("p em")?.textContent).toBe("audio");
      expect(container.querySelector("ul li")?.textContent).toBe("Satu");
      expect(container.querySelector("ol li")?.textContent).toBe("Dua");
      expect(screen.queryByText("Perbaiki intro dan audio")).toBeNull();
    });

    it("keeps a line break inside a paragraph", () => {
      // Act
      const { container } = render(<RevisionNote note="Satu Dua" noteHtml="<p>Satu<br>Dua</p>" />);

      // Assert
      expect(container.querySelector("p br")).not.toBeNull();
    });

    it("opens a link in a new tab, sending nothing about this page", () => {
      // Act
      render(
        <RevisionNote
          note="Contoh"
          noteHtml={'<p><a href="https://example.com/contoh" rel="noopener noreferrer nofollow">Contoh</a></p>'}
        />,
      );

      // Assert
      const link = screen.getByRole("link", { name: "Contoh" });
      expect(link).toHaveAttribute("href", "https://example.com/contoh");
      expect(link).toHaveAttribute("target", "_blank");
      // Blue as every link in the app, so it reads as one before it is pressed.
      expect(link).toHaveClass("text-accent-deep", "underline");
      expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
    });

    it("draws only what the note may hold, should anything else ever reach it", () => {
      // Act
      const { container } = render(
        <RevisionNote
          note="Halo"
          noteHtml={
            '<p onclick="alert(1)" style="color:red">Halo</p>' +
            "<script>alert(2)</script>" +
            '<img src="x" onerror="alert(3)">' +
            '<a href="javascript:alert(4)">Klik</a>' +
            "<h1>Judul</h1>"
          }
        />,
      );

      // Assert
      expect(container.querySelector("script, img, h1")).toBeNull();
      expect(container.querySelector("p")).not.toHaveAttribute("onclick");
      expect(container.querySelector("p")).not.toHaveAttribute("style");
      expect(screen.queryByRole("link")).toBeNull();
      expect(container.textContent).toContain("Klik");
      expect(container.textContent).toContain("Judul");
      expect(container.textContent).not.toContain("alert(2)");
    });
  });

  // A screenshot the admin placed in the text reads where it was placed, not in a row under it.
  describe("screenshots placed in the text", () => {
    function inline(...ids: string[]) {
      return ids.map((id) => `<img data-image-id="${id}">`).join("");
    }

    it("shows the image between the words it was placed between, as a thumbnail that opens", () => {
      const { container } = render(
        <RevisionNote
          note="Atas Bawah"
          noteHtml={`<p>Atas</p>${inline(FIRST.id)}<p>Bawah</p>`}
          images={[FIRST]}
        />,
      );

      const thumbnail = screen.getByRole("button", { name: "Buka gambar 1" });
      expect(picture(thumbnail)).toHaveAttribute("src", FIRST.url);
      const words = container.querySelectorAll("p");
      expect(words[0].compareDocumentPosition(thumbnail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(words[1].compareDocumentPosition(thumbnail) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    });

    it("does not show a placed image a second time under the note", () => {
      render(<RevisionNote note="Atas" noteHtml={`<p>Atas</p>${inline(FIRST.id)}`} images={[FIRST]} />);

      expect(screen.getAllByRole("button", { name: /^Buka gambar/ })).toHaveLength(1);
    });

    it("still shows an image the text does not place under it, numbered after the others", () => {
      render(
        <RevisionNote note="Atas" noteHtml={`<p>Atas</p>${inline(FIRST.id)}`} images={[FIRST, SECOND]} />,
      );

      expect(screen.getAllByRole("button", { name: /^Buka gambar/ })).toHaveLength(2);
      expect(picture(thumbnail(2))).toHaveAttribute("src", SECOND.url);
    });

    it("opens the placed image in the one overlay, counted among every image of the note", () => {
      render(
        <RevisionNote note="Atas" noteHtml={`<p>Atas</p>${inline(SECOND.id)}`} images={[FIRST, SECOND]} />,
      );

      fireEvent.click(screen.getAllByRole("button", { name: "Buka gambar 2" })[0]);

      const overlay = screen.getByRole("dialog", { name: "Gambar 2 dari 2" });
      expect(picture(overlay)).toHaveAttribute("src", SECOND.url);
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
    });

    it("says a placed image failed instead of a broken picture", () => {
      render(<RevisionNote note="Atas" noteHtml={`<p>Atas</p>${inline(FIRST.id)}`} images={[FIRST]} />);

      fireEvent.error(picture(thumbnail(1)));

      expect(screen.getByText("Gambar gagal dimuat")).toBeInTheDocument();
    });

    it("draws nothing for an image the note does not hold, whatever address it names", () => {
      const { container } = render(
        <RevisionNote
          note="Atas"
          noteHtml={`<p>Atas</p>${inline("7d0c5f1e-3b1a-4c2e-9f4d-2a6b8c0d1e2f")}<img src="https://evil.example/x.png">`}
          images={[FIRST]}
        />,
      );

      expect(container.querySelectorAll("img")).toHaveLength(1);
      expect(container.querySelector('img[src^="https://evil"]')).toBeNull();
    });

    it("draws no image in a note that holds none, such as a follow-up", () => {
      const { container } = render(
        <RevisionNote note="Atas" noteHtml={`<p>Atas</p>${inline(FIRST.id)}`} />,
      );

      expect(container.querySelector("img")).toBeNull();
    });
  });

  it("leaves out a comment in the note", () => {
    // Act
    const { container } = render(<RevisionNote note="Halo" noteHtml="<p>Halo<!-- catatan --></p>" />);

    // Assert
    expect(container.textContent).toBe("Halo");
  });

  describe("thumbnails (AC 8)", () => {
    it("shows one thumbnail per image, in the order attached", () => {
      // Act
      render(<RevisionNote note="Lihat gambar" images={[FIRST, SECOND]} />);

      // Assert
      expect(picture(thumbnail(1))).toHaveAttribute("src", FIRST.url);
      expect(picture(thumbnail(2))).toHaveAttribute("src", SECOND.url);
    });

    it("says a thumbnail is loading until its image arrives", () => {
      // Arrange
      render(<RevisionNote note="Lihat gambar" images={[FIRST]} />);
      expect(thumbnail(1)).toHaveAttribute("aria-busy", "true");

      // Act
      fireEvent.load(picture(thumbnail(1)));

      // Assert
      expect(thumbnail(1)).toHaveAttribute("aria-busy", "false");
    });

    it("says an image failed instead of a broken picture, and keeps the rest", () => {
      // Arrange
      render(<RevisionNote note="Lihat gambar" images={[FIRST, SECOND]} />);

      // Act
      fireEvent.error(picture(thumbnail(1)));

      // Assert
      expect(screen.getByText("Gambar gagal dimuat")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Buka gambar 1" })).toBeNull();
      expect(thumbnail(2)).toBeInTheDocument();
      expect(screen.getByText("Lihat gambar")).toBeInTheDocument();
    });
  });

  describe("the full-size view (AC 8)", () => {
    it("opens the pressed thumbnail in one overlay", () => {
      // Arrange
      render(<RevisionNote note="Lihat gambar" images={[FIRST, SECOND]} />);

      // Act
      fireEvent.click(thumbnail(2));

      // Assert
      const overlay = screen.getByRole("dialog", { name: "Gambar 2 dari 2" });
      expect(picture(overlay)).toHaveAttribute("src", SECOND.url);
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
    });

    it("fills the screen with the image alone, no title and no close button", () => {
      // Arrange
      render(<RevisionNote note="Lihat gambar" images={[FIRST]} />);

      // Act
      fireEvent.click(thumbnail(1));

      // Assert
      const overlay = screen.getByRole("dialog");
      expect(overlay).toHaveAttribute("aria-modal", "true");
      expect(within(overlay).queryByRole("heading")).toBeNull();
      expect(within(overlay).queryByRole("button")).toBeNull();
    });

    it("closes on a press anywhere, and a thumbnail opens it again", () => {
      // Arrange
      render(<RevisionNote note="Lihat gambar" images={[FIRST]} />);
      fireEvent.click(thumbnail(1));

      // Act
      fireEvent.click(picture(screen.getByRole("dialog")));

      // Assert
      expect(screen.queryByRole("dialog")).toBeNull();
      fireEvent.click(thumbnail(1));
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("closes on Escape and hands focus back to the thumbnail", () => {
      // Arrange
      render(<RevisionNote note="Lihat gambar" images={[FIRST]} />);
      thumbnail(1).focus();
      fireEvent.click(thumbnail(1));
      expect(screen.getByRole("dialog")).toHaveFocus();

      // Act
      fireEvent.keyDown(document, { key: "Escape" });

      // Assert
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(thumbnail(1)).toHaveFocus();
    });

    it("keeps Tab inside it, since nothing behind it can be reached", () => {
      // Arrange
      render(<RevisionNote note="Lihat gambar" images={[FIRST]} />);
      fireEvent.click(thumbnail(1));

      // Act
      const notPrevented = fireEvent.keyDown(document, { key: "Tab" });

      // Assert
      expect(notPrevented).toBe(false);
    });

    it("answers no other key", () => {
      // Arrange
      render(<RevisionNote note="Lihat gambar" images={[FIRST]} />);
      fireEvent.click(thumbnail(1));

      // Act
      const notPrevented = fireEvent.keyDown(document, { key: "a" });

      // Assert
      expect(notPrevented).toBe(true);
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("says the full-size image is loading until it arrives", () => {
      // Arrange
      render(<RevisionNote note="Lihat gambar" images={[FIRST]} />);
      fireEvent.click(thumbnail(1));
      const overlay = screen.getByRole("dialog");
      expect(within(overlay).getByText("Memuat gambar...")).toBeInTheDocument();

      // Act
      fireEvent.load(picture(overlay));

      // Assert
      expect(within(overlay).queryByText("Memuat gambar...")).toBeNull();
    });

    it("says a full-size image failed instead of a broken picture", () => {
      // Arrange
      render(<RevisionNote note="Lihat gambar" images={[FIRST]} />);
      fireEvent.click(thumbnail(1));
      const overlay = screen.getByRole("dialog");

      // Act
      fireEvent.error(picture(overlay));

      // Assert
      expect(within(overlay).getByText("Gambar gagal dimuat")).toBeInTheDocument();
      expect(overlay.querySelector("img")).toBeNull();
    });
  });
});
