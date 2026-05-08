import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CatalogCrop } from '../../types/listing';
import { CATEGORY_FILTERS, visualForCrop } from './cropVisuals';
import { CropIcon } from './cropIcons';

export interface CropPickerSelection {
  catalogCropId: string | null;
  cropName: string;
  category: string | null;
}

interface CropPickerProps {
  catalog: CatalogCrop[];
  isLoading: boolean;
  value: CropPickerSelection | null;
  onChange: (selection: CropPickerSelection | null) => void;
  /** When true, render a more compact variant (no category chips) */
  compact?: boolean;
}

const MAX_VISIBLE_RESULTS = 8;

function normalizeCategory(category: string | null | undefined): string {
  return (category ?? '').trim().toLowerCase();
}

function categoryMatches(filter: string, category: string | null | undefined): boolean {
  if (filter === 'all') return true;
  const normalized = normalizeCategory(category);
  if (!normalized) return false;
  return normalized === filter || normalized.startsWith(`${filter}`) || normalized.includes(filter);
}

export function CropPicker({ catalog, isLoading, value, onChange, compact }: CropPickerProps) {
  const [query, setQuery] = useState(value?.cropName ?? '');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handler = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const trimmedQuery = query.trim();
  const lowerQuery = trimmedQuery.toLowerCase();

  const matches = useMemo(() => {
    const filtered = catalog.filter((crop) => {
      if (!categoryMatches(activeCategory, crop.category)) return false;
      if (!lowerQuery) return true;
      return (
        crop.commonName.toLowerCase().includes(lowerQuery) ||
        (crop.scientificName?.toLowerCase().includes(lowerQuery) ?? false) ||
        (crop.category?.toLowerCase().includes(lowerQuery) ?? false)
      );
    });
    // Bring exact-prefix matches to the top.
    if (lowerQuery) {
      filtered.sort((a, b) => {
        const aStarts = a.commonName.toLowerCase().startsWith(lowerQuery) ? 0 : 1;
        const bStarts = b.commonName.toLowerCase().startsWith(lowerQuery) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return a.commonName.localeCompare(b.commonName);
      });
    }
    return filtered.slice(0, MAX_VISIBLE_RESULTS);
  }, [catalog, activeCategory, lowerQuery]);

  const exactMatch = useMemo(() => {
    if (!trimmedQuery) return null;
    const lower = trimmedQuery.toLowerCase();
    return catalog.find((crop) => crop.commonName.toLowerCase() === lower) ?? null;
  }, [catalog, trimmedQuery]);

  const showCustomOption =
    trimmedQuery.length > 0 &&
    !exactMatch &&
    matches.every((crop) => crop.commonName.toLowerCase() !== trimmedQuery.toLowerCase());

  const totalOptions = matches.length + (showCustomOption ? 1 : 0);

  const handleSelectCatalog = (crop: CatalogCrop) => {
    onChange({
      catalogCropId: crop.id,
      cropName: crop.commonName,
      category: crop.category,
    });
    setQuery(crop.commonName);
    setIsOpen(false);
  };

  const handleSelectCustom = () => {
    if (!trimmedQuery) return;
    onChange({
      catalogCropId: null,
      cropName: trimmedQuery,
      category: null,
    });
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setQuery('');
    setIsOpen(true);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIsOpen(true);
      setHighlightIndex((idx) => (totalOptions === 0 ? 0 : (idx + 1) % totalOptions));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIsOpen(true);
      setHighlightIndex((idx) =>
        totalOptions === 0 ? 0 : (idx - 1 + totalOptions) % totalOptions
      );
    } else if (event.key === 'Enter') {
      if (!isOpen || totalOptions === 0) return;
      event.preventDefault();
      if (highlightIndex < matches.length) {
        handleSelectCatalog(matches[highlightIndex]);
      } else if (showCustomOption) {
        handleSelectCustom();
      }
    } else if (event.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const selectedVisual = value
    ? visualForCrop(value.cropName, value.category)
    : null;

  return (
    <div className="grn-crop-picker" ref={containerRef}>
      <label htmlFor={inputId} className="grn-crop-picker__label">
        What are you growing?
      </label>
      <p className="grn-crop-picker__hint">
        Start typing — we&apos;ll search the catalog. Don&apos;t see it? You can add a custom crop.
      </p>

      {!compact ? (
        <div className="grn-crop-picker__chips" role="tablist" aria-label="Filter crop catalog by category">
          {CATEGORY_FILTERS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              role="tab"
              aria-selected={activeCategory === chip.id}
              className={`grn-crop-chip ${activeCategory === chip.id ? 'is-active' : ''}`.trim()}
              onClick={() => {
                setActiveCategory(chip.id);
                setHighlightIndex(0);
              }}
            >
              <span aria-hidden="true">{chip.emoji}</span>
              <span>{chip.label}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="grn-crop-picker__field">
        {value ? (
          <span className="grn-crop-picker__leading" aria-hidden="true">
            <span
              className="grn-crop-picker__leading-emoji"
              style={{ background: `${selectedVisual?.accent ?? '#69874b'}1f` }}
            >
              {selectedVisual ? (
                <CropIcon iconKey={selectedVisual.iconKey} color={selectedVisual.accent} size="1.4rem" />
              ) : null}
            </span>
          </span>
        ) : (
          <span className="grn-crop-picker__leading" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path
                fill="currentColor"
                d="M10 4a6 6 0 0 1 4.74 9.7l4.78 4.79-1.4 1.41-4.79-4.78A6 6 0 1 1 10 4Zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"
              />
            </svg>
          </span>
        )}
        <input
          id={inputId}
          className="grn-crop-picker__input"
          type="search"
          autoComplete="off"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            isOpen && totalOptions > 0 ? `${listboxId}-opt-${highlightIndex}` : undefined
          }
          placeholder={isLoading ? 'Loading catalog…' : 'Tomato, basil, raspberry…'}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
            setHighlightIndex(0);
            // Typing invalidates a previous catalog selection if it diverges.
            if (value && event.target.value.trim() !== value.cropName) {
              onChange(null);
            }
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
        />
        {value ? (
          <button
            type="button"
            className="grn-crop-picker__clear"
            onClick={handleClear}
            aria-label="Clear crop selection"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4L13.4 12 19 6.4 17.6 5 12 10.6 6.4 5Z"
              />
            </svg>
          </button>
        ) : null}
      </div>

      {value ? (
        <div className="grn-crop-picker__selected" role="status" aria-live="polite">
          <strong>{value.cropName}</strong>
          {value.catalogCropId ? (
            <span className="grn-crop-picker__pill grn-crop-picker__pill--catalog">From catalog</span>
          ) : (
            <span className="grn-crop-picker__pill grn-crop-picker__pill--custom">Custom crop</span>
          )}
        </div>
      ) : null}

      {isOpen && (matches.length > 0 || showCustomOption) ? (
        <ul
          className="grn-crop-picker__listbox"
          role="listbox"
          id={listboxId}
        >
          {matches.map((crop, index) => {
            const visual = visualForCrop(crop.commonName, crop.category);
            const isHighlighted = index === highlightIndex;
            return (
              <li
                key={crop.id}
                id={`${listboxId}-opt-${index}`}
                role="option"
                aria-selected={isHighlighted}
                className={`grn-crop-picker__option ${isHighlighted ? 'is-highlighted' : ''}`.trim()}
                onMouseEnter={() => setHighlightIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  handleSelectCatalog(crop);
                }}
              >
                <span
                  className="grn-crop-picker__option-emoji"
                  aria-hidden="true"
                  style={{ background: `${visual.accent}1f` }}
                >
                  <CropIcon iconKey={visual.iconKey} color={visual.accent} size="1.3rem" />
                </span>
                <span className="grn-crop-picker__option-text">
                  <span className="grn-crop-picker__option-name">{crop.commonName}</span>
                  <span className="grn-crop-picker__option-meta">
                    {crop.category ? <span>{crop.category}</span> : null}
                    {crop.scientificName ? <em>{crop.scientificName}</em> : null}
                  </span>
                </span>
              </li>
            );
          })}
          {showCustomOption ? (
            <li
              id={`${listboxId}-opt-${matches.length}`}
              role="option"
              aria-selected={highlightIndex === matches.length}
              className={`grn-crop-picker__option grn-crop-picker__option--custom ${
                highlightIndex === matches.length ? 'is-highlighted' : ''
              }`.trim()}
              onMouseEnter={() => setHighlightIndex(matches.length)}
              onMouseDown={(event) => {
                event.preventDefault();
                handleSelectCustom();
              }}
            >
              <span className="grn-crop-picker__option-emoji" aria-hidden="true">
                ➕
              </span>
              <span className="grn-crop-picker__option-text">
                <span className="grn-crop-picker__option-name">
                  Add &ldquo;{trimmedQuery}&rdquo; as a custom crop
                </span>
                <span className="grn-crop-picker__option-meta">
                  Heirloom, family variety, mystery — anything goes
                </span>
              </span>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
