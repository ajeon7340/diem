/**
 * The text markers that indicate a commercial relationship, in one place.
 *
 * They were written for the promotions scan in `ingest/analyze.ts` and are now
 * also what collaboration discovery reads, which is the moment two copies would
 * have started drifting: the scan would learn a new affiliate domain and the
 * discovery pass would not, and the same video would be read two ways on two
 * pages of the same product.
 *
 * KOREAN FIRST because that is where they appear on the channels this was built
 * against, and because the English set alone finds almost nothing there.
 *
 * NONE OF THESE IS AUTHORITATIVE. `paidProductPlacementDetails` is the only
 * signal YouTube itself stands behind; everything here is a reading of prose
 * somebody wrote, and every caller has to mark it as ours. They are also
 * evidence about the VIDEO, never about which brand is behind it — the brand
 * has to be named separately, by name, in the same text.
 */

/** Stated paid placement: "유료 광고 포함", "#ad", "paid partnership". */
export const DISCLOSURE_MARKERS =
  /유료\s*광고|유료광고|협찬|광고\s*포함|제공\s*받|파트너십|소정의|#ad\b|#sponsored\b|paid\s+partnership/i;

/** Affiliate programmes and link shorteners used for them. */
export const AFFILIATE_MARKERS =
  /coupa\.ng|link\.coupang|ali\.ski|s\.click\.aliexpress|amzn\.to|bit\.ly\/[A-Za-z0-9]+|rfrl\.co|linktr\.ee|\?(?:af|aff|affiliate|utm_campaign)=/i;

/**
 * Gifted product, which is neither a fee nor an affiliate arrangement.
 *
 * Kept apart from DISCLOSURE_MARKERS deliberately. "제품을 제공받았습니다" and
 * "유료 광고" are different disclosures and collapsing them would report a gift
 * as a paid campaign — an overstatement of a commercial relationship, which is
 * the specific error this whole feature is built to avoid.
 */
export const GIFT_MARKERS =
  /무상\s*제공|제품\s*제공|무료로\s*제공|gifted\b|sent\s+me\s+(?:this|these)\s+for\s+free|pr\s+package|received\s+.{0,20}\bfor\s+free/i;
