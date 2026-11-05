#!/usr/bin/env bash
# The data a deployed environment gets beyond its admin accounts, picked by SEED_PROFILE:
#   baseline  nothing more (production)
#   demo      the demo set (staging); REFRESH_DEMO_DATA=true rebuilds it first
# Anything else stops the deploy, so a missing variable can never pick a profile by accident.
# Needs MIGRATOR_DB_URL.
set -euo pipefail

cd "$(dirname "$0")"

run_sql() {
  psql "$MIGRATOR_DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$1"
}

case "${SEED_PROFILE:-}" in
  baseline)
    echo "seed profile baseline: no data beyond the admin accounts"
    ;;
  demo)
    if [ "${REFRESH_DEMO_DATA:-false}" = "true" ]; then
      run_sql clear-demo.sql
    fi
    run_sql seed-demo.sql
    ;;
  *)
    echo "::error::SEED_PROFILE must be baseline or demo, got '${SEED_PROFILE:-}'" >&2
    exit 1
    ;;
esac
