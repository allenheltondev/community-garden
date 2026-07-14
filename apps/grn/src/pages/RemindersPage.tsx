import { SectionHeading } from '@olivias/ui';
import { ReminderPanel } from '../components/Reminders/ReminderPanel';

export function RemindersPage() {
  return (
    <section className="grn-section">
      <SectionHeading
        title="Reminders"
        body="Stay on top of watering, harvests, feeding, and garden check-ins."
      />
      <ReminderPanel />
    </section>
  );
}

export default RemindersPage;
