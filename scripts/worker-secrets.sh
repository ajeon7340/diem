#!/usr/bin/env bash
#
# Copy what the worker needs from .env.local into the GitHub repo, so the cron
# in .github/workflows/worker.yml can run.
#
#   npm run worker:secrets
#
# Values are piped on stdin, never passed as arguments — an argument is visible
# in `ps` and lands in shell history. The service role key is among them.
#
# The two non-secret settings go in as VARIABLES rather than secrets: a model
# id masked in the logs would make "which model produced this run" unanswerable
# from the run itself, which is the one question a billing surprise asks.
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="${GITHUB_REPO:-ajeon7340/diem}"
[ -f .env.local ] || { echo "  .env.local not found." >&2; exit 1; }

read_var() { grep -E "^$1=" .env.local | tail -1 | cut -d= -f2-; }

for NAME in NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY YOUTUBE_API_KEY GEMINI_API_KEY; do
  VALUE="$(read_var "$NAME")"
  if [ -z "$VALUE" ]; then echo "  SKIP $NAME — not in .env.local"; continue; fi
  printf '%s' "$VALUE" | gh secret set "$NAME" --repo "$REPO"
  echo "  secret   $NAME (${#VALUE} chars)"
done

for NAME in ADFIT_AI_PROVIDER ADFIT_AI_MODEL; do
  VALUE="$(read_var "$NAME")"
  if [ -z "$VALUE" ]; then echo "  SKIP $NAME — not in .env.local"; continue; fi
  gh variable set "$NAME" --repo "$REPO" --body "$VALUE"
  echo "  variable $NAME = $VALUE"
done

echo
echo "  Then: gh workflow run 'analysis worker' --repo $REPO"
