#!/bin/sh
set -e

echo "Running database migrations..."
./node_modules/.bin/node-pg-migrate -m apps/api/migrations up

echo "Starting server..."
exec node apps/api/dist/main.js
