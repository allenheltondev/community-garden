import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
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
});
