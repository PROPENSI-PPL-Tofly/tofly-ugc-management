import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { AddCreatorModal } from "./add-creator-modal";

describe("AddCreatorModal", () => {
  it("renders all the required fields", () => {
    render(<AddCreatorModal onClose={() => {}} onSubmit={() => {}} />);

    expect(screen.getByLabelText(/nama creator/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mulai kontrak/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/akhir kontrak/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/jarak antar-deadline/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/fixed rate/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/jumlah konten/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^platform/i)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Instagram" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "TikTok" })).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
  });

  // The fixed rate is agreed for the whole contract, not paid per content.
  it("labels the fee as the contract's fixed rate", () => {
    render(<AddCreatorModal onClose={() => {}} onSubmit={() => {}} />);

    expect(screen.getByLabelText(/^contract fixed rate \(rp\)/i)).toBeInTheDocument();
    expect(screen.queryByText(/per konten/i)).not.toBeInTheDocument();
  });

  it("groups the creator's identity apart from the contract and schedule fields", () => {
    render(<AddCreatorModal onClose={() => {}} onSubmit={() => {}} />);

    const creator = screen.getByRole("group", { name: "Data Creator" });
    const contract = screen.getByRole("group", { name: "Kontrak & Jadwal" });
    const names = (group: HTMLElement) =>
      Array.from(group.querySelectorAll("label > span:first-child")).map((span) =>
        span.textContent?.replace("*", ""),
      );

    expect(names(creator)).toEqual(["Nama Creator", "Email", "Platform", "Username Social Media"]);
    expect(names(contract)).toEqual([
      "Jenis Kontrak",
      "Contract Fixed Rate (Rp)",
      "Mulai Kontrak",
      "Akhir Kontrak",
      "Jumlah konten yang disepakati",
      "Jarak antar-deadline (hari)",
    ]);
  });

  it("asks for the contract type, probation or regular, with nothing picked yet", () => {
    render(<AddCreatorModal onClose={() => {}} onSubmit={() => {}} />);

    const select = screen.getByLabelText(/jenis kontrak/i);
    expect(select).toHaveValue("");
    expect(
      Array.from(select.querySelectorAll("option")).map((option) => [option.value, option.textContent]),
    ).toEqual([
      ["", "Pilih jenis kontrak"],
      ["probation", "Probation"],
      ["regular", "Regular"],
    ]);
  });

  it("marks every field as required, in the markup and visibly", () => {
    render(<AddCreatorModal onClose={() => {}} onSubmit={() => {}} />);

    for (const label of [
      /nama creator/i,
      /^email/i,
      /^platform/i,
      /username/i,
      /jenis kontrak/i,
      /mulai kontrak/i,
      /akhir kontrak/i,
      /jarak antar-deadline/i,
      /fixed rate/i,
      /jumlah konten/i,
    ]) {
      expect(screen.getByLabelText(label)).toBeRequired();
    }
    expect(screen.getAllByText("*")).toHaveLength(10);
    expect(screen.getByText(/wajib diisi/i)).toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: "bagas@example.com" } });
    fireEvent.change(screen.getByLabelText(/mulai kontrak/i), { target: { value: "2099-01-01" } });
    fireEvent.change(screen.getByLabelText(/akhir kontrak/i), { target: { value: "2099-12-31" } });
    fireEvent.change(screen.getByLabelText(/jarak antar-deadline/i), { target: { value: "14" } });
    fireEvent.change(screen.getByLabelText(/fixed rate/i), { target: { value: "500000" } });
    fireEvent.change(screen.getByLabelText(/jumlah konten/i), { target: { value: "6" } });
    fireEvent.change(screen.getByLabelText(/^platform/i), { target: { value: "instagram" } });
    fireEvent.change(screen.getByLabelText(/jenis kontrak/i), { target: { value: "probation" } });
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "salsa.amelia" } });

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
      socialPlatform: "instagram",
      socialUsername: "salsa.amelia",
      contractType: "probation",
      deadlines: ["2099-01-06", "2099-01-20", "2099-02-03", "2099-02-17", "2099-03-03", "2099-03-17"],
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

  it("starts the content quota field empty with a placeholder", () => {
    render(<AddCreatorModal onClose={() => {}} onSubmit={() => {}} />);

    const quotaInput = screen.getByLabelText(/jumlah konten/i);
    expect(quotaInput).toHaveValue(null);
    expect(quotaInput).toHaveAttribute("placeholder", "mis. 6");
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
      fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: "bagas@example.com" } });
      fireEvent.change(screen.getByLabelText(/mulai kontrak/i), { target: { value: "2099-01-01" } });
      fireEvent.change(screen.getByLabelText(/akhir kontrak/i), { target: { value: "2099-12-31" } });
      fireEvent.change(screen.getByLabelText(/jarak antar-deadline/i), { target: { value: "14" } });
      fireEvent.change(screen.getByLabelText(/fixed rate/i), { target: { value: "500000" } });
      fireEvent.change(screen.getByLabelText(/jumlah konten/i), { target: { value: "6" } });
      fireEvent.change(screen.getByLabelText(/^platform/i), { target: { value: "instagram" } });
      fireEvent.change(screen.getByLabelText(/jenis kontrak/i), { target: { value: "probation" } });
      fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "salsa.amelia" } });
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
      fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: "not-an-email" } });

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

    it("stays disabled when the content quota is zero", () => {
      render(<AddCreatorModal onClose={() => {}} onSubmit={() => {}} />);

      fillValidForm();
      fireEvent.change(screen.getByLabelText(/jumlah konten/i), { target: { value: "0" } });

      expect(simpanButton()).toBeDisabled();
    });

    it("stays disabled when no social platform is selected", () => {
      render(<AddCreatorModal onClose={() => {}} onSubmit={() => {}} />);

      fillValidForm();
      fireEvent.change(screen.getByLabelText(/^platform/i), { target: { value: "" } });

      expect(simpanButton()).toBeDisabled();
    });

    it("stays disabled when the social username is empty", () => {
      render(<AddCreatorModal onClose={() => {}} onSubmit={() => {}} />);

      fillValidForm();
      fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "" } });

      expect(simpanButton()).toBeDisabled();
    });
  });

  // Manual UI review finding: `errors` state was only ever written inside handleSubmit, but
  // handleSubmit is bound to Simpan's onClick — and Simpan is natively `disabled` exactly
  // when the form is invalid, so a disabled button never fires that click. Net effect: no
  // field ever showed an error message, leaving the user with a greyed-out Simpan and no clue
  // why. This cycle makes per-field errors visible on blur, independent of ever pressing Save.
  describe("validation feedback on blur", () => {
    it("shows no validation errors before any field has been touched", () => {
      render(<AddCreatorModal onClose={() => {}} onSubmit={() => {}} />);

      expect(screen.queryByText("Username wajib diisi")).not.toBeInTheDocument();
      expect(screen.queryByText("Nama wajib diisi")).not.toBeInTheDocument();
      expect(screen.queryByText("Format email tidak valid")).not.toBeInTheDocument();
    });

    it("shows the field's error once it is blurred while still invalid", () => {
      render(<AddCreatorModal onClose={() => {}} onSubmit={() => {}} />);

      fireEvent.blur(screen.getByLabelText(/username/i));

      expect(screen.getByText("Username wajib diisi")).toBeInTheDocument();
    });

    it("clears the field's error once it is filled with a valid value", () => {
      render(<AddCreatorModal onClose={() => {}} onSubmit={() => {}} />);

      const usernameInput = screen.getByLabelText(/username/i);
      fireEvent.blur(usernameInput);
      expect(screen.getByText("Username wajib diisi")).toBeInTheDocument();

      fireEvent.change(usernameInput, { target: { value: "salsa.amelia" } });

      expect(screen.queryByText("Username wajib diisi")).not.toBeInTheDocument();
    });

    it("keeps Simpan disabled while other required fields are still invalid, even after a blur reveals one error", () => {
      render(<AddCreatorModal onClose={() => {}} onSubmit={() => {}} />);

      fireEvent.blur(screen.getByLabelText(/username/i));

      expect(screen.getByRole("button", { name: /simpan/i })).toBeDisabled();
    });
  });

  describe("schedule and server feedback", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-09-24T05:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function fillContract(start: string, end: string, quota: string) {
      fireEvent.change(screen.getByLabelText(/mulai kontrak/i), { target: { value: start } });
      fireEvent.change(screen.getByLabelText(/akhir kontrak/i), { target: { value: end } });
      fireEvent.change(screen.getByLabelText(/jumlah konten/i), { target: { value: quota } });
    }

    function fillOthers() {
      fireEvent.change(screen.getByLabelText(/nama creator/i), { target: { value: "Bagas" } });
      fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: "bagas@example.com" } });
      fireEvent.change(screen.getByLabelText(/fixed rate/i), { target: { value: "500000" } });
      fireEvent.change(screen.getByLabelText(/^platform/i), { target: { value: "instagram" } });
      fireEvent.change(screen.getByLabelText(/jenis kontrak/i), { target: { value: "probation" } });
      fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "bagas" } });
    }

    it("stops the date pickers at today and at each other", () => {
      render(<AddCreatorModal onClose={() => {}} onSubmit={() => {}} />);
      const start = screen.getByLabelText(/mulai kontrak/i);
      const end = screen.getByLabelText(/akhir kontrak/i);

      expect(start).toHaveAttribute("min", "2026-09-24");
      expect(start).not.toHaveAttribute("max");
      expect(end).toHaveAttribute("min", "2026-09-24");

      fillContract("2026-10-01", "2026-12-31", "3");

      expect(start).toHaveAttribute("max", "2026-12-31");
      expect(end).toHaveAttribute("min", "2026-10-01");
    });

    it("shows no deadline preview until the contract is complete", () => {
      render(<AddCreatorModal onClose={() => {}} onSubmit={() => {}} />);

      expect(screen.queryByText(/teralokasi/i)).not.toBeInTheDocument();
    });

    it("previews the auto-generated deadlines once the contract is complete", () => {
      render(<AddCreatorModal onClose={() => {}} onSubmit={() => {}} />);
      fillContract("2026-10-01", "2026-12-31", "3");

      expect(screen.getByTestId("deadline-2026-10-06")).toBeInTheDocument();
      expect(screen.getByText(/3 \/ 3 teralokasi/i)).toBeInTheDocument();
    });

    it("asks for the missing deadlines and saves the days the admin picks", () => {
      const onSubmit = vi.fn();
      render(<AddCreatorModal onClose={() => {}} onSubmit={onSubmit} />);
      fillOthers();
      fillContract("2026-10-01", "2026-10-20", "3");

      expect(screen.getByRole("status")).toHaveTextContent(
        "Sisa 1 konten belum punya deadline. Pilih tanggalnya di kalender.",
      );
      expect(screen.getByRole("button", { name: /simpan/i })).toBeDisabled();

      fireEvent.click(screen.getByRole("button", { name: "13 Okt 2026: tambah deadline manual" }));
      fireEvent.click(screen.getByRole("button", { name: /simpan/i }));

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ deadlines: ["2026-10-06", "2026-10-13", "2026-10-20"] }),
      );
    });

    it("lists the manual deadlines and takes one back off", () => {
      render(<AddCreatorModal onClose={() => {}} onSubmit={() => {}} />);
      fillContract("2026-10-01", "2026-10-20", "3");
      fireEvent.click(screen.getByRole("button", { name: "13 Okt 2026: tambah deadline manual" }));

      expect(screen.queryByRole("status")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Hapus deadline manual 13 Okt 2026" }));

      expect(screen.getByRole("status")).toHaveTextContent("Sisa 1 konten");
      expect(screen.queryByRole("button", { name: /hapus deadline manual/i })).not.toBeInTheDocument();
    });

    it("counts contents that share a manual day", () => {
      render(<AddCreatorModal onClose={() => {}} onSubmit={() => {}} />);
      fillContract("2026-10-01", "2026-10-06", "3");
      fireEvent.click(screen.getByRole("button", { name: "6 Okt 2026: lepas deadline otomatis" }));

      for (let pick = 0; pick < 3; pick++) {
        fireEvent.click(screen.getByRole("button", { name: "6 Okt 2026: tambah deadline manual" }));
      }

      expect(screen.getByRole("list", { name: "Deadline manual" })).toHaveTextContent("6 Okt 2026 ×3");
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("frees a content when an auto deadline is removed, and lets the admin pick that day again", () => {
      render(<AddCreatorModal onClose={() => {}} onSubmit={() => {}} />);
      fillOthers();
      fillContract("2026-10-01", "2026-12-31", "3");
      expect(screen.getByRole("button", { name: /simpan/i })).toBeEnabled();

      fireEvent.click(screen.getByRole("button", { name: "6 Okt 2026: lepas deadline otomatis" }));

      expect(screen.getByRole("status")).toHaveTextContent("Sisa 1 konten");
      expect(screen.getByRole("button", { name: /simpan/i })).toBeDisabled();

      fireEvent.click(screen.getByRole("button", { name: "6 Okt 2026: tambah deadline manual" }));

      expect(screen.getByRole("button", { name: /simpan/i })).toBeEnabled();
    });

    it("shows the server's message under each rejected field without waiting for a blur", () => {
      render(
        <AddCreatorModal
          onClose={() => {}}
          onSubmit={() => {}}
          serverErrors={{
            email: "Email sudah terdaftar",
            contractEnd: "Tanggal berakhir tidak boleh sebelum hari ini",
          }}
        />,
      );

      expect(screen.getByText("Email sudah terdaftar")).toBeInTheDocument();
      expect(screen.getByText("Tanggal berakhir tidak boleh sebelum hari ini")).toBeInTheDocument();
    });

    it("drops a field's server message once the admin edits that field", () => {
      render(
        <AddCreatorModal
          onClose={() => {}}
          onSubmit={() => {}}
          serverErrors={{ email: "Email sudah terdaftar", name: "Nama terlalu panjang" }}
        />,
      );

      fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: "baru@example.com" } });

      expect(screen.queryByText("Email sudah terdaftar")).not.toBeInTheDocument();
      expect(screen.getByText("Nama terlalu panjang")).toBeInTheDocument();
    });

    it("shows a fresh set of server messages even for a field edited before", () => {
      const { rerender } = render(
        <AddCreatorModal onClose={() => {}} onSubmit={() => {}} serverErrors={{ email: "Email sudah terdaftar" }} />,
      );
      fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: "lagi@example.com" } });

      rerender(
        <AddCreatorModal onClose={() => {}} onSubmit={() => {}} serverErrors={{ email: "Email sudah terdaftar" }} />,
      );

      expect(screen.getByText("Email sudah terdaftar")).toBeInTheDocument();
    });

    it("shows the server's schedule message as an alert", () => {
      render(
        <AddCreatorModal
          onClose={() => {}}
          onSubmit={() => {}}
          serverErrors={{ deadlines: "Deadline paling cepat 2026-10-06" }}
        />,
      );

      expect(screen.getByRole("alert")).toHaveTextContent("Deadline paling cepat 2026-10-06");
    });

    it("shows a save failure above the actions", () => {
      render(
        <AddCreatorModal onClose={() => {}} onSubmit={() => {}} formError="Creator gagal disimpan. Coba lagi." />,
      );

      expect(screen.getByRole("alert")).toHaveTextContent("Creator gagal disimpan. Coba lagi.");
    });
  });

  it("shows each field's error once it is blurred while still invalid", () => {
    render(<AddCreatorModal onClose={() => {}} onSubmit={() => {}} />);
    fireEvent.change(screen.getByLabelText(/jarak antar-deadline/i), { target: { value: "0" } });

    for (const label of [
      /nama creator/i,
      /^email/i,
      /^platform/i,
      /username/i,
      /jenis kontrak/i,
      /mulai kontrak/i,
      /jarak antar-deadline/i,
      /fixed rate/i,
      /jumlah konten/i,
    ]) {
      fireEvent.blur(screen.getByLabelText(label));
    }

    for (const message of [
      "Nama wajib diisi",
      "Format email tidak valid",
      "Platform wajib dipilih",
      "Username wajib diisi",
      "Jenis kontrak wajib dipilih",
      "Tanggal mulai tidak boleh sebelum hari ini",
      "Jarak antar-deadline minimal 1 hari",
      "Fixed rate harus lebih dari 0",
      "Jumlah konten harus lebih dari 0",
    ]) {
      expect(screen.getByText(message)).toBeInTheDocument();
    }
  });
});
