import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CropPicker } from './CropPicker';
import type { CatalogCrop } from '../../types/listing';

const baseCatalog: CatalogCrop[] = [
  {
    id: 'crop-apple',
    slug: 'apple',
    commonName: 'Apple',
    scientificName: null,
    category: 'fruit',
    description: null,
  },
  {
    id: 'crop-basil',
    slug: 'basil',
    commonName: 'Basil',
    scientificName: null,
    category: 'herb',
    description: null,
  },
  {
    id: 'crop-zucchini',
    slug: 'zucchini',
    commonName: 'Zucchini',
    scientificName: null,
    category: 'vegetable',
    description: null,
  },
];

describe('CropPicker with grower scarcity signals', () => {
  it('floats scarce crops to the top when no query is active', async () => {
    const user = userEvent.setup();
    render(
      <CropPicker
        catalog={baseCatalog}
        isLoading={false}
        value={null}
        onChange={() => {}}
        scarceCropIds={new Set(['crop-zucchini'])}
      />
    );

    const input = screen.getByRole('combobox');
    await user.click(input);

    const listbox = await screen.findByRole('listbox');
    const options = within(listbox).getAllByRole('option');
    expect(options[0]).toHaveTextContent('Zucchini');
    expect(within(options[0]).getByTestId('needed-nearby-badge')).toBeInTheDocument();
  });

  it('badges a scarce crop even when it stays in alphabetical position', async () => {
    const user = userEvent.setup();
    render(
      <CropPicker
        catalog={baseCatalog}
        isLoading={false}
        value={null}
        onChange={() => {}}
        scarceCropIds={new Set(['crop-basil'])}
      />
    );

    const input = screen.getByRole('combobox');
    await user.click(input);

    const listbox = await screen.findByRole('listbox');
    const basilOption = within(listbox).getByText('Basil').closest('li');
    expect(basilOption).not.toBeNull();
    expect(within(basilOption as HTMLElement).getByTestId('needed-nearby-badge')).toBeInTheDocument();
  });

  it('still prioritizes query prefix matches over scarcity highlighting', async () => {
    const user = userEvent.setup();
    render(
      <CropPicker
        catalog={baseCatalog}
        isLoading={false}
        value={null}
        onChange={() => {}}
        scarceCropIds={new Set(['crop-zucchini'])}
      />
    );

    const input = screen.getByRole('combobox');
    await user.type(input, 'ap');

    const listbox = await screen.findByRole('listbox');
    const options = within(listbox).getAllByRole('option');
    expect(options[0]).toHaveTextContent('Apple');
  });

  it('renders without scarcity props (back-compat with non-grower contexts)', async () => {
    const user = userEvent.setup();
    render(
      <CropPicker catalog={baseCatalog} isLoading={false} value={null} onChange={() => {}} />
    );

    const input = screen.getByRole('combobox');
    await user.click(input);

    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    expect(screen.queryByTestId('needed-nearby-badge')).not.toBeInTheDocument();
  });
});
