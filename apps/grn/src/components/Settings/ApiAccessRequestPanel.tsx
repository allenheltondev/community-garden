import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Textarea } from '@olivias/ui';
import {
  createApiAccessRequest,
  listApiAccessRequests,
  type ApiAccessRequestItem,
} from '../../services/api';
import { createLogger } from '../../utils/logging';

const logger = createLogger('api-access-request');

function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

/**
 * Where a grower asks for API access and then watches for an answer.
 *
 * The form stays behind a button: most people arriving at this page are
 * looking at the keys they already have, and an open form implies filling it
 * in is the expected next step.
 */
export function ApiAccessRequestPanel() {
  const queryClient = useQueryClient();
  const [isRequesting, setIsRequesting] = useState(false);
  const [integrationName, setIntegrationName] = useState('');
  const [intendedUse, setIntendedUse] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const requestsQuery = useQuery({
    queryKey: ['apiAccessRequests'],
    queryFn: listApiAccessRequests,
    staleTime: 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: createApiAccessRequest,
    onSuccess: async () => {
      logger.info('API access requested');
      setIntegrationName('');
      setIntendedUse('');
      setFormError(null);
      setIsRequesting(false);
      await queryClient.invalidateQueries({ queryKey: ['apiAccessRequests'] });
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : 'Your request could not be sent.');
    },
  });

  const requests = requestsQuery.data ?? [];
  const current: ApiAccessRequestItem | null = requests[0] ?? null;
  const pending = current?.status === 'pending';
  const approvedUnclaimed = requests.some(
    (request) => request.status === 'approved' && !request.apiKeyId
  );
  const hasLiveKey = requests.some(
    (request) => request.status === 'approved' && request.apiKeyId
  );

  const submit = () => {
    if (!integrationName.trim()) {
      setFormError('Tell us what you are building.');
      return;
    }
    if (!intendedUse.trim()) {
      setFormError('Tell us why you need a key.');
      return;
    }
    mutation.mutate({
      integrationName: integrationName.trim(),
      intendedUse: intendedUse.trim(),
    });
  };

  const cancel = () => {
    setIsRequesting(false);
    setFormError(null);
    setIntegrationName('');
    setIntendedUse('');
  };

  if (requestsQuery.isPending) {
    return <p className="grn-api-access__status">Checking your API access…</p>;
  }

  // Nothing to ask for while a decision is outstanding: the status is the
  // whole point of the page until it changes.
  if (pending && current) {
    return (
      <section className="grn-api-access" aria-labelledby="api-access-heading">
        <h2 id="api-access-heading">Your request</h2>
        <p className="grn-api-access__pending" role="status">
          <strong>Pending review</strong> — you asked for a key for{' '}
          <strong>{current.integrationName}</strong> on {formatDate(current.createdAt)}. We will let
          you know as soon as it has been looked at.
        </p>
        <p className="grn-api-access__intro">{current.intendedUse}</p>
      </section>
    );
  }

  return (
    <section className="grn-api-access" aria-labelledby="api-access-heading">
      <h2 id="api-access-heading">API access</h2>

      {approvedUnclaimed ? (
        <p className="grn-api-access__approved" role="status">
          <strong>Approved</strong> — create your key below. You will see the secret once.
        </p>
      ) : null}

      {current?.status === 'denied' ? (
        <div className="grn-api-access__denied" role="status">
          <p>
            <strong>Not approved</strong>
            {current.decisionNote ? `: ${current.decisionNote}` : '.'}
          </p>
          <p>You are welcome to ask again with more detail.</p>
        </div>
      ) : null}

      {hasLiveKey && !approvedUnclaimed ? (
        <p className="grn-api-access__approved" role="status">
          You have API access. Ask again if you are building something new.
        </p>
      ) : null}

      {isRequesting ? (
        <>
          <Input
            label="What are you building?"
            type="text"
            value={integrationName}
            onChange={(event) => setIntegrationName(event.target.value)}
            placeholder="Harvest spreadsheet sync"
            maxLength={120}
            disabled={mutation.isPending}
            required
          />

          <Textarea
            label="Why do you need a key?"
            value={intendedUse}
            onChange={(event) => setIntendedUse(event.target.value)}
            placeholder="Tell us about your project — what you want to read or write, and how often. The more you tell us, the quicker this is to review."
            maxLength={2000}
            disabled={mutation.isPending}
            required
          />

          {formError ? (
            <p className="grn-api-access__error" role="alert">
              {formError}
            </p>
          ) : null}

          <div className="grn-api-access__actions">
            <Button
              variant="primary"
              size="md"
              onClick={submit}
              loading={mutation.isPending}
              disabled={mutation.isPending}
            >
              Send request
            </Button>
            <Button variant="ghost" size="md" onClick={cancel} disabled={mutation.isPending}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <>
          {!approvedUnclaimed ? (
            <p className="grn-api-access__intro">
              Keys are issued by request so we know who is building on the API. Tell us about your
              project and we will get back to you.
            </p>
          ) : null}

          {!approvedUnclaimed ? (
            <Button variant="primary" size="md" onClick={() => setIsRequesting(true)}>
              Request a key
            </Button>
          ) : null}
        </>
      )}
    </section>
  );
}

export default ApiAccessRequestPanel;
