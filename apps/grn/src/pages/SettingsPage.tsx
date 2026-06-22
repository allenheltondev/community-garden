import { SectionHeading } from '@olivias/ui';
import { ApiKeysPanel } from '../components/Settings/ApiKeysPanel';

export function SettingsPage() {
  return (
    <section className="grn-section">
      <SectionHeading
        title="Settings"
        body="Manage your account and programmatic access to Good Roots Network."
      />
      <ApiKeysPanel />
    </section>
  );
}

export default SettingsPage;
