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

  // Approved design: a pressed control gives a little under the finger, as the ToFly site does;
  // left still for anyone who asks the system for less motion.
  it("gives a little when pressed, unless motion is reduced", () => {
    render(<Button>Batal</Button>);

    expect(screen.getByRole("button", { name: "Batal" })).toHaveClass(
      "active:scale-[.97]",
      "motion-reduce:active:scale-100",
    );
  });

  it("lends the same press to a link drawn as a button", () => {
    expect(buttonClasses("accent").split(" ")).toContain(PHONE_TARGET);
  });

  it("keeps the regular padding unless asked for the small size", () => {
    expect(buttonClasses().split(" ")).toEqual(expect.arrayContaining(["px-3", "py-1.5"]));
    expect(buttonClasses("default", "md")).toBe(buttonClasses());
  });

  // The prototype's .btn.sm, such as a KPI card's Coba lagi: tighter padding, the same 44px press.
  it("draws the small size with tighter padding, still a 44px press on a phone", () => {
    const small = buttonClasses("default", "sm").split(" ");

    expect(small).toEqual(expect.arrayContaining(["px-2", "py-1", PHONE_TARGET]));
    expect(small).not.toContain("px-3");
    expect(small).not.toContain("py-1.5");
  });
});
