import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { CatalogCrop } from '../../types/listing';
import { QuickAddCrop } from './QuickAddCrop';

const catalog: CatalogCrop[] = [
  {
    id: 'crop-tomato',
    slug: 'tomato',
    commonName: 'Tomato',
    scientificName: null,
    category: 'vegetable',
    description: null,
  },
];

function renderQuickAdd(onAdd: (input: unknown) => Promise<void> | void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // Pre-seed the catalog so the picker is populated without a network call.
  queryClient.setQueryData(['catalogCrops'], catalog);
  return render(
    <QueryClientProvider client={queryClient}>
      <QuickAddCrop onAdd={onAdd as never} />
    </QueryClientProvider>
  );
}

describe('QuickAddCrop', () => {
  it('adds the picked crop with an optional count and then clears the field', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn().mockResolvedValue(undefined);
    renderQuickAdd(onAdd);

    const input = screen.getByRole('combobox');
    await user.type(input, 'Tomato');
    await user.click(await screen.findByRole('option', { name: /tomato/i }));

    await user.type(screen.getByLabelText(/number of plants/i), '6');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith({
        cropName: 'Tomato',
        canonicalId: 'crop-tomato',
        category: 'vegetable',
        plantCount: 6,
      })
    );

    // Field resets so the grower can drop in another crop immediately.
    await waitFor(() =>
      expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('')
    );
  });

  it('blocks submit until a crop is selected', async () => {
    const onAdd = vi.fn();
    renderQuickAdd(onAdd);
    expect(screen.getByRole('button', { name: /^add$/i })).toBeDisabled();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('keeps the selection and surfaces an error when the add fails', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn().mockRejectedValue(new Error('Could not save your crop'));
    renderQuickAdd(onAdd);

    const input = screen.getByRole('combobox');
    await user.type(input, 'Tomato');
    await user.click(await screen.findByRole('option', { name: /tomato/i }));
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save your crop');
    expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('Tomato');
  });
});
