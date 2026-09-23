import { fireEvent, render, screen } from '@testing-library/react';
import { DeadlineSlot } from './deadline-slot';

describe('DeadlineSlot', () => {
  it('renders empty slot as a span', () => {
    render(
      <DeadlineSlot
        date="2026-10-13"
        day={13}
        isAutoDeadline={false}
        isBufferDate={false}
      />,
    );

    expect(screen.getByText('13')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders auto deadline slot with indicator', () => {
    render(
      <DeadlineSlot
        date="2026-10-13"
        day={13}
        isAutoDeadline={true}
        isBufferDate={false}
      />,
    );

    expect(screen.getByText('13')).toBeInTheDocument();
    expect(screen.getByTestId('deadline-2026-10-13')).toBeInTheDocument();
  });

  it('renders buffer date as unavailable', () => {
    render(
      <DeadlineSlot
        date="2026-10-13"
        day={13}
        isAutoDeadline={false}
        isBufferDate={true}
      />,
    );

    expect(screen.getByText('13')).toBeInTheDocument();
    expect(screen.getByTestId('calendar-date-2026-10-13')).toBeInTheDocument();
  });

  it('does not render any clickable buttons', () => {
    render(
      <DeadlineSlot
        date="2026-10-13"
        day={13}
        isAutoDeadline={false}
        isBufferDate={false}
      />,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('turns a slot with an action into a button named after it', () => {
    const onClick = vi.fn();
    render(
      <DeadlineSlot
        date="2026-10-13"
        day={13}
        isAutoDeadline={false}
        isBufferDate={false}
        action={{ label: '13 Okt 2026: tambah deadline manual', onClick }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '13 Okt 2026: tambah deadline manual' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('marks a manual deadline and shows how many contents share the day', () => {
    render(
      <DeadlineSlot
        date="2026-10-13"
        day={13}
        isAutoDeadline={false}
        isBufferDate={false}
        manualCount={2}
      />,
    );

    const slot = screen.getByTestId('deadline-2026-10-13');
    expect(slot).toHaveAttribute('data-deadline-type', 'manual');
    expect(slot).toHaveTextContent('13×2');
  });

  it('shows no count for a single manual deadline', () => {
    render(
      <DeadlineSlot
        date="2026-10-13"
        day={13}
        isAutoDeadline={false}
        isBufferDate={false}
        manualCount={1}
      />,
    );

    expect(screen.getByTestId('deadline-2026-10-13')).toHaveTextContent(/^13$/);
  });
});
