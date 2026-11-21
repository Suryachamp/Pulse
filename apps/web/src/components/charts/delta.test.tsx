import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Delta } from './delta';

describe('Delta', () => {
  it('shows an increase as good by default', () => {
    render(<Delta current={150} previous={100} />);
    const el = screen.getByText('50.0%').closest('span');
    expect(el).toHaveClass('text-sage');
    expect(screen.getByText(/increase versus previous period/)).toBeInTheDocument();
  });

  it('treats an increase as bad for inverse metrics like refunds', () => {
    render(<Delta current={150} previous={100} inverse />);
    expect(screen.getByText('50.0%').closest('span')).toHaveClass('text-rose');
  });

  it('says when there is nothing to compare against', () => {
    render(<Delta current={10} previous={0} />);
    expect(screen.getByText('No prior data')).toBeInTheDocument();
  });
});
