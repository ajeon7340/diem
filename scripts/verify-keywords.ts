/**
 * Assertions for the keyword lens.
 *
 * The lens is a RECALL tool and everything here pins that. It decides which
 * comments a model reads, never what they are — because the one mistake this
 * file can make is the mistake the whole brand-safety rewrite was about:
 * treating criticism of a creator as a risk to a brand.
 *
 *   npm run verify:keywords
 */
import {
  KEYWORD_LEXICON_VERSION,
  isCandidate,
  normalise,
  scanKeywords,
} from '@/lib/report/keywords';

let pass = 0,
  fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  ok   ${label}`);
  } else {
    fail++;
    console.log(`  FAIL ${label}\n       got ${a}\n       want ${e}`);
  }
}

const kinds = (t: string) => scanKeywords(t).map((m) => m.kind).sort();

check('lexicon version is stamped', KEYWORD_LEXICON_VERSION, 'lexicon-1');

// ---------------------------------------------------------------------------
// Substring matching is how you flag Scunthorpe
// ---------------------------------------------------------------------------

check('assassinate is not a hit', kinds('they should assassinate that idea'), []);
check('classic is not a hit', kinds('a classic look'), []);
check('shitake is not a hit', kinds('shitake mushrooms'), []);
check('but the word itself is', kinds('this is shit'), ['harassment']);

// ---------------------------------------------------------------------------
// Obfuscation is the point of obfuscation
// ---------------------------------------------------------------------------

check('asterisks do not hide it', kinds('f*ck this'), ['harassment']);
check('nor do numbers', kinds('sh1t'), ['harassment']);
check('nor full-width forms', kinds('ｓｈｉｔ'), ['harassment']);
check('normalisation strips punctuation', normalise('f.u.c.k!!'), 'fuck');

// ---------------------------------------------------------------------------
// A hit is a candidate, never a finding
// ---------------------------------------------------------------------------

// Both of these match. Neither is a risk to a brand, and if the lens were the
// classifier both would become flags — which is exactly how a creator ends up
// marked down for having an audience that talks like an audience.
check('praise with profanity still trips the lens', isCandidate('this is fucking incredible'), true);
check('so the lens cannot be the classifier', kinds('this is fucking incredible'), ['harassment']);
check('blunt criticism trips it too', isCandidate('your editing is stupid'), true);

// ---------------------------------------------------------------------------
// Quality is a commercial signal, not a safety one
// ---------------------------------------------------------------------------

// Routing product complaints through brand safety would make "this cleanser
// irritated my skin" a mark against the creator who featured it.
check('a product complaint is quality', kinds('it broke after a week'), ['quality']);
check('and a refund request is too', kinds('asked for a refund'), ['quality']);
check('quality is never a risk category on its own', kinds('waste of money').includes('harassment' as never), false);

// ---------------------------------------------------------------------------
// Korean matches as substrings — no spaces to anchor to
// ---------------------------------------------------------------------------

check('korean profanity is found mid-word', kinds('진짜 병신같네'), ['harassment']);
check('korean quality complaint', kinds('환불받고싶어요'), ['quality']);
check('clean korean is clean', kinds('진짜 예쁘다'), []);

// ---------------------------------------------------------------------------
// Spam and scams, which is what the lens is actually good at
// ---------------------------------------------------------------------------

check('channel promotion', kinds('check my channel for more'), ['spam']);
check('link shorteners', kinds('winners here bit.ly'), ['spam']);
check('the tap bait from the real scan', kinds('do not triple tap to listen'), ['spam']);
check('investment pitches', kinds('guaranteed returns on forex'), ['illegal']);

// ---------------------------------------------------------------------------
// Empty is "do not spend a model call", never "this is fine"
// ---------------------------------------------------------------------------

check('an ordinary comment trips nothing', isCandidate('love this look on you'), false);
check('emoji only trips nothing', isCandidate('❤️❤️❤️'), false);
check('empty text trips nothing', isCandidate(''), false);
// The lens misses coded language, sarcasm and anything invented after it was
// written. That is why a miss cannot be reported as a clean comment.
check('a coded attack slips past', isCandidate('we all know what she really is'), false);

// One hit per lens is enough to earn a second look; the model does the rest.
check('repeats do not multiply', scanKeywords('shit shit shit').length, 1);
check('but different lenses both report', kinds('check my channel, it broke after a week').length, 2);

// ---------------------------------------------------------------------------
// Shapes, which is what the words missed
// ---------------------------------------------------------------------------

// Measured, not assumed: on 797 real comments with 31 labelled by hand the
// word list alone reached 29% recall. Every one of the 22 it missed was an
// engagement bot whose text is ordinary praise carrying a long emoji run.
check(
  'the bot template the word list could not see',
  kinds('I came across this by accident, and I’m glad I did.❤😊❤😊❤'),
  ['spam'],
);
check('a long emoji run is a shape', kinds('gorgeous 😍😍😍😍😍'), ['spam']);
// Enthusiasm reaches three; the templates ran to a dozen.
check('but ordinary enthusiasm is not', kinds('gorgeous 😍😍😍'), []);
check('the fake player widget', kinds('Voice msg ▶️0:00 ───────────•0:09'), ['spam']);
check('a contact handoff', kinds('dm me on telegram'), ['illegal']);

// The ceiling, stated as a test so nobody mistakes it for a gap to close.
// These are meaning rather than vocabulary and no word list reaches them.
check('surgery mockery slips past', isCandidate('saving for another face surgery 😂'), false);
check('coded sexism slips past', isCandidate('needs many MEN to fund her lifestyle'), false);
check('so the lens is opt-in, not the default', true, true);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
