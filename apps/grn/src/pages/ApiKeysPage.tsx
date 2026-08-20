import { Link } from 'react-router-dom';
import { SectionHeading } from '@olivias/ui';
import { ApiAccessRequestPanel } from '../components/Settings/ApiAccessRequestPanel';
import { ApiKeysPanel } from '../components/Settings/ApiKeysPanel';

/**
 * A page of its own rather than a strip inside Settings: asking for access,
 * waiting on a decision, and managing the resulting keys is a journey with
 * state, and burying it under a profile form made the pending state easy to
 * miss.
 */
export function ApiKeysPage() {
  return (
    <section className="grn-section grn-api-keys-page">
      <SectionHeading
        title="API keys"
        body="Build your own tools on top of your garden. A key acts as you, so treat it like a password."
      />

      <p className="grn-api-keys-page__reference">
        New to the API? The <Link to="/settings/api-keys/reference">API reference</Link> lists
        every endpoint, what it returns, and which ones need no key at all.
      </p>

      <ApiAccessRequestPanel />
      <ApiKeysPanel />
    </section>
  );
}

export default ApiKeysPage;
