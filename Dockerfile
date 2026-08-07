# Reference container for the Idiolect AI stdio MCP server.
#
# Exists mainly so directory crawlers (Glama and friends) can start the server and
# introspect it. `tools/list` answers with no credentials configured; the tools
# themselves then need IDIOLECT_API_KEY (account mode) or IDIOLECT_SLUG (slug mode),
# and every one of them calls https://idiolect.app — there is nothing to run locally.
#
#   docker build -t idiolect-mcp .
#   docker run -i --rm -e IDIOLECT_API_KEY=idiolect_... idiolect-mcp
#
# -i is required: the transport is stdio, not a port.

FROM node:22-alpine

WORKDIR /app

# Deps first, so edits to server.mjs don't re-resolve the tree.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.mjs ./

# Don't run the server as root; it makes outbound HTTPS calls.
USER node

ENTRYPOINT ["node", "/app/server.mjs"]
