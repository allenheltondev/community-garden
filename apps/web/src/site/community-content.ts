// Editable community content surfaced on the public site.
//
// These are intentionally kept in one place so non-engineers can update copy
// and numbers without touching page components. Swap the placeholder
// testimonials below for real, approved quotes, and fill in the manual impact
// numbers as they are tracked.

export type Testimonial = {
  quote: string;
  attribution: string;
  role?: string;
};

// PLACEHOLDER testimonials — replace each quote/attribution with a real,
// approved testimonial before launch. Keep them short (1–2 sentences).
export const testimonials: Testimonial[] = [
  {
    quote:
      'The okra seeds were the first thing my kids ever grew. Watching them eat it straight off the plant is exactly the point.',
    attribution: 'Seed recipient',
    role: 'McKinney, TX',
  },
  {
    quote:
      'A work day here taught me more about raised beds and animal care than a year of reading ever did.',
    attribution: 'Volunteer',
    role: 'Garden work day',
  },
];

export type ManualImpactStat = {
  label: string;
  value: string;
  note?: string;
};

// Date shown alongside manually-tracked numbers so visitors know how current
// they are. Update whenever you refresh the values below.
export const manualImpactStatsAsOf = 'June 2026';

// Manually-tracked impact numbers. Replace the em dashes with real figures as
// they are measured; tiles still render with a clear "as of" caption.
export const manualImpactStats: ManualImpactStat[] = [
  { label: 'Volunteer hours logged', value: '2,733' },
  { label: 'Pounds harvested', value: '36' },
];
