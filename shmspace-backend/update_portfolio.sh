#!/bin/bash
# Save as: update_portfolio.sh

# Check if commit message was provided
if [ -z "$1" ]; then
    echo "Usage: ./update_portfolio.sh \"commit message\""
    exit 1
fi

echo "📁 Committing local changes..."
git add .
git commit -m "$1"
git push

echo "🚀 Updating server..."
ssh root@45.79.81.173 << 'ENDSSH'
cd /root/shmspace/shmspace-backend
git pull
pm2 restart my-app
echo "✅ Server updated and restarted"
ENDSSH

echo "✨ Portfolio updated successfully!"