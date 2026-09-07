import { render, screen } from '@testing-library/react';
import Home from './page';

describe('Home page', () => {
  it('renders the getting-started heading', () => {
    render(<Home />);
    expect(
      screen.getByRole('heading', { name: /to get started, edit the/i }),
    ).toBeInTheDocument();
  });

  it('links to the Next.js docs', () => {
    render(<Home />);
    expect(
      screen.getByRole('link', { name: /documentation/i }),
    ).toHaveAttribute('href', expect.stringContaining('nextjs.org/docs'));
  });
});
