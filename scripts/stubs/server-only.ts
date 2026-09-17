/**
 * A no-op stand-in for the `server-only` package, for verify scripts.
 *
 * `src/lib/data/fixtures.ts` imports `server-only`, which Next resolves to a
 * module that throws if it is ever pulled into a client bundle. Outside Next it
 * does not resolve at all, so every suite so far has TRANSCRIBED the fixture
 * numbers instead of importing them — and a transcription cannot catch a
 * fixture that contradicts itself. It did not: `fixtureDirectory()` returned a
 * hardcoded `raisedFlags: 1, checkedFlags: 3` for every creator while the
 * profile page derived 3 of 4, and no suite could see it.
 *
 * Mapped in ONLY via tsconfig.scripts.json. Deliberately not added to the app
 * tsconfig: aliasing `server-only` there would disarm the real guard and let a
 * server module reach the browser bundle silently.
 */
export {};
