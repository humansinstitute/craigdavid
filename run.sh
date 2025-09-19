#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# Build the application
echo "Building application..."
npm run build

# Start all processes in parallel
echo "Starting server and file watchers..."

# Start the server
node server.js &
SERVER_PID=$!

# Start the test-cvm watcher
CVM_DEBUG=1 node test-cvm.js &
TEST_CVM_PID=$!

# Start the context-vm-watcher
CVM_DEBUG=1 node context-vm-watcher.js &
WATCHER_PID=$!

# Start the montage watcher
CVM_DEBUG=1 node context-montage-watcher.js &
MONTAGE_WATCHER_PID=$!

# Start the montage video poster watcher
VIDEO_POSTER_DEBUG=1 node montage-video-poster-watcher.js &
VIDEO_POSTER_PID=$!

echo "Started processes:"
echo "  Server: PID $SERVER_PID"
echo "  Test CVM: PID $TEST_CVM_PID"
echo "  Context VM Watcher: PID $WATCHER_PID"
echo "  Montage Watcher: PID $MONTAGE_WATCHER_PID"
echo "  Video Poster Watcher: PID $VIDEO_POSTER_PID"

# Function to cleanup on exit
cleanup() {
    echo -e "\nShutting down processes..."
    kill $SERVER_PID 2>/dev/null
    kill $TEST_CVM_PID 2>/dev/null
    kill $WATCHER_PID 2>/dev/null
    kill $MONTAGE_WATCHER_PID 2>/dev/null
    kill $VIDEO_POSTER_PID 2>/dev/null
    exit
}

# Trap SIGINT (Ctrl+C) to cleanup
trap cleanup SIGINT

# Keep the script running
echo "Press Ctrl+C to stop all processes"
wait
