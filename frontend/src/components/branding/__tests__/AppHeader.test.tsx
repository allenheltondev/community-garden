import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppHeader } from '../AppHeader';

describe('AppHeader', () => {
  it('should render logo', () => {
    const { container } = render(<AppHeader />);

    const logo = container.querySelector('img[alt="Good Roots Network logo"]') ||
                 container.querySelector('[role="img"][aria-label="Good Roots Network logo"]');
    expect(logo).toBeTruthy();
  });

  it('should render menu button when showMenu is true', () => {
    render(<AppHeader showMenu={true} onMenuClick={vi.fn()} />);

    const menuButton = screen.getByLabelText('Open menu');
    expect(menuButton).toBeInTheDocument();
  });

  it('should not render menu button when showMenu is false', () => {
    render(<AppHeader showMenu={false} />);

    const menuButton = screen.queryByLabelText('Open menu');
    expect(menuButton).not.toBeInTheDocument();
  });

  it('should call onMenuClick when menu button is clicked', () => {
    const onMenuClick = vi.fn();
    render(<AppHeader showMenu={true} onMenuClick={onMenuClick} />);

    const menuButton = screen.getByLabelText('Open menu');
    menuButton.click();

    expect(onMenuClick).toHaveBeenCalledOnce();
  });

  it('should render user menu placeholder', () => {
    const { container } = render(<AppHeader />);

    // Check for user icon SVG
    const userIcon = container.querySelector('svg[fill="currentColor"]');
    expect(userIcon).toBeTruthy();
  });
});
