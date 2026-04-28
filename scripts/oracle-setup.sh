#!/usr/bin/env bash
set -euo pipefail

if ! command -v apt-get >/dev/null 2>&1; then
  echo "This setup script expects Ubuntu/Debian on the Oracle VM."
  exit 1
fi

sudo apt-get update
sudo apt-get install -y ca-certificates curl git ufw

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
fi

sudo usermod -aG docker "$USER"
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

echo
echo "Server base setup complete."
echo "Log out and SSH back in once so Docker group permissions apply."
