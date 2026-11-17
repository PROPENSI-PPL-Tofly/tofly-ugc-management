import { render, screen } from "@testing-library/react";
import { RichNoteEditor } from "./rich-note-editor";

// The app's Content Security Policy (proxy.ts) allows styles only from the app's own files or
// with the request's nonce. Tiptap's own <style> tag has neither, so the browser refuses it and
// the editor loses white-space: pre-wrap (two spaces typed show as one). The editor must bring
// its rules as an ordinary stylesheet instead of injecting a tag. Its own file, so the page
// starts with no tag left by another test.
describe("RichNoteEditor under the app's CSP", () => {
  it("injects no <style> tag of its own", async () => {
    render(<RichNoteEditor label="Catatan revisi" max={1000} />);

    await screen.findByRole("textbox", { name: "Catatan revisi" });
    expect(document.querySelector("style[data-tiptap-style]")).toBeNull();
  });
});
