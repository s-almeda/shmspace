#!/bin/bash
# Save as: update_portfolio.sh

SERVER="root@45.79.81.173"
SERVER_BASE="/root/shmspace/shmspace-backend"

# Check if commit message was provided
if [ -z "$1" ]; then
    echo "Usage: ./update_portfolio.sh \"commit message\""
    exit 1
fi

# Find files that should be SCP'd: any .mp4 or any file over 8MB in shmspace-backend/
LARGE_FILES=$(find . -type f \( -iname "*.mp4" -o -size +8M \) 2>/dev/null)

# SCP large files directly to server (bypassing git)
if [ -n "$LARGE_FILES" ]; then
    echo "📦 Uploading large files via SCP..."
    while IFS= read -r file; do
        remote_dir="$SERVER_BASE/$(dirname "$file")"
        ssh "$SERVER" "mkdir -p '$remote_dir'"
        scp "$file" "$SERVER:$SERVER_BASE/$file"
        echo "  ✓ $file"
    done <<< "$LARGE_FILES"
fi

echo "📁 Committing local changes..."
git add .

# Unstage large files so they don't get committed to git
if [ -n "$LARGE_FILES" ]; then
    while IFS= read -r file; do
        git reset HEAD "$file" 2>/dev/null || true
    done <<< "$LARGE_FILES"
fi

git commit -m "$1"
git push

echo "🚀 Updating server..."
ssh "$SERVER" << 'ENDSSH'
cd /root/shmspace/shmspace-backend
git pull
pm2 restart my-app
echo "✅ Server updated and restarted"
ENDSSH

echo "✨ Portfolio updated successfully!"