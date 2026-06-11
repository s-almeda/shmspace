#!/bin/bash
# update_portfolio.sh — sync portfolio media to the server and commit code/metadata changes.
#
# Workflow:
#   1. Media files (images + video) under portfolio/ are rsync'd straight to the
#      server. They are NOT committed to git (see .gitignore).
#   2. You stage the text/code/metadata changes you actually want yourself
#      (git add <file> ...). This script commits + pushes ONLY what is staged.
#   3. The server pulls and restarts.
#
# Usage: ./update_portfolio.sh "commit message"

set -euo pipefail

SERVER="root@45.79.81.173"
SERVER_BASE="/root/shmspace/shmspace-backend"

if [ -z "${1:-}" ]; then
    echo "Usage: ./update_portfolio.sh \"commit message\""
    exit 1
fi
COMMIT_MSG="$1"

# --- 1. Upload media to the server (never committed to git) ---------------------
# rsync skips unchanged files (size + mtime) automatically, so re-running is cheap.
MEDIA_FILES=$(find ./portfolio -type f \( \
    -iname "*.mp4"  -o -iname "*.mov"  -o -iname "*.webm" -o \
    -iname "*.png"  -o -iname "*.jpg"  -o -iname "*.jpeg" -o \
    -iname "*.gif"  -o -iname "*.webp" \) 2>/dev/null)

if [ -n "$MEDIA_FILES" ]; then
    echo "📦 Syncing media files to server..."
    while IFS= read -r file; do
        remote_dir="$SERVER_BASE/$(dirname "$file")"
        ssh -n "$SERVER" "mkdir -p '$remote_dir'"
        rsync -e ssh "$file" "$SERVER:$SERVER_BASE/$file" \
            && echo "  ✓ $file" || echo "  ✗ failed: $file"
    done <<< "$MEDIA_FILES"
fi

# --- 2. Commit only what YOU staged (no blanket `git add .`) ---------------------
echo ""
echo "📁 Staged changes to be committed:"
if git diff --cached --quiet; then
    echo "  (nothing staged)"
    echo ""
    echo "⚠️  Nothing is staged, so there is nothing to commit."
    echo "    Stage the files you want with:  git add <file> ..."
    echo "    (media files are uploaded above and don't need committing)"
    exit 1
fi
git diff --cached --stat

echo ""
read -r -p "Commit and push these staged changes? [y/N] " confirm
case "$confirm" in
    [yY]|[yY][eE][sS]) ;;
    *) echo "Aborted. Staged changes left untouched."; exit 1 ;;
esac

git commit -m "$COMMIT_MSG"
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
