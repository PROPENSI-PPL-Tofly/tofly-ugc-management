import { render, screen } from "@testing-library/react";
import { MIN_TARGET, PHONE_TARGET } from "@/components/ui/touch-target";
import { expectMinTarget, expectPhoneTarget } from "./touch-target";

describe("expectPhoneTarget", () => {
  it("takes a button as it is, since a browser boxes one of its own", () => {
    render(<button className={PHONE_TARGET}>Simpan</button>);

    expectPhoneTarget(screen.getByRole("button"));
  });

  it("takes a link or a label once it is a box below sm", () => {
    render(
      <>
        <a href="/x" className={`inline-flex ${PHONE_TARGET}`}>
          Flex
        </a>
        <a href="/y" className={`max-sm:flex ${PHONE_TARGET}`}>
          Flex on a phone
        </a>
        <label className={`block ${PHONE_TARGET}`}>Block</label>
      </>,
    );

    expectPhoneTarget(screen.getByRole("link", { name: "Flex" }));
    expectPhoneTarget(screen.getByRole("link", { name: "Flex on a phone" }));
    expectPhoneTarget(screen.getByText("Block"));
  });

  it("refuses an inline link, whose min-height a browser ignores", () => {
    render(
      <a href="/x" className={PHONE_TARGET}>
        Inline
      </a>,
    );

    expect(() => expectPhoneTarget(screen.getByRole("link"))).toThrow(/is inline on a phone/);
  });

  it("refuses a box that only starts from sm, and a button made inline", () => {
    render(
      <>
        <a href="/x" className={`sm:flex ${PHONE_TARGET}`}>
          Wide only
        </a>
        <button className={`inline ${PHONE_TARGET}`}>Inline button</button>
      </>,
    );

    expect(() => expectPhoneTarget(screen.getByRole("link"))).toThrow(/is inline on a phone/);
    expect(() => expectPhoneTarget(screen.getByRole("button"))).toThrow(/is inline on a phone/);
  });

  it("refuses a control without the class", () => {
    render(<button className="min-h-11">Simpan</button>);

    expect(() => expectPhoneTarget(screen.getByRole("button"))).toThrow();
  });
});

describe("expectMinTarget", () => {
  it("takes a link that is a box at every width", () => {
    render(
      <a href="/x" className={`inline-flex ${MIN_TARGET}`}>
        Privasi
      </a>,
    );

    expectMinTarget(screen.getByRole("link"));
  });

  it("refuses a link that is a box only on a phone", () => {
    render(
      <a href="/x" className={`max-sm:flex ${MIN_TARGET}`}>
        Privasi
      </a>,
    );

    expect(() => expectMinTarget(screen.getByRole("link"))).toThrow(/is inline/);
  });
});
