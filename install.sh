#!/usr/bin/env bash
set -euo pipefail

REPO="https://github.com/bijeebuss/wrex.git"
INSTALL_DIR="${WREX_DIR:-$HOME/wrex}"

info()  { printf '\033[1;34m[wrex]\033[0m %s\n' "$*"; }
error() { printf '\033[1;31m[wrex]\033[0m %s\n' "$*" >&2; }

# --- pre-flight checks ---

if ! command -v node &>/dev/null; then
  error "Node.js is required (>= 22). Install it first: https://nodejs.org"
  exit 1
fi

NODE_MAJOR=$(node -e 'console.log(process.versions.node.split(".")[0])')
if [ "$NODE_MAJOR" -lt 22 ]; then
  error "Node.js >= 22 required (found $(node --version))"
  exit 1
fi

if ! command -v git &>/dev/null; then
  error "Git is required. Install it first."
  exit 1
fi

if ! command -v claude &>/dev/null; then
  error "Claude Code CLI is required. Install it first:"
  error "  curl -fsSL https://claude.ai/install.sh | bash"
  exit 1
fi

# --- clone or update ---

if [ -d "$INSTALL_DIR/.git" ]; then
  info "Updating existing install at $INSTALL_DIR..."
  git -C "$INSTALL_DIR" pull --ff-only
else
  info "Cloning wrex to $INSTALL_DIR..."
  git clone "$REPO" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# --- install ---

info "Installing dependencies..."
npm install

info "Pulling embedding model (this may take a minute)..."
npm run models:pull

info "Setting up database..."
npm run db:push

info "Installing Playwright CLI..."
npm install -g @playwright/cli@latest

if ls "$HOME/.cache/ms-playwright"/chromium-* &>/dev/null; then
  info "Playwright browser already installed, skipping."
else
  info "Installing browser dependencies..."
  npx playwright install --with-deps chromium
fi

# --- done ---

info "Install complete!"
info ""
info "To start wrex:"
info "  cd $INSTALL_DIR"
info "  npm run dev"
info ""
info "The app will be available at http://localhost:55520"
