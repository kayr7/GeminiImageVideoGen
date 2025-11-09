import React from 'react';
import { render, screen } from '@testing-library/react';
import LoadingSpinner from '@/components/shared/LoadingSpinner';

describe('LoadingSpinner Component', () => {
  it('should render spinner', () => {
    render(<LoadingSpinner />);
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('should render with message', () => {
    render(<LoadingSpinner message="Loading data..." />);
    expect(screen.getByText('Loading data...')).toBeInTheDocument();
  });

  it('should render without message', () => {
    render(<LoadingSpinner />);
    const message = screen.queryByRole('paragraph');
    expect(message).not.toBeInTheDocument();
  });

  it('should apply small size', () => {
    render(<LoadingSpinner size="sm" />);
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toHaveClass('h-4');
  });

  it('should apply medium size by default', () => {
    render(<LoadingSpinner />);
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toHaveClass('h-8');
  });

  it('should apply large size', () => {
    render(<LoadingSpinner size="lg" />);
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toHaveClass('h-12');
  });
});

