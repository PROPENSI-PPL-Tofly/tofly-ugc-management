import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { AddCreatorModal } from "./add-creator-modal";

describe("AddCreatorModal", () => {
  it("renders all the required fields", () => {
    render(<AddCreatorModal onClose={() => {}} onSubmit={() => {}} />);

    expect(screen.getByLabelText(/nama creator/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mulai kontrak/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/akhir kontrak/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/jarak antar-deadline/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/fixed rate/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/jumlah konten/i)).toBeInTheDocument();
  });

  // Simpan is disabled while the form is empty (see "Simpan disabled state" below), so a
  // click here is a no-op in a real browser. This guards the outcome that actually matters
  // — no submission slips through — as a regression check independent of *how* Simpan gets
  // disabled. The inline "Nama wajib diisi" message this test used to assert on is gone:
  // `errors` state only updates from handleSubmit, which the disabled button now prevents
  // from ever running while the form is invalid.
  it("does not call onSubmit when required fields are empty", () => {
    const onSubmit = vi.fn();

    render(<AddCreatorModal onClose={() => {}} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: /simpan/i }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  // Dates pinned far in the future (not just "next month") so this test does not go flaky
  // as the real clock advances — the component calls validateCreatorForm with the real
  // clock, it has no injectable `today` the way the pure function does.
  it("calls onSubmit with the form data when everything is valid", () => {
    const onSubmit = vi.fn();

    render(<AddCreatorModal onClose={() => {}} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/nama creator/i), { target: { value: "Bagas" } });
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "bagas@example.com" } });
    fireEvent.change(screen.getByLabelText(/mulai kontrak/i), { target: { value: "2099-01-01" } });
    fireEvent.change(screen.getByLabelText(/akhir kontrak/i), { target: { value: "2099-12-31" } });
    fireEvent.change(screen.getByLabelText(/jarak antar-deadline/i), { target: { value: "14" } });
    fireEvent.change(screen.getByLabelText(/fixed rate/i), { target: { value: "500000" } });
    fireEvent.change(screen.getByLabelText(/jumlah konten/i), { target: { value: "6" } });

    fireEvent.click(screen.getByRole("button", { name: /simpan/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Bagas",
      email: "bagas@example.com",
      contractStart: "2099-01-01",
      contractEnd: "2099-12-31",
      interval: 14,
      quota: 6,
      fixedRate: 500000,
    });
  });

  // Manual UI review: fixedRate/quota started at 0, so typing "1" produced "01" — the admin
  // had to delete the leading zero first. Empty + placeholder fixes the typing experience
  // without changing what counts as valid.
  it("starts the fixed rate field empty with a placeholder", () => {
    render(<AddCreatorModal onClose={() => {}} onSubmit={() => {}} />);

    const fixedRateInput = screen.getByLabelText(/fixed rate/i);
    expect(fixedRateInput).toHaveValue(null);
    expect(fixedRateInput).toHaveAttribute("placeholder", "mis. 500000");
  });

  // `loading` is not a prop of AddCreatorModal yet — GREEN adds it and disables Simpan while true.
  it("disables the submit button while loading", () => {
    render(<AddCreatorModal onClose={() => {}} onSubmit={() => {}} loading />);

    expect(screen.getByRole("button", { name: /simpan/i })).toBeDisabled();
  });

  it("closes without submitting when Batal is clicked", () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn();

    render(<AddCreatorModal onClose={onClose} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/nama creator/i), { target: { value: "Bagas" } });
    fireEvent.click(screen.getByRole("button", { name: /batal/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  describe("Simpan disabled state", () => {
    // Dates pinned far in the future for the same reason as the valid-submit test above.
    function fillValidForm() {
      fireEvent.change(screen.getByLabelText(/nama creator/i), { target: { value: "Bagas" } });
      fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "bagas@example.com" } });
      fireEvent.change(screen.getByLabelText(/mulai kontrak/i), { target: { value: "2099-01-01" } });
      fireEvent.change(screen.getByLabelText(/akhir kontrak/i), { target: { value: "2099-12-31" } });
      fireEvent.change(screen.getByLabelText(/jarak antar-deadline/i), { target: { value: "14" } });
      fireEvent.change(screen.getByLabelText(/fixed rate/i), { target: { value: "500000" } });
      fireEvent.change(screen.getByLabelText(/jumlah konten/i), { target: { value: "6" } });
    }

    function simpanButton() {
      return screen.getByRole("button", { name: /simpan/i });
    }

    it("is disabled when the modal first opens with an empty form", () => {
      render(<AddCreatorModal onClose={() => {}} onSubmit={() => {}} />);

      expect(simpanButton()).toBeDisabled();
    });

    it("stays disabled when at least one required field is invalid", () => {
      render(<AddCreatorModal onClose={() => {}} onSubmit={() => {}} />);

      fillValidForm();
      fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "not-an-email" } });

      expect(simpanButton()).toBeDisabled();
    });

    it("becomes enabled once all required fields are valid", () => {
      render(<AddCreatorModal onClose={() => {}} onSubmit={() => {}} />);

      fillValidForm();

      expect(simpanButton()).not.toBeDisabled();
    });

    it("becomes disabled again when a previously valid field is made invalid", () => {
      render(<AddCreatorModal onClose={() => {}} onSubmit={() => {}} />);

      fillValidForm();
      fireEvent.change(screen.getByLabelText(/nama creator/i), { target: { value: "" } });

      expect(simpanButton()).toBeDisabled();
    });

    it("becomes enabled again once the invalid field is corrected", () => {
      render(<AddCreatorModal onClose={() => {}} onSubmit={() => {}} />);

      fillValidForm();
      fireEvent.change(screen.getByLabelText(/nama creator/i), { target: { value: "" } });
      fireEvent.change(screen.getByLabelText(/nama creator/i), { target: { value: "Bagas" } });

      expect(simpanButton()).not.toBeDisabled();
    });

    // `existingEmails` is not a prop of AddCreatorModal yet — GREEN adds it, threading it
    // through to validateCreatorForm the same way `today` already flows for the date rules.
    it("stays disabled when the email is already registered", () => {
      render(
        <AddCreatorModal onClose={() => {}} onSubmit={() => {}} existingEmails={["bagas@example.com"]} />,
      );

      fillValidForm();

      expect(simpanButton()).toBeDisabled();
    });

    // Manual UI review: 0 must not be mistaken for "not filled in yet" — it is a filled-in,
    // invalid value, same treatment as a negative fixed rate.
    it("stays disabled when the fixed rate is zero", () => {
      render(<AddCreatorModal onClose={() => {}} onSubmit={() => {}} />);

      fillValidForm();
      fireEvent.change(screen.getByLabelText(/fixed rate/i), { target: { value: "0" } });

      expect(simpanButton()).toBeDisabled();
    });
  });
});
