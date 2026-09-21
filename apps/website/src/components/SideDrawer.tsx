'use client';

import { useEffect, useState } from 'react';
import { clearCustomerToken, getCustomerToken, getMe } from '@/lib/client';

export interface DrawerLink {
  href: string;
  label: string;
}

interface Me {
  name: string | null;
  phone: string;
}

/**
 * Mobile slide-out menu: a "Welcome" account panel, the ordering shortcuts
 * (Place Order / Ongoing Order / Order History) and the regular site pages.
 */
export function SideDrawer({
  open,
  onClose,
  restaurantName,
  moreLinks,
}: {
  open: boolean;
  onClose: () => void;
  restaurantName: string;
  moreLinks: DrawerLink[];
}) {
  const [me, setMe] = useState<Me | null>(null);

  // Load the signed-in customer (if any) each time the drawer opens.
  useEffect(() => {
    if (!open) return;
    if (!getCustomerToken()) {
      setMe(null);
      return;
    }
    getMe()
      .then((m) => setMe({ name: m.name, phone: m.phone }))
      .catch(() => setMe(null));
  }, [open]);

  // Close on Escape and lock page scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  function signOut() {
    clearCustomerToken();
    setMe(null);
  }

  const rowClass = 'flex items-center gap-4 px-5 py-3.5 text-[15px] text-gray-800 hover:bg-gray-50';

  return (
    <div className={`fixed inset-0 z-40 sm:hidden ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className={`absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-white text-gray-900 shadow-xl transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Welcome / account */}
        <div className="px-5 py-6 text-white" style={{ backgroundColor: 'var(--brand-primary)' }}>
          {me ? (
            <>
              <p className="text-lg font-semibold">Hi, {me.name || 'there'}</p>
              <p className="mt-1 text-sm opacity-90">{me.phone}</p>
              <button
                type="button"
                onClick={signOut}
                className="mt-4 rounded-full bg-white px-4 py-2 text-sm font-semibold text-gray-800"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold">Welcome</p>
              <p className="mt-1 text-sm opacity-90">Sign in to save your orders</p>
              <a
                href="/login"
                onClick={onClose}
                className="mt-4 inline-block rounded-full bg-white px-4 py-2 text-sm font-semibold text-gray-800"
              >
                Sign in with phone
              </a>
            </>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          <div
            className={`${rowClass} cursor-not-allowed opacity-60 hover:bg-transparent`}
            aria-disabled="true"
          >
            <span className="text-xl" aria-hidden>🧭</span>
            <span className="flex-1">Discover Restaurant</span>
            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-700">
              Coming
            </span>
          </div>
          <a href="/menu" onClick={onClose} className={rowClass}>
            <span className="text-xl" aria-hidden>🍽️</span>
            <span>Place Order</span>
          </a>
          <a href="/orders?tab=ongoing" onClick={onClose} className={rowClass}>
            <span className="text-xl" aria-hidden>⏱️</span>
            <span>Ongoing Order</span>
          </a>
          <a href="/orders?tab=history" onClick={onClose} className={rowClass}>
            <span className="text-xl" aria-hidden>📜</span>
            <span>Order History</span>
          </a>

          <div className="my-2 border-t" />
          {moreLinks.map((l) => (
            <a key={l.href} href={l.href} onClick={onClose} className="block px-5 py-2.5 pl-[3.75rem] text-sm text-gray-600 hover:bg-gray-50">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="border-t px-5 py-3 text-xs text-gray-400">{restaurantName}</div>
      </aside>
    </div>
  );
}
