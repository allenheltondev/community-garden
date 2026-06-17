import { useEffect, useState } from 'react';
import { Button, Card, FormFeedback, Input, SectionHeading } from '@olivias/ui';
import {
  listImpactMetrics,
  saveImpactMetrics,
  type ImpactMetricInput,
} from '../api';
import type { AdminSession } from '../auth/session';

export interface ImpactPageProps {
  session: AdminSession;
}

type EditableMetric = {
  key: string;
  label: string;
  value: string;
  caption: string;
};

let rowCounter = 0;
function emptyRow(): EditableMetric {
  rowCounter += 1;
  return { key: `row-${rowCounter}`, label: '', value: '', caption: '' };
}

export function ImpactPage({ session }: ImpactPageProps) {
  const [rows, setRows] = useState<EditableMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    listImpactMetrics(session.accessToken)
      .then((metrics) => {
        if (!active) return;
        setRows(
          metrics.map((metric) => ({
            key: metric.id,
            label: metric.label,
            value: metric.value,
            caption: metric.caption ?? '',
          })),
        );
        setError(null);
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message || 'Unable to load impact metrics.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session.accessToken]);

  const updateRow = (key: string, patch: Partial<EditableMetric>) => {
    setSavedAt(null);
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const removeRow = (key: string) => {
    setSavedAt(null);
    setRows((current) => current.filter((row) => row.key !== key));
  };

  const moveRow = (index: number, direction: -1 | 1) => {
    setSavedAt(null);
    setRows((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const addRow = () => {
    setSavedAt(null);
    setRows((current) => [...current, emptyRow()]);
  };

  const handleSave = async () => {
    setError(null);
    setSavedAt(null);

    const metrics: ImpactMetricInput[] = [];
    for (const row of rows) {
      const label = row.label.trim();
      const value = row.value.trim();
      const caption = row.caption.trim();
      if (!label || !value) {
        setError('Every metric needs both a label and a value. Remove empty rows or fill them in.');
        return;
      }
      metrics.push({ label, value, caption: caption || null });
    }

    setSaving(true);
    try {
      const saved = await saveImpactMetrics(session.accessToken, metrics);
      setRows(
        saved.map((metric) => ({
          key: metric.id,
          label: metric.label,
          value: metric.value,
          caption: metric.caption ?? '',
        })),
      );
      setSavedAt(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save impact metrics.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="admin-section">
      <div className="admin-section__header">
        <SectionHeading
          eyebrow="Impact"
          title="Impact metrics"
          body="These numbers appear on the public site's impact section alongside live Okra map figures. The label is the description, the value is what's shown big (e.g. 2,733), and the optional caption sits underneath (e.g. as of June 2026)."
        />
        <Button className="admin-refresh-action" variant="outline" size="sm" onClick={addRow} disabled={loading}>
          Add metric
        </Button>
      </div>

      {error ? <FormFeedback tone="error">{error}</FormFeedback> : null}
      {savedAt ? <FormFeedback tone="success">{`Saved at ${savedAt}.`}</FormFeedback> : null}

      {loading ? (
        <p className="admin-muted">Loading impact metrics…</p>
      ) : (
        <>
          {rows.length === 0 ? (
            <Card>
              <p className="admin-muted">
                No impact metrics yet. Add one to show a number on the public impact section.
              </p>
            </Card>
          ) : (
            <div className="admin-impact-list">
              {rows.map((row, index) => (
                <Card key={row.key} className="admin-impact-row">
                  <div className="admin-impact-row__fields">
                    <Input
                      label="Label"
                      placeholder="Volunteer hours logged"
                      value={row.label}
                      onChange={(event) => updateRow(row.key, { label: event.target.value })}
                    />
                    <Input
                      label="Value"
                      placeholder="2,733"
                      value={row.value}
                      onChange={(event) => updateRow(row.key, { value: event.target.value })}
                    />
                    <Input
                      label="Caption (optional)"
                      placeholder="as of June 2026"
                      value={row.caption}
                      onChange={(event) => updateRow(row.key, { caption: event.target.value })}
                    />
                  </div>
                  <div className="admin-impact-row__actions">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => moveRow(index, -1)}
                      disabled={index === 0}
                      aria-label="Move up"
                    >
                      ↑
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => moveRow(index, 1)}
                      disabled={index === rows.length - 1}
                      aria-label="Move down"
                    >
                      ↓
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => removeRow(row.key)}>
                      Remove
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}

          <div className="admin-impact-save">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
