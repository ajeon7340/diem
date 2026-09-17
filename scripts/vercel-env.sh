#!/usr/bin/env bash
#
# Push the Supabase configuration from .env.local into the Vercel project.
#
# The deployed app has been running on fixtures because Vercel holds none of
# these — `isSupabaseConfigured()` is false there, so every database branch is
# switched off in production while it works locally. This copies the four the
# app reads, for all three environments.
#
#   npx vercel login          # once, interactive — needs a browser
#   npm run vercel:env
#
# Values are piped in on stdin, never passed as arguments: a secret in argv is
# a secret in `ps` output and in the shell history of whoever runs this.
#
# NEXT_PUBLIC_SITE_URL is the exception to copying .env.local verbatim. Locally
# it is http://localhost:3000; on Vercel it must be the deployment origin or
# every magic link mails the user a link back to their own machine.
set -euo pipefail

cd "$(dirname "$0")/.."

PROJECT="${VERCEL_PROJECT:-diem}"
SCOPE="${VERCEL_SCOPE:-abe7340-gmailcoms-projects}"
SITE_URL="${VERCEL_SITE_URL:-https://diem-git-main-abe7340-gmailcoms-projects.vercel.app}"

if [ ! -f .env.local ]; then
  echo "  .env.local not found — nothing to copy." >&2
  exit 1
fi

read_var() {
  # Last assignment wins, value kept verbatim after the first '='.
  grep -E "^$1=" .env.local | tail -1 | cut -d= -f2-
}

# A token keeps this runnable without an interactive browser login. Read from
# a file rather than an argument so it never lands in `ps` or shell history.
TOKEN_FILE="${VERCEL_TOKEN_FILE:-$HOME/.vercel-token}"
TOKEN_ARGS=()
if [ -n "${VERCEL_TOKEN:-}" ]; then
  TOKEN_ARGS=(--token "$VERCEL_TOKEN")
elif [ -f "$TOKEN_FILE" ]; then
  TOKEN_ARGS=(--token "$(cat "$TOKEN_FILE")")
fi

vercel() { npx --yes vercel@latest "$@" "${TOKEN_ARGS[@]}"; }

echo "  linking $SCOPE/$PROJECT…"
vercel link --yes --project "$PROJECT" --scope "$SCOPE" >/dev/null

for NAME in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY NEXT_PUBLIC_SITE_URL; do
  if [ "$NAME" = "NEXT_PUBLIC_SITE_URL" ]; then
    VALUE="$SITE_URL"
  else
    VALUE="$(read_var "$NAME")"
  fi
  if [ -z "$VALUE" ]; then
    echo "  SKIP $NAME — not set in .env.local" >&2
    continue
  fi
  for ENVIRONMENT in production preview development; do
    # Idempotent: remove first so a re-run updates instead of erroring.
    vercel env rm "$NAME" "$ENVIRONMENT" --yes >/dev/null 2>&1 || true
    printf '%s' "$VALUE" | vercel env add "$NAME" "$ENVIRONMENT" >/dev/null
  done
  echo "  set  $NAME  (${#VALUE} chars) → production, preview, development"
done

echo
echo "  Done. Two things this script cannot do:"
echo "    1. Vercel → Settings → General → Node.js Version → 22."
echo "       supabase-js aborts on Node 20 with 'native WebSocket not found',"
echo "       so the whole database path dies on the default runtime."
echo "    2. Supabase → Authentication → URL Configuration → Redirect URLs:"
echo "       add $SITE_URL/auth/callback"
echo "       Without it the magic link arrives and the callback is rejected."
echo
echo "  Then redeploy:  npx vercel --prod"
