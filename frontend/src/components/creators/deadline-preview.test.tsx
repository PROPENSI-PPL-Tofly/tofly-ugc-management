import { fireEvent, render, screen } from '@testing-library/react'; 
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
  it('marks automatic deadline dates in the monthly calendar', () => {
  // Render the DeadlinePreview component with one automatically generated deadline.
  // In this example, the generated deadline is 25 September 2026.
  render(
    <DeadlinePreview
      autoDeadlines={['2026-09-25']}
      allocatedCount={1}
      remainingCount={0}
      quota={1}
    />,
  );

  // The calendar should show the month that contains the deadline.
  // Because the deadline is 25 September 2026,
  // we expect the calendar heading to display "September 2026".
  expect(
    screen.getByText('September 2026'),
  ).toBeInTheDocument();

  // Find the calendar cell specifically for 25 September 2026.
  // Later, the component will give this date a unique test ID:
  // data-testid="deadline-2026-09-25"
  expect(
    screen.getByTestId('deadline-2026-09-25'),
  ).toHaveTextContent('25');

  // Check that the date is identified as an automatically generated deadline.
  // This will later help us distinguish automatic deadlines
  // from normal calendar dates or manual deadlines.
  expect(
    screen.getByTestId('deadline-2026-09-25'),
  ).toHaveAttribute('data-deadline-type', 'auto');
});
   it('shows the contract month when no automatic deadlines are available', () => { // Test case for rendering the DeadlinePreview component when no automatic deadlines are available
  // No deadline fits inside the contract period.
  render(
    <DeadlinePreview
      contractStart="2026-09-20"
      autoDeadlines={[]}
      allocatedCount={0}
      remainingCount={2}
      quota={2}
    />,
  );

  // The preview should still show the contract month.
  expect(
    screen.getByText('September 2026'),
  ).toBeInTheDocument();

  expect(
    screen.getByText(/0 \/ 2/i),
  ).toBeInTheDocument();

  expect(
    screen.getByText(/2 remaining/i),
  ).toBeInTheDocument();
});
  it('shows automatic deadlines in the next month after navigating forward', () => { // Test case for navigating to the next month in the DeadlinePreview component and checking for automatic deadlines
  render(
    <DeadlinePreview
      contractStart="2026-09-20"
      autoDeadlines={[
        '2026-09-25',
        '2026-10-02',
      ]}
      allocatedCount={2} 
      remainingCount={0}
      quota={2}
    />,
  );

  // The preview starts from September.
  expect(
    screen.getByText('September 2026'),
  ).toBeInTheDocument();

  // Move to the next month.
  fireEvent.click(
    screen.getByRole('button', { name: /next month/i }),
  );

  // The October deadline should now be visible in the calendar.
  expect(
    screen.getByText('October 2026'),
  ).toBeInTheDocument();

  expect(
    screen.getByTestId('deadline-2026-10-02'),
  ).toHaveTextContent('2');
});

});