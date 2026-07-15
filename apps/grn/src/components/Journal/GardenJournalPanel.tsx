import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { v4 as uuidv4 } from 'uuid';
import { Button, Card, Panel } from '@olivias/ui';
import { PlantLoader } from '../branding/PlantLoader';
import {
  createJournalNote,
  deleteJournalNote,
  getGardenJournal,
  requestJournalPhotoUpload,
  uploadJournalPhoto,
  type CreateJournalNoteRequest,
  type JournalEntry,
} from '../../services/api';

const CURRENT_YEAR = new Date().getFullYear();
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const KIND_LABELS: Record<JournalEntry['kind'], string> = {
  planned: 'Planned',
  planted: 'Planted',
  garden: 'Garden',
  harvest: 'Harvest',
  reminder: 'Tended',
  share: 'Shared',
  note: 'Private note',
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function readSeason(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 2000 && parsed <= CURRENT_YEAR
    ? parsed
    : CURRENT_YEAR;
}

function formatEntryDate(value: string): string {
  const dateOnly = value.length === 10 ? `${value}T12:00:00Z` : value;
  const parsed = new Date(dateOnly);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, []);
  return isOnline;
}

export function GardenJournalPanel() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [season, setSeason] = useState(() => readSeason(searchParams.get('season')));
  const [occurredOn, setOccurredOn] = useState(todayIsoDate);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const idempotencyKey = useRef(uuidv4());
  const uploadedPhotoKey = useRef<string | null>(null);
  const isOnline = useOnlineStatus();

  const journalQuery = useQuery({
    queryKey: ['gardenJournal', season],
    queryFn: () => getGardenJournal(season),
    staleTime: 60_000,
    networkMode: 'offlineFirst',
  });

  const noteMutation = useMutation({
    mutationFn: async (payload: CreateJournalNoteRequest) => {
      let photoKey: string | undefined;
      if (photo) {
        if (!uploadedPhotoKey.current) {
          const intent = await requestJournalPhotoUpload(photo);
          await uploadJournalPhoto(intent, photo);
          uploadedPhotoKey.current = intent.photoKey;
        }
        photoKey = uploadedPhotoKey.current;
      }
      return createJournalNote({ ...payload, photoKey }, idempotencyKey.current);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['gardenJournal'] });
      setTitle('');
      setBody('');
      setPhoto(null);
      setOccurredOn(todayIsoDate());
      setFormError(null);
      idempotencyKey.current = uuidv4();
      uploadedPhotoKey.current = null;
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : 'Could not save that note.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteJournalNote,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['gardenJournal'] }),
  });

  const changeSeason = (nextSeason: number) => {
    setSeason(nextSeason);
    const next = new URLSearchParams(searchParams);
    next.set('season', String(nextSeason));
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    setSeason(readSeason(searchParams.get('season')));
  }, [searchParams]);

  const saveNote = () => {
    if (!title.trim()) {
      setFormError('Give this note a short title.');
      return;
    }
    if (!isOnline) {
      setFormError('Reconnect before saving a private note or photo.');
      return;
    }
    if (photo && (!PHOTO_TYPES.includes(photo.type) || photo.size > MAX_PHOTO_BYTES)) {
      setFormError('Choose a JPEG, PNG, or WebP photo no larger than 5 MB.');
      return;
    }
    setFormError(null);
    noteMutation.mutate({
      occurredOn,
      title: title.trim(),
      body: body.trim() || undefined,
    });
  };

  const removeNote = (entry: JournalEntry) => {
    if (!isOnline) return;
    if (!window.confirm(`Delete “${entry.title}”?`)) return;
    deleteMutation.mutate(entry.sourceId);
  };

  if (journalQuery.isLoading && !journalQuery.data) {
    return (
      <Panel className="grn-page-status">
        <PlantLoader size="md" />
        <p>Gathering your {season} season…</p>
      </Panel>
    );
  }

  if (journalQuery.isError && !journalQuery.data) {
    return (
      <Panel className="grn-page-status">
        <p className="grn-page-status__error">
          {isOnline
            ? 'Your garden journal could not be loaded right now.'
            : 'Reconnect to load this season for the first time.'}
        </p>
        <Button variant="secondary" onClick={() => void journalQuery.refetch()} disabled={!isOnline}>
          Try again
        </Button>
      </Panel>
    );
  }

  const journal = journalQuery.data;
  if (!journal) return null;

  return (
    <div className="grn-journal">
      <div className="grn-journal__season" aria-label="Choose journal season">
        <Button variant="secondary" onClick={() => changeSeason(season - 1)} disabled={season <= 2000}>
          Previous year
        </Button>
        <h2>{season} season</h2>
        <Button
          variant="secondary"
          onClick={() => changeSeason(season + 1)}
          disabled={season >= CURRENT_YEAR}
        >
          Next year
        </Button>
      </div>

      {!isOnline ? (
        <p className="grn-journal__offline" role="status">
          You are viewing the latest season loaded in this session. Notes and photos are read-only
          until you reconnect.
        </p>
      ) : null}

      <Card className="grn-journal__summary">
        <div>
          <h2>Your season, in recorded facts</h2>
          <p>{journal.summary.explanation}</p>
        </div>
        <dl>
          <div><dt>Plantings</dt><dd>{journal.summary.plantedCount}</dd></div>
          <div><dt>Harvest days</dt><dd>{journal.summary.harvestCount}</dd></div>
          <div><dt>Care tasks completed</dt><dd>{journal.summary.reminderCompletionCount}</dd></div>
          <div><dt>Food handoffs</dt><dd>{journal.summary.completedShareCount}</dd></div>
          <div><dt>Shared before expiry</dt><dd>{journal.summary.foodSharedBeforeExpiryCount}</dd></div>
          <div><dt>Active months</dt><dd>{journal.summary.activeMonthCount}</dd></div>
        </dl>
        <p className="grn-journal__privacy">
          Private to you. This summary comes from your saved garden activity—not a score, ranking,
          or AI estimate.
        </p>
      </Card>

      <Card className="grn-journal__note-form">
        <div>
          <h2>Add a private moment</h2>
          <p>Capture what the records cannot: a lesson, observation, or photo from the garden.</p>
        </div>
        <div className="grn-journal__form-grid">
          <label>
            <span>Date</span>
            <input type="date" value={occurredOn} onChange={(event) => setOccurredOn(event.target.value)} />
          </label>
          <label>
            <span>Title</span>
            <input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="What happened?" />
          </label>
          <label className="grn-journal__wide">
            <span>Note (optional)</span>
            <textarea value={body} maxLength={2000} onChange={(event) => setBody(event.target.value)} rows={3} />
          </label>
          <label className="grn-journal__wide">
            <span>Photo (optional, JPEG, PNG, or WebP up to 5 MB)</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                setPhoto(event.target.files?.[0] ?? null);
                uploadedPhotoKey.current = null;
              }}
            />
          </label>
        </div>
        {formError ? <p className="grn-page-status__error" role="alert">{formError}</p> : null}
        <Button variant="primary" onClick={saveNote} disabled={!isOnline || noteMutation.isPending}>
          {noteMutation.isPending ? 'Saving…' : 'Save private note'}
        </Button>
      </Card>

      <section className="grn-journal__timeline" aria-labelledby="journal-timeline-title">
        <h2 id="journal-timeline-title">Season timeline</h2>
        {journal.entries.length === 0 ? (
          <Panel className="grn-journal__empty">
            <h3>Your first season entry starts here.</h3>
            <p>Plant something, create a garden bed, or save a private note to begin the story.</p>
            <div>
              <Button variant="primary" onClick={() => navigate('/garden/plants/new')}>Add a plant</Button>
              <Button variant="secondary" onClick={() => navigate('/garden')}>Open garden map</Button>
            </div>
          </Panel>
        ) : (
          <ol>
            {journal.entries.map((entry) => (
              <li key={entry.id}>
                <article className="grn-journal-entry">
                  <div className="grn-journal-entry__meta">
                    <span>{KIND_LABELS[entry.kind] ?? 'Garden'}</span>
                    <time dateTime={entry.occurredAt}>{formatEntryDate(entry.occurredAt)}</time>
                    {entry.isPrivate ? <span>Private</span> : null}
                  </div>
                  <h3>{entry.title}</h3>
                  {entry.detail ? <p>{entry.detail}</p> : null}
                  {entry.photoUrl ? <img src={entry.photoUrl} alt={`Garden journal: ${entry.title}`} loading="lazy" /> : null}
                  <div className="grn-journal-entry__actions">
                    {entry.sourcePath ? <Link to={entry.sourcePath}>Open source</Link> : null}
                    {entry.manual ? (
                      <Button variant="ghost" size="sm" onClick={() => removeNote(entry)} disabled={!isOnline || deleteMutation.isPending}>
                        Delete note
                      </Button>
                    ) : null}
                  </div>
                </article>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

export default GardenJournalPanel;
