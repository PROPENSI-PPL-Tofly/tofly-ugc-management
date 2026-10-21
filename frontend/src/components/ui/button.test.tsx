import { render, screen } from "@testing-library/react";
import { Button } from "./button";
import { buttonClasses } from "./button-classes";
import { PHONE_TARGET } from "./touch-target";
import { expectPhoneTarget } from "@/test/touch-target";

// Measured by hit-testing at 375px: "+ Tambah Creator", "⚙ Atur Formula Rate", the dialogs' Batal
// and Simpan, and the phone deadline sort were 33-34px tall. A button is a page's or a dialog's
// action, so on a phone each one is a 44px press, and a link drawn as a button is too.
describe("Button", () => {
  it("is a 44px press on a phone, in every variant", () => {
    render(
      <>
        <Button>Batal</Button>
        <Button variant="accent">Simpan</Button>
        <Button variant="ghost">Deadline</Button>
      </>,
    );

    for (const button of screen.getAllByRole("button")) expectPhoneTarget(button);
  });

  it("lends the same press to a link drawn as a button", () => {
    expect(buttonClasses("accent").split(" ")).toContain(PHONE_TARGET);
  });
});
