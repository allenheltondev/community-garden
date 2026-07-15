import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListingForm } from './ListingForm';
import type { CatalogCrop } from '../../types/listing';

const crops: CatalogCrop[] = [
  {
    id: 'crop-1',
    slug: 'tomato',
    commonName: 'Tomato',
    scientificName: null,
    category: 'fruit',
    description: null,
  },
];

describe('ListingForm', () => {
  it('shows validation errors for required fields', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <ListingForm
        mode="create"
        crops={crops}
        varieties={[]}
        isLoadingVarieties={false}
        isSubmitting={false}
        isOffline={false}
        submitError={null}
        onCropChange={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    await user.click(screen.getByRole('button', { name: /review share/i }));

    expect(await screen.findByText(/title is required/i)).toBeInTheDocument();
    expect(screen.getByText(/crop is required/i)).toBeInTheDocument();
    expect(screen.getByText(/quantity is required/i)).toBeInTheDocument();
    expect(screen.getByText(/latitude is required/i)).toBeInTheDocument();
    expect(screen.getByText(/longitude is required/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('prefills from quick pick selection', async () => {
    const user = userEvent.setup();
    const onCropChange = vi.fn();

    render(
      <ListingForm
        mode="create"
        crops={crops}
        varieties={[]}
        quickPickOptions={[
          {
            id: 'grower-crop-1',
            label: 'Patio Tomatoes',
            cropId: 'crop-1',
            defaultUnit: 'kg',
            suggestedTitle: 'Patio Tomatoes',
          },
        ]}
        isLoadingVarieties={false}
        isSubmitting={false}
        isOffline={false}
        submitError={null}
        onCropChange={onCropChange}
        onSubmit={vi.fn()}
      />
    );

    await user.selectOptions(screen.getByLabelText(/share something you already grow/i), 'grower-crop-1');

    expect(screen.getByLabelText(/share title/i)).toHaveValue('Patio Tomatoes');
    expect(screen.getByLabelText(/crop/i)).toHaveValue('crop-1');
    expect(screen.getByLabelText(/unit/i)).toHaveValue('kg');
    expect(onCropChange).toHaveBeenCalledWith('crop-1');
  });

  it('prefills an editable draft from a saved harvest', async () => {
    const user = userEvent.setup();

    render(
      <ListingForm
        mode="create"
        crops={crops}
        varieties={[]}
        quickPickOptions={[
          {
            id: 'grower-crop-1',
            label: 'Patio Tomatoes',
            cropId: 'crop-1',
            defaultUnit: 'lb',
            suggestedTitle: 'Patio Tomatoes',
          },
        ]}
        prefill={{
          quickPickId: 'grower-crop-1',
          quantity: '3.5',
          unit: 'lb',
          sourceLabel: 'your saved harvest',
        }}
        isLoadingVarieties={false}
        isSubmitting={false}
        isOffline={false}
        submitError={null}
        onCropChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByLabelText(/share something you already grow/i)).toHaveValue('grower-crop-1');
    expect(screen.getByLabelText(/share title/i)).toHaveValue('Patio Tomatoes');
    expect(screen.getByLabelText(/quantity/i)).toHaveValue(3.5);
    expect(screen.getByText(/prefilled from your saved harvest/i)).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/quantity/i));
    await user.type(screen.getByLabelText(/quantity/i), '4');
    expect(screen.getByLabelText(/quantity/i)).toHaveValue(4);
  });

  it('submits valid payload when required fields are complete', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <ListingForm
        mode="create"
        crops={crops}
        varieties={[]}
        isLoadingVarieties={false}
        isSubmitting={false}
        isOffline={false}
        submitError={null}
        onCropChange={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    await user.type(screen.getByLabelText(/share title/i), 'Fresh Tomatoes');
    await user.selectOptions(screen.getByLabelText(/crop/i), 'crop-1');
    await user.type(screen.getByLabelText(/quantity/i), '4.5');
    await user.type(screen.getByLabelText(/latitude/i), '37.7');
    await user.type(screen.getByLabelText(/longitude/i), '-122.4');

    await user.click(screen.getByRole('button', { name: /review share/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: /ready to share/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /confirm and share/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Fresh Tomatoes',
        cropId: 'crop-1',
        quantityTotal: 4.5,
        lat: 37.7,
        lng: -122.4,
        status: 'active',
      })
    );
  });

  it('prevents submit while offline and shows offline message', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <ListingForm
        mode="create"
        crops={crops}
        varieties={[]}
        isLoadingVarieties={false}
        isSubmitting={false}
        isOffline
        submitError={null}
        onCropChange={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    expect(screen.getByText(/you are offline/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/share title/i), 'Fresh Tomatoes');
    await user.selectOptions(screen.getByLabelText(/crop/i), 'crop-1');
    await user.type(screen.getByLabelText(/quantity/i), '4.5');
    await user.type(screen.getByLabelText(/latitude/i), '37.7');
    await user.type(screen.getByLabelText(/longitude/i), '-122.4');

    expect(screen.getByRole('button', { name: /review share/i })).toBeDisabled();

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
