import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

export interface PageHeroProps extends HTMLAttributes<HTMLElement> {
  title: string;
  body: ReactNode;
  aside?: ReactNode;
  actions?: ReactNode;
  titleClassName?: string;
  backgroundImage?: string;
}

export function PageHero({
  title,
  body,
  aside,
  actions,
  className = '',
  titleClassName = '',
  backgroundImage,
  style,
  ...props
}: PageHeroProps) {
  const backgroundImageValue = backgroundImage
    ? (backgroundImage.startsWith('/') ? `url(${backgroundImage})` : backgroundImage)
    : undefined;
  const heroStyle = backgroundImageValue
    ? ({
        ...style,
        ['--og-page-hero-image' as string]: backgroundImageValue,
        ['--page-hero-image' as string]: backgroundImageValue,
      } as CSSProperties)
    : style;

  return (
    <section
      className={`og-page-hero page-hero ${backgroundImage ? 'og-page-hero--background page-hero--background' : ''} ${className}`.trim()}
      style={heroStyle}
      {...props}
    >
      <div className={`og-page-hero__copy page-hero__copy ${backgroundImage ? 'og-page-hero__copy--overlay page-hero__copy--overlay' : ''}`.trim()}>
        <h1 className={`og-page-hero__title ${titleClassName}`.trim()}>{title}</h1>
        <p className="og-page-hero__body page-hero__body">{body}</p>
        {actions ? <div className="og-page-hero__actions page-hero__actions">{actions}</div> : null}
      </div>
      {aside ? <div className="og-page-hero__aside page-hero__aside">{aside}</div> : null}
    </section>
  );
}
