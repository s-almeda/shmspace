#!/bin/bash
# update_portfolio.sh — sync portfolio media to the server and commit code/metadata changes.
#
# Workflow:
#   1. Media files (images + video) under portfolio/ are rsync'd straight to the
#      server. They are NOT committed to git (see .gitignore).
#   2. If you've staged changes (git add <file> ...), it commits + pushes ONLY
#      those (with a confirm). If nothing is staged, it skips the commit.
#   3. The server ALWAYS pulls (picking up any pushed commits) and restarts pm2 —
#      even when there's no git activity, so media-only or already-committed
#      updates still go live.
#
# Usage: ./update_portfolio.sh ["commit message"]   (message only needed to commit)

set -euo pipefail

SERVER="root@45.79.81.173"
SERVER_BASE="/root/shmspace/shmspace-backend"

# Commit message is optional — only needed if you have staged changes to commit
# (checked below). With nothing staged, the script still updates the server.
COMMIT_MSG="${1:-}"

# --- 1. Upload media to the server (never committed to git) ---------------------
# A SINGLE rsync over the whole portfolio/ tree. rsync builds the file list on
# both ends in one connection and transfers only new/changed files (size+mtime),
# so re-running is fast even with thousands of files. The filter limits it to
# media; captions/metadata travel via `git pull` below.
RSYNC_FILTER=(
    --prune-empty-dirs
    --include='*/'
    --include='*.mp4'  --include='*.mov'  --include='*.webm'
    --include='*.png'  --include='*.jpg'  --include='*.jpeg'
    --include='*.gif'  --include='*.webp'
    --include='*.PNG'  --include='*.JPG'  --include='*.JPEG'
    --exclude='*'
)

echo "📦 Syncing portfolio media to server (one pass, only changed files)..."
ssh -n "$SERVER" "mkdir -p '$SERVER_BASE/portfolio'"
rsync -ahv "${RSYNC_FILTER[@]}" ./portfolio/ "$SERVER:$SERVER_BASE/portfolio/"

# Detect media on the server that no longer exists locally. We do NOT delete it
# (that would be destructive); instead we log it to _to_delete.txt on the server
# for you to review and remove by hand. This diffs the two file lists directly
# (find + comm) so it works regardless of rsync flavor (macOS ships openrsync,
# which doesn't report dry-run deletions).
echo "🗑  Checking for server media with no local copy..."
MEDIA_FIND_SH='find . -type f \( -iname "*.mp4" -o -iname "*.mov" -o -iname "*.webm" -o -iname "*.png" -o -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.gif" -o -iname "*.webp" \) | sed "s|^\./||" | LC_ALL=C sort'
LOCAL_LIST=$(cd ./portfolio && eval "$MEDIA_FIND_SH")
REMOTE_LIST=$(ssh "$SERVER" "cd '$SERVER_BASE/portfolio' 2>/dev/null && $MEDIA_FIND_SH" || true)

# Stale = files on the server but not local. Use grep -Fxv (fixed-string,
# whole-line, inverted) rather than comm: comm assumes both inputs are sorted in
# the *current locale's* collation, but we sorted with LC_ALL=C — in a UTF-8
# shell that mismatch makes comm desync and report false positives. grep -Fxv is
# collation-independent. Guard against an empty local list (which would otherwise
# flag every server file) — that means find found nothing and is never correct.
if [ -z "$LOCAL_LIST" ]; then
    echo "  ⚠️  No local media found under ./portfolio — skipping stale check."
    STALE=""
else
    STALE=$(printf '%s\n' "$REMOTE_LIST" | grep -Fxv -f <(printf '%s\n' "$LOCAL_LIST") || true)
fi

LOG="$SERVER_BASE/portfolio/_to_delete.txt"
if [ -n "$STALE" ]; then
    count=$(printf '%s\n' "$STALE" | grep -c .)
    echo "  $count file(s) on server are not in your local repo:"
    printf '%s\n' "$STALE" | sed 's|^|    portfolio/|'
    echo "  → written to $LOG (review with ./delete_portfolio.sh)"
    # Overwrite (not append) so the log always reflects the CURRENT stale set —
    # no accumulation of duplicates or already-resolved entries.
    {
        echo "# $(date '+%Y-%m-%d %H:%M:%S') — server media with no local copy:"
        # sed (not printf 'portfolio/%s') so EVERY line gets the prefix — printf
        # with one multi-line arg would only prefix the first line.
        printf '%s\n' "$STALE" | sed 's|^|portfolio/|'
    } | ssh "$SERVER" "cat > '$LOG'"
else
    echo "  none — server media matches local. Clearing any old delete log."
    ssh "$SERVER" "rm -f '$LOG'"
fi

# --- 2. Commit staged changes (if any) ------------------------------------------
# Optional: if nothing is staged we skip the commit but STILL update the server
# below — media was already rsync'd, and there may be unpushed commits to deploy.
echo ""
if git diff --cached --quiet; then
    echo "📁 Nothing staged — skipping commit (server still updates below)."
else
    echo "📁 Staged changes to be committed:"
    git diff --cached --stat
    if [ -z "$COMMIT_MSG" ]; then
        echo ""
        echo "⚠️  You have staged changes but gave no commit message."
        echo "    Usage: ./update_portfolio.sh \"commit message\""
        exit 1
    fi
    echo ""
    read -r -p "Commit these staged changes? [y/N] " confirm
    case "$confirm" in
        [yY]|[yY][eE][sS]) git commit -m "$COMMIT_MSG" ;;
        *) echo "Skipping commit; staged changes left untouched." ;;
    esac
fi

# Push any local commits not yet on origin so the server's pull picks them up
# (no-op / "Everything up-to-date" if there's nothing to push).
git push

# --- 3. Update the server -------------------------------------------------------
echo "🚀 Updating server..."
ssh "$SERVER" << 'ENDSSH'
cd /root/shmspace/shmspace-backend
git pull
pm2 restart my-app
echo "✅ Server updated and restarted"
ENDSSH

echo "✨ Portfolio updated successfully!"
