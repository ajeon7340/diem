/**
 * The creator's sections, declared once.
 *
 * They were listed in two places — the site header and the dashboard tabs —
 * and the two drifted into showing the same four links twice on every
 * dashboard page. One list, one nav.
 *
 * NO DIRECTORY. The directory is where a brand goes shopping for creators; a
 * creator has no reason to browse it, and the slot is better spent on a page
 * that is theirs. Same reasoning that already hides Pricing from them: it
 * sells the agency plan and they are not the buyer.
 */
export const CREATOR_NAV = [
  // Studio first among the working pages: every other one needs an advertiser
  // to already exist — requests, offers and moderation are all things done TO
  // a creator — so on day one they are four empty pages and Studio is the only
  // surface that pays a creator back for showing up alone.
  { href: '/dashboard/studio', label: 'Studio' },
  { href: '/dashboard/requests', label: 'Requests' },
  { href: '/dashboard/offers', label: 'Offers & briefs' },
  { href: '/dashboard/moderation', label: 'Moderation' },
  { href: '/dashboard/settings', label: 'Settings' },
] as const;
