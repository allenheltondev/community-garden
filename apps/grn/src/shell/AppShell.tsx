import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { AvatarMenu, SiteFooter, SiteHeader } from '@olivias/ui';
import { brandConfig } from '../config/brand';
import { useAuth } from '../hooks/useAuth';
import type { UserProfile } from '../types/user';

const NAV_EXPANDED_STORAGE_KEY = 'og-grn-nav-expanded';

const foundationLogo = '/images/icons/logo.svg';

const foundationHomeUrl = import.meta.env.VITE_FOUNDATION_URL
  ? import.meta.env.VITE_FOUNDATION_URL.replace(/\/+$/, '')
  : 'https://oliviasgarden.org';

const adminUrl = (import.meta.env.VITE_ADMIN_URL as string | undefined)?.replace(/\/+$/, '')
  ?? 'https://admin.oliviasgarden.org';

const instagramUrl = 'https://instagram.com/oliviasgardentx';
const facebookUrl = 'https://www.facebook.com/profile.php?id=100087146659606#';

type NavItem = {
  id: string;
  path: string;
  label: string;
  icon: ReactNode;
};

type NavSection = {
  id: string;
  /** Group heading shown when the rail is expanded; omit for the pinned utility group. */
  title?: string;
  /** Pins the group to the bottom of the rail (used for account/settings). */
  pinBottom?: boolean;
  items: NavItem[];
};

// Individual growing is the primary experience: everyone sees the same
// "Your garden" tools, no participation-mode branching. "Connect" is a single
// optional door to the social surfaces (share surplus, find food, community
// insights, share garden) that used to be scattered across the menu.
const gardenNavItems: NavItem[] = [
  {
    id: 'dashboard',
    path: '/',
    label: 'Home',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 3 3 10.5V21h6v-6h6v6h6V10.5L12 3Z" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'crops',
    path: '/crops',
    label: 'My garden',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M12 3c-3.5 3-5 6-5 9a5 5 0 0 0 4 4.9V21a1 1 0 1 0 2 0v-4.1a5 5 0 0 0 4-4.9c0-3-1.5-6-5-9Zm0 12a3 3 0 0 1-3-3c0-1.7.8-3.6 3-5.7 2.2 2.1 3 4 3 5.7a3 3 0 0 1-3 3Z"
          fill="currentColor"
        />
      </svg>
    ),
  },
  {
    id: 'planner',
    path: '/planner',
    label: 'Planner',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M12 3 2 20h20L12 3Zm0 4.6 2.1 3.6H9.9L12 7.6ZM8.7 13.2h6.6l1.5 2.6H7.2l1.5-2.6ZM5.6 18.6 6.6 17h10.8l1 1.6H5.6Z"
          fill="currentColor"
        />
      </svg>
    ),
  },
  {
    id: 'garden',
    path: '/garden',
    label: 'Designer',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M3 4h8v8H3V4Zm0 10h8v6H3v-6Zm10-10h8v6h-8V4Zm0 8h8v8h-8v-8Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    id: 'reminders',
    path: '/reminders',
    label: 'Reminders',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M12 2a7 7 0 0 0-7 7v3.6L3 16h18l-2-3.4V9a7 7 0 0 0-7-7Zm0 19a3 3 0 0 0 3-3H9a3 3 0 0 0 3 3Z"
          fill="currentColor"
        />
      </svg>
    ),
  },
];

const connectNavItems: NavItem[] = [
  {
    id: 'connect',
    path: '/connect',
    label: 'Connect',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm0 2c-2.7 0-6 1.34-6 4v2h8v-2c0-.98.45-1.86 1.2-2.56A9.6 9.6 0 0 0 8 13Zm8 0c-.35 0-.74.02-1.15.06C16.16 13.9 17 15 17 16.5V19h7v-2c0-2.66-3.3-4-6-4Z"
          fill="currentColor"
        />
      </svg>
    ),
  },
];

