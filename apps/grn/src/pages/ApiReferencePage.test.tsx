import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// The real getApiEndpoint throws when VITE_API_URL is unset, which is the case
// under test. Mocking it also pins the value the page is expected to render.
vi.mock('../config/amplify', () => ({
  getApiEndpoint: () => 'https://api.test.example/api',
}));

import { ApiReferencePage } from './ApiReferencePage';
import reference from '../generated/apiReference.json';

function renderPage() {
  return render(
    <MemoryRouter>
      <ApiReferencePage />
    </MemoryRouter>
  );
}

describe('ApiReferencePage', () => {
  it('lists the endpoints a key holder can call', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'API reference' })).toBeInTheDocument();
    // A grower who just got a key needs to see real paths, not a promise of docs.
    expect(screen.getByText('/catalog/crops')).toBeInTheDocument();
    // A path with several methods renders once per operation.
    expect(screen.getAllByText('/me/api-keys').length).toBeGreaterThan(0);
  });

  it('marks the endpoints that need no key at all', () => {
    renderPage();

    const publicBadges = screen.getAllByText('No auth');
    const publicOperations = reference.operations.filter((operation) => !operation.requiresAuth);
    expect(publicBadges).toHaveLength(publicOperations.length);
    expect(publicOperations.length).toBeGreaterThan(0);
  });

  it('groups endpoints under the area they belong to, not their modifiers', () => {
    renderPage();

    // "Idempotent" and "Pro" describe an operation; they must not become
    // sections of their own or every area would be scattered across them.
    expect(screen.getByRole('heading', { name: 'Catalog' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Idempotent' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pro' })).not.toBeInTheDocument();
  });

  it('filters as you search and says so when nothing matches', async () => {
    const user = userEvent.setup();
    renderPage();

    const search = screen.getByRole('searchbox', { name: /search endpoints/i });

    await user.type(search, 'listings');
    expect(screen.getByRole('status')).toHaveTextContent(/endpoints? match/);
    expect(screen.queryByText('/reminders')).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'definitely-not-an-endpoint');
    expect(screen.getByRole('status')).toHaveTextContent('No endpoints match that search.');
  });

  it('documents the endpoints added since the spec was last updated', () => {
    renderPage();

    // These shipped ahead of the spec; the reference is only useful to a new
    // key holder if the newest surface area is actually in it.
    expect(screen.getAllByText('/me/api-access-requests').length).toBeGreaterThan(0);
    expect(screen.getByText('/gardens/{token}')).toBeInTheDocument();
    expect(screen.getByText('/journal')).toBeInTheDocument();
  });

  it('shows path parameters and response codes for an endpoint', () => {
    renderPage();

    const sharedGarden = screen.getByText('/gardens/{token}').closest('li');
    expect(sharedGarden).not.toBeNull();
    const scope = within(sharedGarden as HTMLElement);
    expect(scope.getByText('Parameters')).toBeInTheDocument();
    expect(scope.getByText('token')).toBeInTheDocument();
    expect(scope.getByText('Responses')).toBeInTheDocument();
    expect(scope.getByText('404')).toBeInTheDocument();
  });
  it('shows the response type, not just the status code', () => {
    // The generator records a shape for every response; rendering only the
    // status left that data stranded in apiReference.json, so a key holder
    // could not see what an endpoint actually returns.
    renderPage();

    // That path has both a GET and a POST, so pick the endpoint by method.
    const listRequests = screen
      .getAllByText('/me/api-access-requests')
      .map((node) => node.closest('li'))
      .find((item) => item?.textContent?.startsWith('GET'));
    expect(listRequests).toBeTruthy();
    expect(
      within(listRequests as HTMLElement).getByText('ApiAccessRequestListResponse')
    ).toBeInTheDocument();
  });

  it('documents the journal note fields the handler actually requires', () => {
    // handlers/journal.rs requires occurredOn and title and treats body as
    // optional. A client built from the earlier schema sent {body} and was
    // rejected at deserialization — the exact failure docs exist to prevent.
    const note = reference.operations.find(
      (operation) => operation.path === '/journal/notes' && operation.method === 'POST'
    );
    expect(note?.requestBody?.shape).toBe('CreateNoteRequest');
  });
  it('gives multiword groups an ARIA-safe id that actually resolves', () => {
    // aria-labelledby is IDREFS, so "tag-API Access" is read as two references
    // — tag-API and Access — and neither exists. Single-word tags hid this, so
    // assert on a multiword one.
    const { container } = renderPage();

    const section = container.querySelector('.grn-api-reference__group[aria-labelledby="tag-api-access"]');
    expect(section).not.toBeNull();
    expect(section?.getAttribute('aria-labelledby')).not.toContain(' ');

    // The reference must resolve to the heading that names the section.
    const headingId = section?.getAttribute('aria-labelledby') as string;
    const heading = container.querySelector(`#${headingId}`);
    expect(heading?.textContent).toBe('API Access');
  });

  it('publishes the base URL so a request can be built from this page alone', () => {
    renderPage();

    // Relative paths are useless without the host; the page reads it from the
    // same config the app uses for its own calls.
    expect(screen.getByText('Base URL')).toBeInTheDocument();
    expect(screen.getByText('https://api.test.example/api')).toBeInTheDocument();
  });

  it('documents the Idempotency-Key header the note handler demands', () => {
    // create_note returns 400 without it, so a request assembled from the
    // contract would fail by design if the header were left undocumented.
    const note = reference.operations.find(
      (operation) => operation.path === '/journal/notes' && operation.method === 'POST'
    );
    const header = note?.parameters.find((p) => p.name === 'Idempotency-Key');
    expect(header?.in).toBe('header');
    expect(header?.required).toBe(true);
  });

  it('documents the photo key that links an upload to a note', () => {
    renderPage();

    const upload = screen.getByText('/journal/photo-upload-url').closest('li');
    expect(within(upload as HTMLElement).getByText('PhotoUploadIntent')).toBeInTheDocument();
  });

  it('documents the admin status filter and its pending default', () => {
    const queue = reference.operations.find(
      (operation) => operation.path === '/admin/api-access-requests'
    );
    const status = queue?.parameters.find((p) => p.name === 'status');
    expect(status?.in).toBe('query');
    // Omitting it does not mean "all" — the handler defaults to pending.
    expect(status?.description).toMatch(/defaults to `pending`/i);
  });
});
