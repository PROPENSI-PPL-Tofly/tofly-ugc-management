import { render, screen } from "@testing-library/react";
import { DEFAULT_BUFFER_DAYS } from "@/lib/deadline-buffer";
import { DeadlineBufferProvider, useDeadlineBuffer } from "./deadline-buffer-context";

function Shown() {
  return <span>{useDeadlineBuffer()}</span>;
}

describe("useDeadlineBuffer", () => {
  it("reads the buffer the admin area was rendered with", () => {
    render(
      <DeadlineBufferProvider bufferDays={11}>
        <Shown />
      </DeadlineBufferProvider>,
    );

    expect(screen.getByText("11")).toBeInTheDocument();
  });

  it("is the default buffer outside the admin area", () => {
    render(<Shown />);

    expect(screen.getByText(String(DEFAULT_BUFFER_DAYS))).toBeInTheDocument();
  });
});
