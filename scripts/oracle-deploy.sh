#!/usr/bin/env bash
set -euo pipefail

if [ ! -f .env ]; then
  cp oracle.env.example .env
  echo "Created .env from oracle.env.example."
  echo "Edit .env first, then run this script again."
  exit 1
fi

git pull --ff-only
docker compose -f docker-compose.oracle.yml up -d --build
docker compose -f docker-compose.oracle.yml ps
