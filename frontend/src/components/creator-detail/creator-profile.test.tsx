import { render, screen, within } from "@testing-library/react";
import type { CreatorPeriod, CreatorProfile } from "@/lib/creator-detail";
import { CreatorProfilePanel } from "./creator-profile";

const CREATOR: CreatorProfile = {
  id: "creator-1",
  name: "Rangga Pratama",
  email: "rangga@example.com",
  socials: { instagram: "rangga.creates", tiktok: "ranggacreates" },
};

const PERIOD: CreatorPeriod = {
  contractId: "33333333-3333-4333-8333-333333333333",
  periodNumber: 2,
  type: "regular",
  startDate: "2026-06-01",
  endDate: "2026-12-31",
  status: "active",
  contentQuota: 19,
  remainingEvergreenQuota: 1,
  daysBetween: 14,
};

function socials() {
  return screen.getByRole("list", { name: "Akun media sosial" });
}

describe("CreatorProfilePanel", () => {
  it("names the creator as the page's own heading, with the email under it", () => {
    render(<CreatorProfilePanel creator={CREATOR} current={PERIOD} />);

    expect(screen.getByRole("heading", { level: 2, name: "Rangga Pratama" })).toBeInTheDocument();
    expect(screen.getByText("rangga@example.com")).toBeInTheDocument();
  });

  it("lists each handle beside the platform it belongs to", () => {
    render(<CreatorProfilePanel creator={CREATOR} current={PERIOD} />);

    const items = within(socials()).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "IG@rangga.creates",
      "TIKTOK@ranggacreates",
    ]);
  });

  it.each([
    ["Instagram", { instagram: "rangga.creates" }, "IG@rangga.creates"],
    ["TikTok", { tiktok: "ranggacreates" }, "TIKTOK@ranggacreates"],
  ] as const)("lists only %s for a creator with that one account", (_, only, text) => {
    render(<CreatorProfilePanel creator={{ ...CREATOR, socials: only }} current={PERIOD} />);

    const items = within(socials()).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([text]);
  });

  it("says there is no account rather than leaving a gap", () => {
    render(<CreatorProfilePanel creator={{ ...CREATOR, socials: {} }} current={PERIOD} />);

    expect(screen.getByText("Belum ada akun media sosial")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Akun media sosial" })).toBeNull();
  });

  it.each([
    ["regular", "Regular"],
    ["probation", "Probation"],
  ] as const)("words a %s contract's type beside its label", (type, label) => {
    render(<CreatorProfilePanel creator={CREATOR} current={{ ...PERIOD, type }} />);

    expect(screen.getByText("Tipe").nextElementSibling).toHaveTextContent(label);
  });

  it.each([
    ["active", "Aktif"],
    ["expired", "Berakhir"],
    ["upcoming", "Belum Dimulai"],
  ] as const)("words a contract that is %s in text, not in colour alone", (status, label) => {
    render(<CreatorProfilePanel creator={CREATOR} current={{ ...PERIOD, status }} />);

    expect(screen.getByText("Kontrak").nextElementSibling).toHaveTextContent(label);
  });

  it("shows neither the type nor the contract state for a creator without a contract", () => {
    render(<CreatorProfilePanel creator={CREATOR} current={null} />);

    expect(screen.getByRole("heading", { name: "Rangga Pratama" })).toBeInTheDocument();
    expect(screen.queryByText("Tipe")).toBeNull();
    expect(screen.queryByText("Kontrak")).toBeNull();
  });

  it("shows markup in a name or a handle as the text it is, never as markup", () => {
    const { container } = render(
      <CreatorProfilePanel
        creator={{
          ...CREATOR,
          name: '<img src=x onerror="alert(1)">',
          socials: { instagram: "<script>alert(1)</script>" },
        }}
        current={PERIOD}
      />,
    );

    expect(screen.getByRole("heading", { name: '<img src=x onerror="alert(1)">' })).toBeInTheDocument();
    expect(screen.getByText("@<script>alert(1)</script>")).toBeInTheDocument();
    expect(container.querySelector("img, script")).toBeNull();
  });
});
