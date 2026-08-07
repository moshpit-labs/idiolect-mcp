# idiolect-mcp

MCP server that makes any MCP-compatible AI (Claude Desktop, Claude Code, …)
write in **your** voice, using your [Idiolect AI](https://idiolect.app) Voice Card.

Published in the official MCP Registry as `app.idiolect/idiolect-ai`.

## Remote connector (recommended)

Most clients want the hosted endpoint rather than this package — Streamable HTTP
with OAuth 2.1, nothing to install and no key to paste:

```
https://idiolect.app/api/mcp
```

Setup per client: **https://idiolect.app/developers/mcp**

The stdio server below is for clients without remote MCP support, and for anyone
who would rather run the process themselves.

## Setup

### Account mode

For account-resolved Voice Profile creation, loading, scoring, rewrite, and draft tools,
set `IDIOLECT_API_KEY`:

```json
{
  "mcpServers": {
    "idiolect": {
      "command": "npx",
      "args": ["-y", "idiolect-mcp"],
      "env": { "IDIOLECT_API_KEY": "idiolect_..." }
    }
  }
}
```

### Slug mode

1. Get your voice at **https://idiolect.app** — note the slug in your result URL
   (`idiolect.app/v/<slug>`).
2. Add to your MCP config:

```json
{
  "mcpServers": {
    "idiolect": {
      "command": "npx",
      "args": ["-y", "idiolect-mcp"],
      "env": { "IDIOLECT_SLUG": "your-slug" }
    }
  }
}
```

## Tool

- **`get_my_voice`** — returns your Voice Card. The model calls it before writing
  on your behalf, then writes as you. Pass `slug` per-call or set `IDIOLECT_SLUG`.
- **`create_my_voice`** — account mode only. Creates your private Voice Profile
  from writing you supply or explicitly approve. Safe retries use an idempotency key.
- **`score_voice`** — scores text against your voice. In account mode this uses
  your API key; in slug mode it uses your local writing samples.
- **`rewrite_in_voice`** — account mode only. Rewrites drafted prose in your
  actual voice.
- **`draft_in_voice`** — account mode only. Drafts from a brief in your voice.

`create_my_voice` sends the approved writing to your Idiolect AI account and stores it
as private Voice Profile evidence; it is never returned by the tool. In slug mode,
locally configured samples are used only for stateless scoring and are not stored.

When an account has no Voice Profile yet, `get_my_voice` keeps setup inside the
conversation: paste 3–5 examples you wrote, or ask for the short guided interview.
The response never includes an activation token, and `create_my_voice` runs only after
you explicitly ask to create the profile from the evidence you supplied or approved.

Set `IDIOLECT_BASE` to point at a self-hosted instance (defaults to
`https://idiolect.app`).

## Docker

A reference image is included, mostly so directory crawlers can start the server
and introspect it. `tools/list` answers with no credentials; the tools themselves
need a key or slug. Use `-i` — the transport is stdio, not a port.

```bash
docker build -t idiolect-mcp .
docker run -i --rm -e IDIOLECT_API_KEY=idiolect_... idiolect-mcp
```

MIT licensed.
