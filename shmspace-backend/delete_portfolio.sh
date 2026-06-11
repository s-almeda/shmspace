#!/bin/bash
# delete_portfolio.sh — review and delete server media that update_portfolio.sh
# flagged as having no local copy.
#
# The flag log (portfolio/_to_delete.txt) is append-only, so it can contain
# entries that have since been resolved (e.g. a file re-uploaded or un-renamed).
# To stay safe we RE-VALIDATE every logged path against your current local repo:
# anything that still exists locally is skipped, never deleted.
#
# Flow:
#   1. SSH to the server and read the delete log.
#   2. Re-check each path against your local files; split into delete vs skip.
#   3. Show both lists and ask for confirmation.
#   4. Delete only the genuinely-stale files, then archive the log.
#
# Usage: ./delete_portfolio.sh

set -euo pipefail

SERVER="root@45.79.81.173"
SERVER_BASE="/root/shmspace/shmspace-backend"
LOG="$SERVER_BASE/portfolio/_to_delete.txt"

# Run from the script's own dir so logged paths (portfolio/...) resolve against
# the local repo the same way they do on the server (relative to SERVER_BASE).
cd "$(dirname "$0")"

# --- 1. Read the log -----------------------------------------------------------
echo "🔎 Looking for delete log on server ($LOG)..."
if ! ssh "$SERVER" "test -s '$LOG'"; then
    echo "✅ No delete log (or it's empty) — nothing to delete."
    exit 0
fi
LOGGED=$(ssh "$SERVER" "grep -vE '^#|^[[:space:]]*$' '$LOG' | LC_ALL=C sort -u" || true)
if [ -z "$LOGGED" ]; then
    echo "✅ Delete log has no file entries — nothing to delete."
    exit 0
fi

# --- 2. Re-validate against the local repo -------------------------------------
TO_DELETE=""
STILL_LOCAL=""
while IFS= read -r p; do
    [ -z "$p" ] && continue
    if [ -e "$p" ]; then
        STILL_LOCAL+="$p"$'\n'      # exists locally -> NOT stale, do not delete
    else
        TO_DELETE+="$p"$'\n'        # gone locally -> safe to delete on server
    fi
done <<< "$LOGGED"

if [ -n "$STILL_LOCAL" ]; then
    skip_count=$(printf '%s' "$STILL_LOCAL" | grep -c .)
    echo ""
    echo "ℹ️  $skip_count logged file(s) still exist locally — SKIPPING (won't delete):"
    printf '%s' "$STILL_LOCAL" | sed 's/^/    /'
fi

if [ -z "$TO_DELETE" ]; then
    echo ""
    echo "✅ Nothing to delete — every logged file still exists locally."
    echo "   (Run ./update_portfolio.sh to refresh the log if needed.)"
    exit 0
fi

del_count=$(printf '%s' "$TO_DELETE" | grep -c .)
echo ""
echo "🗑  The following $del_count file(s) are gone locally and will be deleted from the server:"
printf '%s' "$TO_DELETE" | sed 's/^/    /'

# --- 3. Confirm ----------------------------------------------------------------
echo ""
read -r -p "Permanently delete these $del_count file(s) from the server? [y/N] " confirm
case "$confirm" in
    [yY]|[yY][eE][sS]) ;;
    *) echo "Aborted. Nothing was deleted; the log is unchanged."; exit 0 ;;
esac

# --- 4. Delete the validated list, then archive the log ------------------------
echo "🚀 Deleting on server..."
printf '%s' "$TO_DELETE" | ssh "$SERVER" "cat > /tmp/portfolio_delete_list.txt"
ssh "$SERVER" bash -s "$SERVER_BASE" "$LOG" <<'ENDSSH'
set -e
BASE="$1"
LOG="$2"
cd "$BASE"
deleted=0; missing=0
while IFS= read -r f; do
    [ -z "$f" ] && continue
    if [ -e "$f" ]; then
        rm -f "$f" && deleted=$((deleted + 1)) && echo "  ✓ deleted $f"
    else
        missing=$((missing + 1)); echo "  - already gone: $f"
    fi
done < /tmp/portfolio_delete_list.txt
echo "Summary: $deleted deleted, $missing already gone."
ts=$(date '+%Y%m%d_%H%M%S')
mv "$LOG" "${LOG}.processed_${ts}"
echo "Log archived to ${LOG}.processed_${ts}"
rm -f /tmp/portfolio_delete_list.txt
ENDSSH

echo "✨ Done."
