import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import RouteCard from '@/components/RouteCard';
import { silkRoadRoute } from '@/lib/mock-routes';

describe('RouteCard', () => {
  it('renders route name and description', () => {
    render(<RouteCard route={silkRoadRoute} />);
    expect(screen.getByText('丝绸之路')).toBeInTheDocument();
    expect(screen.getByText(/长安/)).toBeInTheDocument();
  });

  it('renders point count and updated date', () => {
    render(<RouteCard route={silkRoadRoute} />);
    expect(screen.getByText('7 个地点')).toBeInTheDocument();
  });

  it('links to map with route id', () => {
    render(<RouteCard route={silkRoadRoute} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/map?route=preset-silk-road');
  });
});
