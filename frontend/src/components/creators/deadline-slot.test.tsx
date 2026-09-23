import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeadlineSlot } from './deadline-slot';

describe('DeadlineSlot', () => {
  it('renders empty slot for unassigned date', () => {
    render(
      <DeadlineSlot
        date="2026-10-13"
        day={13}
        isAutoDeadline={false}
        isBufferDate={false}
        onAssign={vi.fn()}
      />,
    );

    expect(screen.getByText('13')).toBeInTheDocument();
    expect(screen.queryByText('Auto')).not.toBeInTheDocument();
  });

  it('renders auto deadline slot with indicator', () => {
    render(
      <DeadlineSlot
        date="2026-10-13"
        day={13}
        isAutoDeadline={true}
        isBufferDate={false}
        onAssign={vi.fn()}
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
        onAssign={vi.fn()}
      />,
    );

    expect(screen.getByText('13')).toBeInTheDocument();
    expect(screen.getByTestId('calendar-date-2026-10-13')).toBeInTheDocument();
  });

  it('calls onAssign when empty slot clicked', async () => {
    const onAssign = vi.fn();
    render(
      <DeadlineSlot
        date="2026-10-13"
        day={13}
        isAutoDeadline={false}
        isBufferDate={false}
        onAssign={onAssign}
      />,
    );

    await userEvent.click(screen.getByText('13'));
    expect(onAssign).toHaveBeenCalledWith('2026-10-13');
  });

  it('does not call onAssign when auto deadline clicked', async () => {
    const onAssign = vi.fn();
    render(
      <DeadlineSlot
        date="2026-10-13"
        day={13}
        isAutoDeadline={true}
        isBufferDate={false}
        onAssign={onAssign}
      />,
    );

    await userEvent.click(screen.getByTestId('deadline-2026-10-13'));
    expect(onAssign).not.toHaveBeenCalled();
  });

  it('does not call onAssign when buffer date clicked', async () => {
    const onAssign = vi.fn();
    render(
      <DeadlineSlot
        date="2026-10-13"
        day={13}
        isAutoDeadline={false}
        isBufferDate={true}
        onAssign={onAssign}
      />,
    );

    await userEvent.click(screen.getByTestId('calendar-date-2026-10-13'));
    expect(onAssign).not.toHaveBeenCalled();
  });
});
