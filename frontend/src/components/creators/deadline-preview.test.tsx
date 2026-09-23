import { render, screen } from '@testing-library/react';
import DeadlinePreview from './deadline-preview';

describe('DeadlinePreview', () => { 
  it('shows automatic deadlines and the allocation summary', () => { // Test case for rendering the DeadlinePreview component with automatic deadlines and allocation summary
    render(
      <DeadlinePreview
        autoDeadlines={[
          '2026-09-25',
          '2026-10-02',
        ]}
        allocatedCount={2}
        remainingCount={2}
        quota={4}
      />,
    );

    expect(
      screen.getByText('2026-09-25'),
    ).toBeInTheDocument();

    expect(
      screen.getByText('2026-10-02'),
    ).toBeInTheDocument();

    expect(
      screen.getByText(/2 \/ 4/i),
    ).toBeInTheDocument();

    expect(
      screen.getByText(/2 remaining/i),
    ).toBeInTheDocument();
  });
});