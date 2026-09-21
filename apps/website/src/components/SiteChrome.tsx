'use client';

import { useCallback, useState } from 'react';
import type { SiteConfig } from '@/lib/api';
import { CartLink } from '@/components/CartLink';
import { SideDrawer } from '@/components/SideDrawer';

/** Days for opening-hours rendering, indexed 0=Sun..6=Sat. */
export const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/menu', label: 'Menu' },
  { href: '/book', label: 'Book' },
  { href: '/about', label: 'About' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/reviews', label: 'Reviews' },
  { href: '/hours', label: 'Hours' },
  { href: '/contact', label: 'Contact' },
  { href: '/orders', label: 'My Orders' },
];

/** Pages listed under the ordering shortcuts in the mobile drawer. */
const DRAWER_MORE = NAV.filter((n) => n.href !== '/menu' && n.href !== '/orders');

export function SiteHeader({ config }: { config: SiteConfig }) {
  const { restaurant } = config;
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  return (
    <>
      <header
        className="sticky top-0 z-20 shadow-sm"
        style={{ backgroundColor: 'var(--brand-primary)', color: '#fff' }}
      >
        <div className="flex items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            {/* Mobile hamburger — opens the slide-out menu */}
            <button
              type="button"
              className="-ml-2 p-2 sm:hidden"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              aria-expanded={menuOpen}
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <a href="/" className="flex items-center gap-3">
              {restaurant.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={restaurant.logo_url} alt={restaurant.name} className="h-9 w-9 rounded-full object-cover" />
              ) : null}
              <span className="text-lg font-bold">{restaurant.name}</span>
            </a>
          </div>

          {/* Desktop nav */}
          <nav className="hidden gap-6 text-sm font-medium sm:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="opacity-90 hover:opacity-100">
                {n.label}
              </a>
            ))}
            <CartLink />
          </nav>

          {/* Mobile: cart stays one tap away */}
          <div className="text-sm font-medium sm:hidden">
            <CartLink />
          </div>
        </div>
      </header>

      <SideDrawer
        open={menuOpen}
        onClose={closeMenu}
        restaurantName={restaurant.name}
        moreLinks={DRAWER_MORE}
      />
    </>
  );
}

export function SiteFooter({ config }: { config: SiteConfig }) {
  const { restaurant } = config;
  const socials = restaurant.social_links || {};
  return (
    <footer
      className="mt-auto px-6 py-10 text-center text-sm"
      style={{ backgroundColor: 'var(--brand-primary)', color: '#fff' }}
    >
      {Object.keys(socials).length > 0 ? (
        <div className="mb-4 flex justify-center gap-4">
          {Object.entries(socials).map(([name, url]) => (
            <a key={name} href={url as string} target="_blank" rel="noreferrer" className="capitalize opacity-90 hover:opacity-100">
              {name}
            </a>
          ))}
        </div>
      ) : null}
      <p className="opacity-70">
        {restaurant.name} · Powered by AuraOS
      </p>
    </footer>
  );
}
