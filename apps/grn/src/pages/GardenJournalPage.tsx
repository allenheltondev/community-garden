import { SectionHeading } from '@olivias/ui';
import { GardenJournalPanel } from '../components/Journal/GardenJournalPanel';

export function GardenJournalPage() {
  return (
    <section className="grn-section">
      <SectionHeading
        title="Garden journal"
        body="Look back on what you planted, tended, harvested, and shared—plus the private moments you chose to save."
      />
      <GardenJournalPanel />
    </section>
  );
}

export default GardenJournalPage;
