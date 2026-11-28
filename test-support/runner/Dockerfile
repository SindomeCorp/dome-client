FROM node:26.12.1-bookworm-slim AS node-runtime
FROM mcr.microsoft.com/playwright:v1.62.1-noble

# Keep the browser libraries from Playwright and pin the Node toolchain separately.
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=node-runtime /usr/local/lib/node_modules/npm/ /opt/dome-node/npm/
RUN ln -sf /opt/dome-node/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -sf /opt/dome-node/npm/bin/npx-cli.js /usr/local/bin/npx \
    && test "$(node --version)" = v26.12.1 \
    && npm --version

WORKDIR /work
