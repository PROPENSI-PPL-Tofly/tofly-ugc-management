import {
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { AddContentModal } from "./add-content-modal";
import { createContent } from "@/lib/contents";

vi.mock("@/lib/contents", () => ({
    createContent: vi.fn(),
}));

vi.mock("@/lib/creator-form", () => ({
    localCalendarDay: vi.fn(() => "2026-09-25"),
}));

vi.mock("@/lib/deadline-schedule", () => ({
    getBufferWindow: vi.fn(() => ({
        firstAllowedDate: new Date("2026-09-30T00:00:00Z"),
        lastAllowedDate: new Date("2026-12-31T00:00:00Z"),
    })),
}));

const mockedCreateContent = vi.mocked(createContent);

const defaultProps = {
    contractId: "22222222-2222-4222-8222-222222222222",
    evergreenCount: 1,
    quota: 6,
    contractStart: "2026-06-10",
    contractEnd: "2026-12-07",
    onClose: vi.fn(),
    onSaved: vi.fn(),
};

function openModal(
    overrides: Partial<typeof defaultProps> = {},
) {
    render(
        <AddContentModal
            {...defaultProps}
            {...overrides}
        />,
    );
}

describe("AddContentModal", () => {
    beforeEach(() => {
        mockedCreateContent.mockReset();
        defaultProps.onClose.mockReset();
        defaultProps.onSaved.mockReset();
    });

    it("renders Evergreen by default with only the deadline field", () => {
        openModal();

        expect(
            screen.getByRole("dialog", { name: "Tambah Konten" }),
        ).toBeInTheDocument();

        expect(screen.getByLabelText("Jenis Konten")).toHaveValue(
            "evergreen",
        );

        expect(
            screen.queryByLabelText("Nama Konten"),
        ).toBeNull();

        expect(screen.queryByLabelText("Brief")).toBeNull();

        expect(screen.getByLabelText("Deadline")).toHaveValue(
            "2026-09-30",
        );
    });

    it("shows Name and Brief when Specific is selected", () => {
        openModal();

        fireEvent.change(screen.getByLabelText("Jenis Konten"), {
            target: { value: "specific" },
        });

        expect(
            screen.getByLabelText("Nama Konten"),
        ).toBeInTheDocument();

        expect(
            screen.getByLabelText("Brief"),
        ).toBeInTheDocument();
    });

    it("stacks Name above Brief in the same single column as the other fields", () => {
        openModal();

        fireEvent.change(screen.getByLabelText("Jenis Konten"), {
            target: { value: "specific" },
        });

        const fieldOf = (label: string) =>
            screen.getByLabelText(label).closest("label")!.parentElement!;
        const name = fieldOf("Nama Konten");
        const brief = fieldOf("Brief");

        expect(name.parentElement).toBe(fieldOf("Deadline").parentElement);
        expect(brief.parentElement).toBe(name.parentElement);
        expect(
            name.compareDocumentPosition(brief) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });

    it("limits Name to 100 and Brief to 2000 characters, like the API", () => {
        openModal();

        fireEvent.change(screen.getByLabelText("Jenis Konten"), {
            target: { value: "specific" },
        });

        expect(screen.getByLabelText("Nama Konten")).toHaveAttribute(
            "maxlength",
            "100",
        );
        expect(screen.getByLabelText("Brief")).toHaveAttribute(
            "maxlength",
            "2000",
        );
    });

    it("counts the characters used against each limit", () => {
        openModal();

        fireEvent.change(screen.getByLabelText("Jenis Konten"), {
            target: { value: "specific" },
        });

        const name = screen.getByLabelText("Nama Konten");
        const brief = screen.getByLabelText("Brief");

        expect(name).toHaveAccessibleDescription("0/100 karakter");
        expect(brief).toHaveAccessibleDescription("0/2000 karakter");

        fireEvent.change(name, { target: { value: "Promo" } });
        expect(name).toHaveAccessibleDescription("5/100 karakter");

        fireEvent.change(name, { target: { value: "n".repeat(100) } });
        fireEvent.change(brief, { target: { value: "b".repeat(2000) } });
        expect(name).toHaveAccessibleDescription("100/100 karakter");
        expect(brief).toHaveAccessibleDescription("2000/2000 karakter");
    });

    it("hides Name and Brief again when Evergreen is selected", () => {
        openModal();

        fireEvent.change(screen.getByLabelText("Jenis Konten"), {
            target: { value: "specific" },
        });

        fireEvent.change(screen.getByLabelText("Jenis Konten"), {
            target: { value: "evergreen" },
        });

        expect(
            screen.queryByLabelText("Nama Konten"),
        ).toBeNull();

        expect(screen.queryByLabelText("Brief")).toBeNull();
    });

    it("disables Evergreen when its quota is full", () => {
        openModal({
            evergreenCount: 6,
            quota: 6,
        });

        const evergreenOption = screen.getByRole("option", {
            name: "Evergreen",
        });

        expect(evergreenOption).toBeDisabled();

        expect(
            screen.getByText("Kuota Evergreen sudah terpenuhi."),
        ).toBeInTheDocument();
        expect(screen.queryByText(/Pilih Specific/)).toBeNull();
    });

    it("keeps Evergreen available when the quota is zero", () => {
        openModal({
            evergreenCount: 0,
            quota: 0,
        });

        const evergreenOption = screen.getByRole("option", {
            name: "Evergreen",
        });

        expect(evergreenOption).not.toBeDisabled();
    });

    it("requires Name and Brief for Specific content", () => {
        openModal();

        fireEvent.change(screen.getByLabelText("Jenis Konten"), {
            target: { value: "specific" },
        });

        fireEvent.click(
            screen.getByRole("button", { name: "Simpan" }),
        );

        expect(
            screen.getByText("Nama konten wajib diisi"),
        ).toBeInTheDocument();

        expect(
            screen.getByText("Brief wajib diisi"),
        ).toBeInTheDocument();

        expect(mockedCreateContent).not.toHaveBeenCalled();
    });

    it("rejects a deadline before the allowed buffer window", () => {
        openModal();

        fireEvent.change(screen.getByLabelText("Deadline"), {
            target: { value: "2026-09-29" },
        });

        fireEvent.click(
            screen.getByRole("button", { name: "Simpan" }),
        );

        expect(
            screen.getByText("Deadline paling cepat 2026-09-30"),
        ).toBeInTheDocument();

        expect(mockedCreateContent).not.toHaveBeenCalled();
    });

    it("rejects a deadline after the contract end", () => {
        openModal();

        fireEvent.change(screen.getByLabelText("Deadline"), {
            target: { value: "2026-12-08" },
        });

        fireEvent.click(
            screen.getByRole("button", { name: "Simpan" }),
        );

        expect(
            screen.getByText(
                "Deadline tidak boleh setelah akhir kontrak",
            ),
        ).toBeInTheDocument();

        expect(mockedCreateContent).not.toHaveBeenCalled();
    });

    it("saves a valid Specific content", async () => {
        mockedCreateContent.mockResolvedValue({
            ok: true,
            content: {
                id: "content-1",
                name: "Video Review",
                type: "specific",
                brief: "Review brief",
                deadline: "2026-10-05",
                status: "scheduled",
            },
        });

        openModal();

        fireEvent.change(screen.getByLabelText("Jenis Konten"), {
            target: { value: "specific" },
        });

        fireEvent.change(screen.getByLabelText("Nama Konten"), {
            target: { value: "Video Review" },
        });

        fireEvent.change(screen.getByLabelText("Brief"), {
            target: { value: "Review brief" },
        });

        fireEvent.change(screen.getByLabelText("Deadline"), {
            target: { value: "2026-10-05" },
        });

        fireEvent.click(
            screen.getByRole("button", { name: "Simpan" }),
        );

        await waitFor(() => {
            expect(mockedCreateContent).toHaveBeenCalledWith({
                contractId:
                    "22222222-2222-4222-8222-222222222222",
                type: "specific",
                name: "Video Review",
                brief: "Review brief",
                deadline: "2026-10-05",
            });
        });

        expect(defaultProps.onSaved).toHaveBeenCalledTimes(1);
        expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });

    it("saves Evergreen without manual Name or Brief", async () => {
        mockedCreateContent.mockResolvedValue({
            ok: true,
            content: {
                id: "content-2",
                name: "Evg_2_Rangga_Pratama_2026-10-05",
                type: "evergreen",
                brief: "",
                deadline: "2026-10-05",
                status: "scheduled",
            },
        });

        openModal({
            evergreenCount: 1,
            quota: 6,
        });

        fireEvent.change(screen.getByLabelText("Deadline"), {
            target: { value: "2026-10-05" },
        });

        fireEvent.click(
            screen.getByRole("button", { name: "Simpan" }),
        );

        await waitFor(() => {
            expect(mockedCreateContent).toHaveBeenCalledWith({
                contractId:
                    "22222222-2222-4222-8222-222222222222",
                type: "evergreen",
                name: undefined,
                brief: undefined,
                deadline: "2026-10-05",
            });
        });

        expect(defaultProps.onSaved).toHaveBeenCalledTimes(1);
        expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });

    it("shows server-side field errors", async () => {
        mockedCreateContent.mockResolvedValue({
            ok: false,
            message: "Data content tidak valid",
            errors: {
                name: "Nama konten sudah digunakan",
                deadline: "Deadline paling cepat 2026-10-10",
            },
        });

        openModal();

        fireEvent.change(screen.getByLabelText("Jenis Konten"), {
            target: { value: "specific" },
        });

        fireEvent.change(screen.getByLabelText("Nama Konten"), {
            target: { value: "Duplicate" },
        });

        fireEvent.change(screen.getByLabelText("Brief"), {
            target: { value: "Some brief" },
        });

        fireEvent.change(screen.getByLabelText("Deadline"), {
            target: { value: "2026-10-05" },
        });

        fireEvent.click(
            screen.getByRole("button", { name: "Simpan" }),
        );

        expect(
            await screen.findByText(
                "Nama konten sudah digunakan",
            ),
        ).toBeInTheDocument();

        expect(
            screen.getByText(
                "Deadline paling cepat 2026-10-10",
            ),
        ).toBeInTheDocument();

        expect(defaultProps.onSaved).not.toHaveBeenCalled();
        expect(defaultProps.onClose).not.toHaveBeenCalled();
    });

    it("preserves the server quota error as an alert", async () => {
        mockedCreateContent.mockResolvedValue({
            ok: false,
            message: "Data content tidak valid",
            errors: {
                quota: "Kuota content sudah penuh",
            },
        });

        openModal();

        fireEvent.click(
            screen.getByRole("button", { name: "Simpan" }),
        );

        expect(
            await screen.findByRole("alert"),
        ).toHaveTextContent(
            "Kuota content sudah penuh",
        );
    });

    it("shows a contract error from the server as an alert", async () => {
        mockedCreateContent.mockResolvedValue({
            ok: false,
            message: "Data content tidak valid",
            errors: {
                contractId: "Kontrak wajib dipilih",
            },
        });

        openModal();

        fireEvent.click(
            screen.getByRole("button", { name: "Simpan" }),
        );

        expect(
            await screen.findByRole("alert"),
        ).toHaveTextContent("Kontrak wajib dipilih");
    });

    it("shows the saving state while the request is pending", async () => {
        let resolveRequest:
            | ((value: {
            ok: true;
            content: {
                id: string;
                name: string;
                type: "evergreen" | "specific";
                brief: string;
                deadline: string;
                status: string;
            };
        }) => void)
            | undefined;

        mockedCreateContent.mockReturnValue(
            new Promise((resolve) => {
                resolveRequest = resolve;
            }),
        );

        openModal();

        fireEvent.click(
            screen.getByRole("button", { name: "Simpan" }),
        );

        expect(
            screen.getByRole("button", {
                name: "Menyimpan...",
            }),
        ).toBeDisabled();

        expect(
            screen.getByRole("button", {
                name: "Batal",
            }),
        ).toBeDisabled();

        expect(
            screen.getByLabelText("Deadline"),
        ).toBeDisabled();

        resolveRequest?.({
            ok: true,
            content: {
                id: "content-3",
                name: "Evg_3_Rangga_Pratama_2026-10-10",
                type: "evergreen",
                brief: "",
                deadline: "2026-10-10",
                status: "scheduled",
            },
        });

        await waitFor(() => {
            expect(defaultProps.onSaved).toHaveBeenCalledTimes(1);
        });
    });
});