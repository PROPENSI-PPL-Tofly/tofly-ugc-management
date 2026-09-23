import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DeadlinePreview from './deadline-preview';

describe('DeadlinePreview', () => { 
  it('shows automatic deadlines and the allocation summary', () => {
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

  // Check that the first automatic deadline is shown in the calendar.
  expect(
    screen.getByTestId('deadline-2026-09-25'),
  ).toHaveTextContent('25');

  // Check the allocation summary using the final Indonesian UI text.
  expect(
    screen.getByText(/2 \/ 4 teralokasi/i),
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
  screen.getByText(/0 \/ 2 teralokasi/i),
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
  it('marks automatic deadline dates with an accent style', () => { // Test case for marking automatic deadline dates with a special style
  render(
    <DeadlinePreview
      contractStart="2026-09-20"
      autoDeadlines={['2026-09-25']}
      allocatedCount={1}
      remainingCount={0}
      quota={1}
    />,
  );

  // Get the automatically generated deadline date.
  const autoDeadline = screen.getByTestId('deadline-2026-09-25');

  // Auto deadlines should have a special style so they stand out.
  expect(autoDeadline).toHaveClass('auto-deadline');
});
  it('marks dates inside the buffer window as unavailable', () => { // Test case for marking dates that fall within the buffer window as unavailable
  render(
    <DeadlinePreview
      contractStart="2026-09-20"
      today="2026-09-20"
      bufferDays={5}
      autoDeadlines={['2026-09-25']}
      allocatedCount={1}
      remainingCount={0}
      quota={1}
    />,
  );

  // 23 September is still inside the 5-day buffer window.
  const bufferDate = screen.getByTestId('calendar-date-2026-09-23');

  expect(bufferDate).toHaveAttribute( 
    'data-date-status', 
    'buffer',
  );

  expect(bufferDate).toHaveClass('buffer-date');
});
  it('starts the calendar from the contract start month', () => { // Test case for ensuring the calendar starts from the contract start month even if the first auto deadline is in the next month
  render(
    <DeadlinePreview
      contractStart="2026-09-30"
      autoDeadlines={['2026-10-05']}
      allocatedCount={1}
      remainingCount={0}
      quota={1}
    />,
  );

  // The preview should start from the contract month,
  // even if the first auto deadline is in the next month.
  expect(
    screen.getByText('September 2026'),
  ).toBeInTheDocument();
});

  it('returns to the previous month without changing the deadline allocation', () => { // Test case for navigating back to the previous month in the DeadlinePreview component and checking that the deadline allocation remains unchanged
    render(
      <DeadlinePreview
        contractStart="2026-09-20"
        autoDeadlines={['2026-09-25', '2026-10-02']}
        allocatedCount={2}
        remainingCount={2}
        quota={4}
      />,
    );

    expect(screen.getByRole('heading', { name: 'September 2026' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /next month/i }));

    expect(screen.getByRole('heading', { name: 'October 2026' })).toBeInTheDocument();
    expect(screen.getByTestId('deadline-2026-10-02')).toHaveTextContent('2');

    fireEvent.click(screen.getByRole('button', { name: /previous month/i }));

    expect(screen.getByRole('heading', { name: 'September 2026' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'October 2026' })).not.toBeInTheDocument();
    expect(screen.getByTestId('deadline-2026-09-25')).toHaveTextContent('25');
    expect(screen.getByTestId('deadline-2026-09-25')).toHaveAttribute('data-deadline-type', 'auto');
    expect(screen.queryByTestId('deadline-2026-10-02')).not.toBeInTheDocument();
    expect(
  screen.getByText(/2 \/ 4 teralokasi/i),
).toBeInTheDocument();
  });

  it('arranges calendar dates under seven weekday columns', () => { // Test case for ensuring that the calendar dates are arranged under seven weekday columns
    render(
      <DeadlinePreview
        contractStart="2026-09-20"
        autoDeadlines={['2026-09-25']}
        allocatedCount={1}
        remainingCount={0}
        quota={1}
      />,
    );

    const calendar = screen.getByRole('table', { // Get the calendar table element by its role and name
      name: 'Deadline calendar September 2026',
    });
    const headers = within(calendar).getAllByRole('columnheader'); // Get all the column header elements within the calendar table
    expect(headers.map((header) => header.textContent)).toEqual([
  'Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab',
]);

    const weekRows = within(calendar).getAllByRole('row').slice(1); // Get all the row elements within the calendar table, excluding the header row
    for (const row of weekRows) { // Iterate through each week row in the calendar
      expect(within(row).getAllByRole('cell')).toHaveLength(7); // Check that each week row contains exactly seven cells, corresponding to the seven days of the week
    }

    const firstWeek = within(weekRows[0]).getAllByRole('cell'); // Get all the cell elements within the first week row of the calendar
    expect(firstWeek.map((cell) => cell.textContent)).toEqual([ // Check that the first week row contains the expected date values, including empty cells for days before the first of the month
      '', '', '1', '2', '3', '4', '5',
    ]);

    const displayedDates = weekRows.flatMap((row) => 
      within(row).getAllByRole('cell').map((cell) => cell.textContent), // Get the text content of all the cells in each week row
    ).filter((text) => text !== ''); // Filter out any empty cells, leaving only the displayed dates in the calendar
    expect(displayedDates).toEqual( 
      Array.from({ length: 30 }, (_, index) => String(index + 1)), // Check that the displayed dates in the calendar match the expected range of dates for September 2026
    );

    const fourthWeek = within(weekRows[3]).getAllByRole('cell'); // Get all the cell elements within the fourth week row of the calendar
    expect(fourthWeek[5]).toContainElement(
      within(calendar).getByTestId('deadline-2026-09-25'),
    );
  });

  it('renders clickable slots for empty dates', () => {
    render(
      <DeadlinePreview
        contractStart="2026-09-23"
        today="2026-09-23"
        bufferDays={7}
        autoDeadlines={['2026-10-07']}
        allocatedCount={1}
        remainingCount={3}
        quota={4}
      />,
    );

    const emptySlots = screen.getAllByRole('button', { name: /^\d+$/ });
    expect(emptySlots.length).toBeGreaterThan(0);
  });

  it('opens assign modal when empty slot clicked', async () => {
    render(
      <DeadlinePreview
        contractStart="2026-09-23"
        today="2026-09-23"
        bufferDays={7}
        autoDeadlines={['2026-10-07']}
        allocatedCount={1}
        remainingCount={3}
        quota={4}
      />,
    );

    const emptySlots = screen.getAllByRole('button', { name: /^\d+$/ });
    await userEvent.click(emptySlots[0]);

    expect(screen.getByRole('dialog', { name: /Tambah Konten/i })).toBeInTheDocument();
  });
});
