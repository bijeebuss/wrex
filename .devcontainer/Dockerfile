FROM mcr.microsoft.com/devcontainers/typescript-node:1-22-bookworm

USER root
# Install Playwright browser dependencies (system libs for Chromium)
RUN npx playwright install-deps chromium

USER node
# Install Claude CLI as part of the build
RUN curl -fsSL https://claude.ai/install.sh | bash
