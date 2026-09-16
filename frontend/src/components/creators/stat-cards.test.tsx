import { render, screen } from "@testing-library/react";
import { StatCards } from "./stat-cards";

describe("StatCards", () => {
  it("summarises the roster at a glance", () => {
    render(<StatCards stats={{ total: 12, active: 9, good: 5, risk: 3 }} />);

    expect(screen.getByText("Total creator terdaftar").nextSibling).toHaveTextContent("12");
    expect(screen.getByText("Kontrak aktif").nextSibling).toHaveTextContent("9");
    expect(screen.getByText("Produktivitas baik").nextSibling).toHaveTextContent("5");
    expect(screen.getByText("Perlu perhatian").nextSibling).toHaveTextContent("3");
  });
});