const settingsNavItems: NavItem[] = [
  {
    id: 'settings',
    path: '/settings',
    label: 'Settings',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm8.94 5a7.9 7.9 0 0 0 0-2l2-1.6-2-3.4-2.4 1a8 8 0 0 0-1.7-1l-.4-2.5H9.6l-.4 2.5a8 8 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.9 7.9 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a8 8 0 0 0 1.7 1l.4 2.5h4.8l.4-2.5a8 8 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6Z"
          fill="currentColor"
        />
      </svg>
    ),
  },
];

// Same structure for everyone — no dependence on user type.
const navSections: NavSection[] = [
  { id: 'garden', title: 'Your garden', items: gardenNavItems },
  { id: 'connect', title: 'Connect', items: connectNavItems },
  { id: 'account', pinBottom: true, items: settingsNavItems },
];

const footerLinks = [
  { id: 'home', label: 'Foundation home', href: `${foundationHomeUrl}/` },
  { id: 'about', label: 'About', href: `${foundationHomeUrl}/about` },
  { id: 'okra', label: 'Okra Project', href: `${foundationHomeUrl}/okra` },
];

const foundationHeaderNav = [
  { id: 'foundation-home', label: 'Home', href: `${foundationHomeUrl}/` },
  { id: 'foundation-about', label: 'About', href: `${foundationHomeUrl}/about` },
  { id: 'foundation-okra', label: 'Okra Project', href: `${foundationHomeUrl}/okra` },
];

function getInitials(displayName?: string | null, email?: string | null): string {
  const tokens = displayName?.split(/\s+/).filter(Boolean) ?? [];
  if (tokens.length >= 2) {
    return `${tokens[0][0]}${tokens[tokens.length - 1][0]}`.toUpperCase();
  }
  if (tokens.length === 1) {
    return tokens[0].slice(0, 2).toUpperCase();
  }
  const source = email?.trim() ?? '';
  if (!source) return 'G';
  const parts = source
    .replace(/@.*/, '')
    .split(/[\s._-]+/)
    .filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || source.slice(0, 2).toUpperCase();
}

function readStoredExpanded(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const stored = window.localStorage.getItem(NAV_EXPANDED_STORAGE_KEY);
    if (stored === null) return true;
    return stored === 'true';
  } catch {
    return true;
  }
}

export interface AppShellProps {
  user: UserProfile | null;
  children: ReactNode;
}

