import { render, screen } from "@testing-library/react";
import Loading from "./loading";

describe("Log Aktivitas loading", () => {
  it("says the log is on its way", () => {
    render(<Loading />);

    expect(screen.getByRole("status")).toHaveTextContent("Memuat log aktivitas…");
  });
});
