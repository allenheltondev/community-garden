import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Select, Textarea } from '@olivias/ui';
import type { GardenBed, SunExposure } from '../../types/listing';
import { createMyBed, type UpsertGardenBedRequest } from '../../services/api';

interface BedSelectorProps {
  beds: GardenBed[];
  isLoading: boolean;
  value: string | null;
  onChange: (bedId: string | null) => void;
}

const SUN_OPTIONS: Array<{ value: '' | SunExposure; label: string; emoji: string }> = [
  { value: '', label: 'Not sure yet', emoji: '🌤' },
  { value: 'full_sun', label: 'Full sun (6+ hrs)', emoji: '☀️' },
  { value: 'partial_sun', label: 'Partial sun (4–6 hrs)', emoji: '🌤️' },
  { value: 'partial_shade', label: 'Partial shade (2–4 hrs)', emoji: '⛅' },
  { value: 'full_shade', label: 'Full shade (<2 hrs)', emoji: '🌥️' },
  { value: 'mixed', label: 'Mixed throughout day', emoji: '🌗' },
];

const SUN_LABELS: Record<SunExposure, { label: string; emoji: string }> = {
  full_sun: { label: 'Full sun', emoji: '☀️' },
  partial_sun: { label: 'Partial sun', emoji: '🌤️' },
  partial_shade: { label: 'Partial shade', emoji: '⛅' },
  full_shade: { label: 'Full shade', emoji: '🌥️' },
  mixed: { label: 'Mixed', emoji: '🌗' },
};

export function BedSelector({ beds, isLoading, value, onChange }: BedSelectorProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newBed, setNewBed] = useState<UpsertGardenBedRequest>({
    name: '',
    description: '',
    sunExposure: null,
    soilType: '',
    locationNotes: '',
    lengthInches: null,
    widthInches: null,
  });
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const createBedMutation = useMutation({
    mutationFn: createMyBed,
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['myBeds'] });
      onChange(created.id);
      setIsAdding(false);
      setNewBed({
        name: '',
        description: '',
        sunExposure: null,
        soilType: '',
        locationNotes: '',
        lengthInches: null,
        widthInches: null,
      });
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Could not save the bed');
    },
  });

  const handleSaveNewBed = () => {
    if (!newBed.name.trim()) {
      setError('Give your bed a name so you can find it later.');
      return;
    }
    createBedMutation.mutate({
      ...newBed,
      name: newBed.name.trim(),
      description: newBed.description?.trim() || null,
      soilType: newBed.soilType?.trim() || null,
      locationNotes: newBed.locationNotes?.trim() || null,
      sunExposure: newBed.sunExposure || null,
    });
  };

  return (
    <div className="grn-bed-selector">
      <div className="grn-bed-selector__header">
        <div>
          <h3 className="grn-bed-selector__title">Where will it live?</h3>
          <p className="grn-bed-selector__hint">
            Pick the garden bed it&apos;s going into. You can group plantings later.
          </p>
        </div>
        {!isAdding ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsAdding(true)}
            type="button"
          >
            + New bed
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="grn-bed-selector__loading">Loading your beds…</div>
      ) : (
        <div className="grn-bed-selector__grid">
          <button
            type="button"
            className={`grn-bed-card grn-bed-card--unassigned ${value === null ? 'is-selected' : ''}`.trim()}
            onClick={() => onChange(null)}
            aria-pressed={value === null}
          >
            <span className="grn-bed-card__emoji" aria-hidden="true">🤔</span>
            <span className="grn-bed-card__body">
              <strong>Undecided</strong>
              <span>I&apos;ll figure out where it&apos;s going later</span>
            </span>
          </button>
          {beds.map((bed) => (
            <button
              key={bed.id}
              type="button"
              className={`grn-bed-card ${value === bed.id ? 'is-selected' : ''}`.trim()}
              onClick={() => onChange(bed.id)}
              aria-pressed={value === bed.id}
            >
              <span className="grn-bed-card__emoji" aria-hidden="true">🛏️</span>
              <span className="grn-bed-card__body">
                <strong>{bed.name}</strong>
                <span className="grn-bed-card__meta">
                  {bed.sunExposure ? (
                    <span title={SUN_LABELS[bed.sunExposure].label}>
                      <span aria-hidden="true">{SUN_LABELS[bed.sunExposure].emoji}</span>{' '}
                      {SUN_LABELS[bed.sunExposure].label}
                    </span>
                  ) : null}
                  {bed.lengthInches && bed.widthInches ? (
                    <span>
                      {Math.round(bed.lengthInches / 12)}&prime; × {Math.round(bed.widthInches / 12)}&prime;
                    </span>
                  ) : null}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {isAdding ? (
        <div className="grn-bed-selector__add">
          <h4>Add a new bed</h4>
          <div className="grn-bed-selector__add-grid">
            <Input
              label="Bed name"
              required
              placeholder="South raised bed, Front yard plot…"
              value={newBed.name}
              onChange={(event) => setNewBed((prev) => ({ ...prev, name: event.target.value }))}
            />
            <Select
              label="Sun exposure"
              value={newBed.sunExposure ?? ''}
              onChange={(value) =>
                setNewBed((prev) => ({
                  ...prev,
                  sunExposure: (value || null) as SunExposure | null,
                }))
              }
              options={SUN_OPTIONS.map((option) => ({
                value: option.value,
                label: `${option.emoji}  ${option.label}`,
              }))}
            />
            <Input
              label="Length (inches)"
              type="number"
              placeholder="e.g. 96"
              value={newBed.lengthInches ?? ''}
              onChange={(event) =>
                setNewBed((prev) => ({
                  ...prev,
                  lengthInches: event.target.value ? Number(event.target.value) : null,
                }))
              }
            />
            <Input
              label="Width (inches)"
              type="number"
              placeholder="e.g. 48"
              value={newBed.widthInches ?? ''}
              onChange={(event) =>
                setNewBed((prev) => ({
                  ...prev,
                  widthInches: event.target.value ? Number(event.target.value) : null,
                }))
              }
            />
            <Input
              label="Soil"
              placeholder="raised bed mix, native clay, etc."
              value={newBed.soilType ?? ''}
              onChange={(event) =>
                setNewBed((prev) => ({ ...prev, soilType: event.target.value }))
              }
            />
            <Input
              label="Where is it?"
              placeholder="south side near the porch"
              value={newBed.locationNotes ?? ''}
              onChange={(event) =>
                setNewBed((prev) => ({ ...prev, locationNotes: event.target.value }))
              }
            />
          </div>
          <Textarea
            label="Notes (optional)"
            placeholder="Trellised, drip irrigation, etc."
            rows={2}
            value={newBed.description ?? ''}
            onChange={(event) =>
              setNewBed((prev) => ({ ...prev, description: event.target.value }))
            }
          />
          {error ? <p className="grn-bed-selector__error">{error}</p> : null}
          <div className="grn-bed-selector__actions">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleSaveNewBed}
              disabled={createBedMutation.isPending}
            >
              {createBedMutation.isPending ? 'Saving…' : 'Save bed'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsAdding(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