export function AppShell({ user, children }: AppShellProps) {
  const { signOut } = useAuth();
  const [expanded, setExpanded] = useState<boolean>(() => readStoredExpanded());
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    try {
      window.localStorage.setItem(NAV_EXPANDED_STORAGE_KEY, String(expanded));
    } catch {
      // ignore storage errors
    }
  }, [expanded]);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileNavOpen]);

  const handleLogout = async () => {
    try {
      await signOut();
    } catch {
      // ignore — page reload clears local session
    }
    window.location.assign(`${foundationHomeUrl}/login`);
  };

  const headerNavItems = foundationHeaderNav.map((item) => ({
    id: item.id,
    label: item.label,
    href: item.href,
  }));

  const initials = getInitials(user?.displayName, user?.email);
  const displayName = user?.displayName?.trim() || user?.email || 'Member';

  return (
    <div className="og-app-shell grn-app-shell">
      <SiteHeader
        brandLogoSrc={foundationLogo}
        brandLogoAlt=""
        brandEyebrow="Olivia's Garden Foundation"
        brandTitle={brandConfig.name.full}
        brandHref={`${foundationHomeUrl}/`}
        navItems={headerNavItems}
        utility={(
          <div className="og-auth-utility">
            <AvatarMenu
              initials={initials}
              label={displayName}
              appLinks={[
                { id: 'foundation', label: 'Foundation home', href: foundationHomeUrl },
                { id: 'admin', label: 'Admin console', href: adminUrl },
              ]}
              onLogout={handleLogout}
            />
          </div>
        )}
      />
      <div
        className={`grn-shell-body ${expanded ? 'is-expanded' : 'is-collapsed'} ${mobileNavOpen ? 'is-mobile-nav-open' : ''}`.trim()}
      >
        <button
          type="button"
          className="grn-mobile-nav-trigger"
          aria-expanded={mobileNavOpen}
          aria-controls="grn-vertical-nav"
          aria-label="Open sections"
          onClick={() => setMobileNavOpen(true)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M4 7h16v2H4V7Zm0 4h16v2H4v-2Zm0 4h16v2H4v-2Z" fill="currentColor" />
          </svg>
          <span>Sections</span>
        </button>

        <button
          type="button"
          className="grn-mobile-nav-backdrop"
          aria-label="Close sections"
          tabIndex={mobileNavOpen ? 0 : -1}
          onClick={() => setMobileNavOpen(false)}
        />

        <aside
          id="grn-vertical-nav"
          className={`grn-vertical-nav ${expanded ? 'is-expanded' : 'is-collapsed'} ${mobileNavOpen ? 'is-mobile-open' : ''}`.trim()}
          aria-label="Good Roots Network sections"
        >
          <div className="grn-vertical-nav__mobile-header">
            <span className="grn-vertical-nav__mobile-title">Sections</span>
            <button
              type="button"
              className="grn-vertical-nav__mobile-close"
              aria-label="Close sections"
              onClick={() => setMobileNavOpen(false)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path
                  d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4L13.4 12 19 6.4 17.6 5 12 10.6 6.4 5Z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </div>

          <div className="grn-vertical-nav__scroll">
            {navSections.map((section) => (
              <div
                key={section.id}
                className={`grn-vertical-nav__section ${section.pinBottom ? 'grn-vertical-nav__section--pinned' : ''}`.trim()}
              >
                {section.title ? (
                  <p className="grn-vertical-nav__section-title" aria-hidden="true">
                    {section.title}
                  </p>
                ) : null}
                <ul className="grn-vertical-nav__list" role="list" aria-label={section.title}>
                  {section.items.map((item) => (
                    <li key={item.id}>
                      <NavLink
                        to={item.path}
                        end={item.path === '/'}
                        className={({ isActive }) =>
                          `grn-vertical-nav__link ${isActive ? 'is-active' : ''}`.trim()
                        }
                        title={expanded ? undefined : item.label}
                        onClick={() => setMobileNavOpen(false)}
                      >
                        <span className="grn-vertical-nav__icon" aria-hidden="true">{item.icon}</span>
                        <span className="grn-vertical-nav__label">{item.label}</span>
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="grn-vertical-nav__toggle"
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse navigation' : 'Expand navigation'}
            title={expanded ? 'Collapse navigation' : 'Expand navigation'}
            onClick={() => setExpanded((current) => !current)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                d={expanded
                  ? 'M15.4 6.4 14 5l-7 7 7 7 1.4-1.4L9.8 12Z'
                  : 'M8.6 6.4 10 5l7 7-7 7-1.4-1.4L14.2 12Z'}
                fill="currentColor"
              />
            </svg>
          </button>
        </aside>

        <main className="grn-shell-main">
          <div className="grn-shell-main__inner">
            {children}
          </div>
        </main>
      </div>
      <SiteFooter
        meta={`${new Date().getFullYear()} Olivia's Garden Foundation. All rights reserved.`}
        links={footerLinks}
        socialLinks={[
          {
            id: 'instagram',
            href: instagramUrl,
            label: "Follow Olivia's Garden Foundation on Instagram",
            icon: 'instagram',
          },
          {
            id: 'facebook',
            href: facebookUrl,
            label: "Follow Olivia's Garden Foundation on Facebook",
            icon: 'facebook',
          },
        ]}
      />
    </div>
  );
}
