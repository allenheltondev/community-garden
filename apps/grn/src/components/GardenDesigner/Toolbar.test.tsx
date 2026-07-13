import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Toolbar } from './Toolbar';

function renderToolbar(overrides: Partial<ComponentProps<typeof Toolbar>> = {}) {
  const props: ComponentProps<typeof Toolbar> = {
    isMobile: false,
    mode: 'idle',
    onAddBed: vi.fn(),
    onAddAnnotation: vi.fn(),
    onStartDrawingPolygon: vi.fn(),
    onCancelDrawingPolygon: vi.fn(),
    gridSnap: 'off',
    onGridSnapChange: vi.fn(),
    onFitToScreen: vi.fn(),
    canUndo: false,
    canRedo: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onToggleMeasure: vi.fn(),
    ...overrides,
  };
  render(<Toolbar {...props} />);
  return props;
}

describe('Toolbar', () => {
  it('keeps the default raised bed as a prominent direct action', async () => {
    const user = userEvent.setup();
    const onAddBed = vi.fn();
    renderToolbar({ onAddBed });

    const button = screen.getByRole('button', { name: /add a rectangular bed/i });
    expect(button).toHaveClass('grn-designer-toolbar__btn--primary');
    await user.click(button);
    expect(onAddBed).toHaveBeenCalledWith('rect');
  });

  it('offers landmarks from one focused desktop control', async () => {
    const user = userEvent.setup();
    const onAddAnnotation = vi.fn();
    renderToolbar({ onAddAnnotation });

    await user.selectOptions(screen.getByRole('combobox', { name: 'Add a landmark' }), 'compost');
    expect(onAddAnnotation).toHaveBeenCalledWith('compost');
    expect(screen.getByRole('group', { name: 'Add a landmark' })).toBeInTheDocument();
  });
});
