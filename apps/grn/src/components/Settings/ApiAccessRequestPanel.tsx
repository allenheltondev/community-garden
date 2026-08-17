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

function latestRequest(requests: ApiAccessRequestItem[]): ApiAccessRequestItem | null {
  return requests[0] ?? null;
}

/**
 * Asking for API access. Keys are approval-gated, so this is the way in: the
 * request goes to the foundation's admins, and once approved the grower
 * creates their own key from the panel below — the secret never travels
 * through an admin console or a Slack channel.
 */
export function ApiAccessRequestPanel() {
  const queryClient = useQueryClient();
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
      await queryClient.invalidateQueries({ queryKey: ['apiAccessRequests'] });
    },
    onError: (error) => {
      setFormError(
        error instanceof Error ? error.message : 'Your request could not be sent.'
      );
    },
  });

  const requests = requestsQuery.data ?? [];
  const current = latestRequest(requests);
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
      setFormError('Tell us what you would use the API for.');
      return;
    }
    mutation.mutate({
      integrationName: integrationName.trim(),
      intendedUse: intendedUse.trim(),
    });
  };

  if (requestsQuery.isPending) {
    return <p className="grn-api-access__status">Checking your API access…</p>;
  }

  return (
    <section className="grn-api-access" aria-labelledby="api-access-heading">
      <h3 id="api-access-heading">API access</h3>

      {approvedUnclaimed ? (
        <p className="grn-api-access__approved" role="status">
          Your API access is approved. Create your key below — you will see the secret once.
        </p>
      ) : null}

      {pending ? (
        <p className="grn-api-access__pending" role="status">
          Your request for <strong>{current?.integrationName}</strong> is with the team. We will
          email you when it is reviewed.
        </p>
      ) : null}

      {current?.status === 'denied' ? (
        <div className="grn-api-access__denied" role="status">
          <p>
            Your last request was not approved
            {current.decisionNote ? `: ${current.decisionNote}` : '.'}
          </p>
          <p>You are welcome to ask again with more detail.</p>
        </div>
      ) : null}

      {hasLiveKey && !pending && !approvedUnclaimed ? (
        <p className="grn-api-access__approved" role="status">
          You have API access. Ask again below if you are building something new.
        </p>
      ) : null}

      {!pending && !approvedUnclaimed ? (
        <>
          <p className="grn-api-access__intro">
            The Good Roots API is open to growers building their own tools. Tell us what you have
            in mind and we will get back to you.
          </p>

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
            label="What would you use the API for?"
            value={intendedUse}
            onChange={(event) => setIntendedUse(event.target.value)}
            placeholder="I want to mirror my harvest log into my own spreadsheet each evening."
            maxLength={2000}
            disabled={mutation.isPending}
            required
          />

          {formError ? (
            <p className="grn-api-access__error" role="alert">
              {formError}
            </p>
          ) : null}

          <Button
            variant="primary"
            size="md"
            onClick={submit}
            loading={mutation.isPending}
            disabled={mutation.isPending}
          >
            Request API access
          </Button>
        </>
      ) : null}
    </section>
  );
}

export default ApiAccessRequestPanel;
