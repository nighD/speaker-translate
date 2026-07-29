#!/bin/bash

# Function to clean up background processes on exit
cleanup() {
    echo "Stopping servers..."
    kill $BACKEND_PID
    kill $FRONTEND_PID
    exit
}

# Trap SIGINT (Ctrl+C) and call the cleanup function
trap cleanup SIGINT

echo "Starting Backend (Port 4000)..."
cd backend
npm run dev &
BACKEND_PID=$!

cd ..

echo "Starting Frontend (Port 3000)..."
cd frontend
npm run dev &
FRONTEND_PID=$!

cd ..

echo ""
echo "Both servers are running!"
echo "Frontend: http://localhost:3000"
echo "Backend:  http://localhost:4000"
echo ""
echo "Press Ctrl+C to stop both servers."

# Wait for both background processes
wait $BACKEND_PID $FRONTEND_PID
