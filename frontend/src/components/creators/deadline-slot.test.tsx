import { render, screen } from '@testing-library/react';
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
});
