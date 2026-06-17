import { useEffect, useState } from 'react';
import { Section } from '../chrome';
import { webApiBase } from '../routes';

type Testimonial = {
  id: string;
  quote: string;
  attribution: string;
  role: string | null;
  sortOrder: number;
};

/**
 * Testimonials — admin-managed quotes served by the web API and shown on the
 * home page. Renders nothing until quotes load (or if there are none), so the
 * section never appears empty.
 */
export function Testimonials() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);

  useEffect(() => {
    let active = true;

    fetch(`${webApiBase}/testimonials`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { items?: Testimonial[] } | null) => {
        if (active && data?.items) {
          setTestimonials(data.items);
        }
      })
      .catch(() => {
        // Testimonials are best-effort; the section simply stays hidden.
      });

    return () => {
      active = false;
    };
  }, []);

  if (testimonials.length === 0) {
    return null;
  }

  return (
    <Section title="In their words" className="section-testimonials">
      <div className="home-testimonials">
        {testimonials.map((testimonial) => (
          <figure className="home-testimonial" key={testimonial.id}>
            <blockquote className="home-testimonial__quote">{testimonial.quote}</blockquote>
            <figcaption className="home-testimonial__attribution">
              {testimonial.attribution}
              {testimonial.role ? <span className="home-testimonial__role">{testimonial.role}</span> : null}
            </figcaption>
          </figure>
        ))}
      </div>
    </Section>
  );
}
