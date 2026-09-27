import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LogoutButton } from "./logout-button";

const { replace, refresh } = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, refresh }) }));

describe("LogoutButton", () => {
  beforeEach(() => {
    replace.mockReset();
    refresh.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it("posts through the same-origin API proxy and returns to login after logout", async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    render(<LogoutButton />);

    fireEvent.click(screen.getByRole('button', { name: 'Keluar' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    expect(fetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("keeps the user on the page and reports a failed logout", async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 503 }));
    render(<LogoutButton />);

    fireEvent.click(screen.getByRole('button', { name: 'Keluar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Gagal keluar. Coba lagi.');
    expect(replace).not.toHaveBeenCalled();
  });
});
