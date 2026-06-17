// Editable community content surfaced on the public site.
//
// Testimonials live here so copy can be updated in one place. Impact numbers
// are NOT hardcoded — they are managed in the admin app (Impact section) and
// served by the web API; see components/StatsRow.tsx.

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
