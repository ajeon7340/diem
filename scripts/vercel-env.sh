#!/usr/bin/env bash
#
# Push the Supabase configuration from .env.local into the Vercel project.
#
#   npm run vercel:env
#
# Needs a Vercel token in VERCEL_TOKEN, or in the file named by
# VERCEL_TOKEN_FILE (default ~/.vercel-token). Read from a file rather than
# taken as an argument: an argument is visible in `ps` and lands in shell
# history.
#
# WHY THE REST API AND NOT `vercel env add`: a team-scoped token cannot load a
# user, and the CLI resolves the user before it does anything else —
#
#     Error: Not able to load user because of unexpected error: User not found.
#
# — so the CLI is unusable with exactly the kind of token you should be using
# here. The API takes the same token and is scoped to the project.
#
# NEXT_PUBLIC_SITE_URL is the one value not copied from .env.local. Locally it
# is http://localhost:3000, and shipping that would mail every user a sign-in
# link pointing at their own machine.
set -euo pipefail

cd "$(dirname "$0")/.."

SCOPE="${VERCEL_SCOPE:-abe7340-gmailcoms-projects}"
PROJECT="${VERCEL_PROJECT:-diem}"
SITE_URL="${VERCEL_SITE_URL:-https://diem-git-main-abe7340-gmailcoms-projects.vercel.app}"

TOKEN_FILE="${VERCEL_TOKEN_FILE:-$HOME/.vercel-token}"
if [ -n "${VERCEL_TOKEN:-}" ]; then
  TOKEN="$VERCEL_TOKEN"
elif [ -f "$TOKEN_FILE" ]; then
  TOKEN="$(cat "$TOKEN_FILE")"
else
  echo "  No token. Set VERCEL_TOKEN or put one in $TOKEN_FILE." >&2
  echo "  Create one at https://vercel.com/account/tokens" >&2
  exit 1
fi

[ -f .env.local ] || { echo "  .env.local not found." >&2; exit 1; }

api() { # method path [json-body]
  local method="$1" path="$2"
  if [ "$#" -ge 3 ]; then
    curl -sS -X "$method" "https://api.vercel.com$path" \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d @-
  else
    curl -sS -X "$method" "https://api.vercel.com$path" -H "Authorization: Bearer $TOKEN"
  fi
}

PROJECT_ID="$(api GET "/v9/projects?slug=$SCOPE" | PROJECT="$PROJECT" python3 -c '
import json, os, sys
for p in json.load(sys.stdin).get("projects", []):
    if p["name"] == os.environ["PROJECT"]:
        print(p["id"]); break
')"
[ -n "$PROJECT_ID" ] || { echo "  No project $SCOPE/$PROJECT for this token." >&2; exit 1; }
echo "  $SCOPE/$PROJECT -> $PROJECT_ID"

read_var() { grep -E "^$1=" .env.local | tail -1 | cut -d= -f2-; }

EXISTING="$(api GET "/v9/projects/$PROJECT_ID/env")"

# YOUTUBE_API_KEY was missing from this list, and its absence is invisible
# until someone signs up: `resolveChannel` throws, and the form said "Could not
# check that handle. Try again in a moment." on a deployment where waiting
# could never help. The model keys are here for the same reason.
for NAME in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY \
            NEXT_PUBLIC_SITE_URL YOUTUBE_API_KEY GEMINI_API_KEY ADFIT_AI_PROVIDER ADFIT_AI_MODEL \
            ADFIT_MOCK_EMAIL; do
  if [ "$NAME" = "NEXT_PUBLIC_SITE_URL" ]; then VALUE="$SITE_URL"; else VALUE="$(read_var "$NAME")"; fi
  if [ -z "$VALUE" ]; then echo "  SKIP $NAME — not in .env.local"; continue; fi

  # Remove every existing copy first so a re-run updates rather than collides.
  for ID in $(printf '%s' "$EXISTING" | NAME="$NAME" python3 -c '
import json, os, sys
for e in json.load(sys.stdin).get("envs", []):
    if e["key"] == os.environ["NAME"]: print(e["id"])
'); do
    api DELETE "/v9/projects/$PROJECT_ID/env/$ID" >/dev/null
  done

  RESULT="$(VALUE="$VALUE" NAME="$NAME" python3 -c '
import json, os
print(json.dumps({"key": os.environ["NAME"], "value": os.environ["VALUE"],
                  "type": "encrypted",
                  "target": ["production", "preview", "development"]}))
' | api POST "/v10/projects/$PROJECT_ID/env" -)"
  printf '  %-30s %3d chars  %s\n' "$NAME" "${#VALUE}" \
    "$(printf '%s' "$RESULT" | python3 -c '
import json, sys
d = json.load(sys.stdin)
print("error: " + str(d["error"].get("message"))[:60] if "error" in d else "production, preview, development")
')"
done

echo
echo "  Supabase -> Authentication -> URL Configuration -> Redirect URLs must include:"
echo "    $SITE_URL/auth/callback"
echo "  Then redeploy for the build to pick the new values up."
