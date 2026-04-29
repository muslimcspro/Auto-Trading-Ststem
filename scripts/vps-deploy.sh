#!/usr/bin/env bash
set -euo pipefail

if [ ! -f .env ]; then
  cp oracle.env.example .env
  sed -i 's/^APP_DOMAIN=.*/APP_DOMAIN=trading71.uk/' .env
  echo "Created .env with APP_DOMAIN=trading71.uk."
fi

git pull --ff-only
docker compose -f docker-compose.oracle.yml up -d --build
docker compose -f docker-compose.oracle.yml ps
