import { render, screen, within } from "@testing-library/react";
import type { CreatorPeriod, CreatorProfile } from "@/lib/creator-detail";
import { CreatorProfilePanel } from "./creator-profile";

const CREATOR: CreatorProfile = {
  id: "creator-1",
  name: "Rangga Pratama",
  email: "rangga@example.com",
  socials: { instagram: "rangga.creates", tiktok: "ranggacreates" },
  accessRevokeDate: null,
};

const TODAY = "2026-10-21";

const PERIOD: CreatorPeriod = {
  contractId: "33333333-3333-4333-8333-333333333333",
  periodNumber: 2,
  type: "regular",
  startDate: "2026-06-01",
  endDate: "2026-12-31",
  status: "active",
  contentQuota: 19,
  evergreenCount: 18,
  remainingEvergreenQuota: 1,
  progress: { submitted: 2, total: 6, percent: 33 },
  performance: { onTimeRate: 50, avgRevisions: 1, productivity: "watch", productivityLabel: "Perlu Perhatian" },
  daysBetween: 14,
};

function socials() {
  return screen.getByRole("list", { name: "Akun media sosial" });
}

describe("CreatorProfilePanel", () => {
  it("names the creator as the page's own heading, with the email under it", () => {
    render(<CreatorProfilePanel today={TODAY} creator={CREATOR} current={PERIOD} />);

    expect(screen.getByRole("heading", { level: 2, name: "Rangga Pratama" })).toBeInTheDocument();
    expect(screen.getByText("rangga@example.com")).toBeInTheDocument();
  });

  it("lists each handle beside the platform it belongs to", () => {
    render(<CreatorProfilePanel today={TODAY} creator={CREATOR} current={PERIOD} />);

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
    render(<CreatorProfilePanel today={TODAY} creator={{ ...CREATOR, socials: only }} current={PERIOD} />);

    const items = within(socials()).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([text]);
  });

  it("says there is no account rather than leaving a gap", () => {
    render(<CreatorProfilePanel today={TODAY} creator={{ ...CREATOR, socials: {} }} current={PERIOD} />);

    expect(screen.getByText("Belum ada akun media sosial")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Akun media sosial" })).toBeNull();
  });

  it.each([
    ["regular", "Regular"],
    ["probation", "Probation"],
  ] as const)("words a %s contract's type beside its label", (type, label) => {
    render(<CreatorProfilePanel today={TODAY} creator={CREATOR} current={{ ...PERIOD, type }} />);

    expect(screen.getByText("Tipe").nextElementSibling).toHaveTextContent(label);
  });

  it.each([
    ["active", "Aktif"],
    ["expired", "Berakhir"],
    ["upcoming", "Belum Dimulai"],
  ] as const)("words a contract that is %s in text, not in colour alone", (status, label) => {
    render(<CreatorProfilePanel today={TODAY} creator={CREATOR} current={{ ...PERIOD, status }} />);

    expect(screen.getByText("Kontrak").nextElementSibling).toHaveTextContent(label);
  });

  it("writes the contract type as text and the contract state as a dot and its words, not pills", () => {
    render(<CreatorProfilePanel today={TODAY} creator={CREATOR} current={{ ...PERIOD, type: "regular", status: "active" }} />);

    expect(screen.getByText("Regular")).not.toHaveClass("rounded-full");
    const state = within(screen.getByText("Kontrak").nextElementSibling as HTMLElement).getByText("Aktif");
    expect(state).not.toHaveClass("rounded-full");
    expect(state.querySelector('[aria-hidden="true"]')).toHaveClass("bg-green");
  });

  it("shows neither the type nor the contract state for a creator without a contract", () => {
    render(<CreatorProfilePanel today={TODAY} creator={CREATOR} current={null} />);

    expect(screen.getByRole("heading", { name: "Rangga Pratama" })).toBeInTheDocument();
    expect(screen.queryByText("Tipe")).toBeNull();
    expect(screen.queryByText("Kontrak")).toBeNull();
  });

  describe("Akses", () => {
    function access() {
      return screen.getByText("Akses").nextElementSibling;
    }

    it("says a creator who can sign in has access, as a dot and its words", () => {
      render(<CreatorProfilePanel today={TODAY} creator={CREATOR} current={PERIOD} />);

      expect(access()).toHaveTextContent("Aktif");
      expect(access()?.querySelector('[aria-hidden="true"]')).toHaveClass("bg-green");
    });

    it("names the day a planned revoke takes effect", () => {
      render(
        <CreatorProfilePanel today={TODAY} creator={{ ...CREATOR, accessRevokeDate: "2026-11-15" }} current={PERIOD} />,
      );

      expect(access()).toHaveTextContent("Aktif");
      expect(access()).toHaveTextContent("Dicabut mulai 15 Nov 2026");
      expect(access()?.querySelector('[aria-hidden="true"]')).toHaveClass("bg-amber");
    });

    it("says a revoked creator's access is gone, since when, and that it cut the contract short", () => {
      render(
        <CreatorProfilePanel today={TODAY} creator={{ ...CREATOR, accessRevokeDate: "2026-10-01" }} current={PERIOD} />,
      );

      expect(access()).toHaveTextContent("Dicabut");
      expect(access()).toHaveTextContent("Sejak 1 Okt 2026, sebelum kontrak berakhir (31 Des 2026)");
      expect(access()?.querySelector('[aria-hidden="true"]')).toHaveClass("bg-red");
    });

    it("still says whether a creator without a contract can sign in", () => {
      render(
        <CreatorProfilePanel today={TODAY} creator={{ ...CREATOR, accessRevokeDate: "2026-10-01" }} current={null} />,
      );

      expect(access()).toHaveTextContent("Sejak 1 Okt 2026");
      expect(access()).not.toHaveTextContent("sebelum kontrak berakhir");
    });
  });

  it("shows markup in a name or a handle as the text it is, never as markup", () => {
    const { container } = render(
      <CreatorProfilePanel today={TODAY}
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
