import { Card, Panel, SectionHeading } from '@olivias/ui';
import { ApiKeysPanel } from '../components/Settings/ApiKeysPanel';
import type { UserProfile } from '../types/user';

const membershipLabels = {
  free: 'Free',
  supporter: 'Supporter',
  pro: 'Pro',
} as const;

export interface SettingsPageProps {
  user: UserProfile | null;
}

export function SettingsPage({ user }: SettingsPageProps) {
  return (
    <section className="grn-section">
      <SectionHeading
        title="Settings"
        body="Manage your profile, membership, and programmatic access to Good Roots Network."
      />

      {user ? (
        <div className="grn-settings-grid">
          <Card id="profile" padding="6" className="grn-settings-card">
            <h2>Profile</h2>
            <dl className="grn-settings-details">
              <dt>Name</dt>
              <dd>{user.displayName?.trim() || 'Not provided'}</dd>
              <dt>Email</dt>
              <dd>{user.email || 'Not provided'}</dd>
              <dt>Home zone</dt>
              <dd>{user.growerProfile?.homeZone || 'Not provided'}</dd>
            </dl>
          </Card>

          <Card id="membership" padding="6" className="grn-settings-card">
            <h2>Membership</h2>
            <dl className="grn-settings-details">
              <dt>Plan</dt>
              <dd>{membershipLabels[user.subscription.tier]}</dd>
              <dt>Status</dt>
              <dd>{user.subscription.subscriptionStatus || 'Active'}</dd>
            </dl>
          </Card>
        </div>
      ) : (
        <Panel className="grn-page-error">
          <h2>Profile unavailable</h2>
          <p>Refresh the page to load your profile and membership details.</p>
        </Panel>
      )}

      <div id="api-keys">
        <ApiKeysPanel />
      </div>
    </section>
  );
}

export default SettingsPage;
