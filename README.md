# Idiolect AI MCP server

Write and revise emails, messages, posts, replies, and docs in your voice with your portable
Writing Profile. Idiolect AI creates new writing directly from your request and revises text
you supply. You do not need to fetch a profile before writing.

## Connect with hosted OAuth

Use **`https://idiolect.app/api/mcp`** in a client that supports remote HTTP MCP and OAuth.
Your client opens browser sign-in and manages the connection. No npm installation, API key,
or client secret is needed for this path. Review the consent screen and your client's tool
permissions. Avoid adding a second connection if Idiolect AI is already connected.

### Codex

```sh
codex mcp add idiolect --url https://idiolect.app/api/mcp
codex mcp login idiolect
```

See the [Codex MCP guide](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

### Cursor

Add this to `.cursor/mcp.json`, then complete OAuth sign-in in Cursor's MCP settings:

```json
{
  "mcpServers": {
    "idiolect": {
      "url": "https://idiolect.app/api/mcp"
    }
  }
}
```

See the [Cursor MCP guide](https://cursor.com/docs/mcp).

### VS Code with GitHub Copilot

Add this to `.vscode/mcp.json`. Start the server from the MCP controls and complete sign-in:

```json
{
  "servers": {
    "idiolect": {
      "type": "http",
      "url": "https://idiolect.app/api/mcp"
    }
  }
}
```

See the [VS Code MCP configuration reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration).

### OpenCode

Add this to `opencode.json` in your project:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "idiolect": {
      "type": "remote",
      "url": "https://idiolect.app/api/mcp",
      "enabled": true
    }
  }
}
```

Then run `opencode mcp auth idiolect` and check the connection with `opencode mcp list`.
See the [OpenCode MCP guide](https://opencode.ai/docs/mcp-servers/).

These examples configure the connection. A connected catalog does not prove a complete
writing workflow in every client. Your client's model access and tool approvals also apply.

### Optional OAuth adapter for Cursor and OpenCode

If native MCP login reports a connection but tools return Unauthorized, discovery may have
completed without account sign-in. You can use the third-party
[`mcp-remote`](https://github.com/punkpeye/mcp-remote) OAuth adapter below. It requires Node.js
and npm, runs locally, and connects to the same hosted service. Keep your native configuration
or replace its Idiolect AI entry with the adapter; do not enable both as duplicate connections.

For Cursor, use this `.cursor/mcp.json` entry:

```json
{
  "mcpServers": {
    "idiolect": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote@0.14.3",
        "https://idiolect.app/api/mcp",
        "--transport",
        "http-only"
      ]
    }
  }
}
```

For OpenCode, use this `opencode.json` entry:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "idiolect": {
      "type": "local",
      "command": [
        "npx",
        "-y",
        "mcp-remote@0.14.3",
        "https://idiolect.app/api/mcp",
        "--transport",
        "http-only"
      ],
      "enabled": true
    }
  }
}
```

Start the connection in your client and complete the adapter's browser sign-in with the same
Idiolect AI account that owns your Writing Profile. Keep normal tool approvals enabled.
For a new sign-in that needs account re-verification, you can append `"--authorize-param"`,
`"prompt=login"` to the adapter arguments. This is optional; do not force re-authentication
for routine use. Existing cached credentials are reused by the adapter.

The adapter keeps OAuth tokens locally and adds a third-party dependency. You can replace it
with the native connection when your client's OAuth flow works. This fallback does not establish
native OAuth support or a complete writing workflow in every client.

## Writing tools

Hosted OAuth and API-key account mode advertise these five tools:

- `write` creates writing from your request, facts, or notes.
- `rewrite` changes supplied prose. Your directions stay separate in `instructions`.
- `refine_writing` changes writing Idiolect AI returned, using its latest writing reference.
- `view_writing_profile` reads your current Writing Profile, rules, or samples.
- `manage_profile` creates or changes Writing Profiles and stated rules.

If you have no Writing Profile, the service offers setup from your own writing or answers.
You can skip setup and complete that request without a profile. Follow the returned setup
choices and reference; do not restart the held request. Whole-profile deletion is on the website.

Use your own authored writing as profile evidence. Fetch writing from another source only
when you ask, and send only the exact pieces you approve. Do not save AI or third-party prose
as your writing, or turn inferred patterns into your stated rules.

The service returns finished writing. Preserve its wording when presenting it, and use
`refine_writing` for follow-up edits. Ordinary writing does not report a Voice Match score.
Sending or publishing the result is a separate action in your client.

## npm and API-key account mode

The `idiolect-mcp` npm package is a local **stdio** bridge to the hosted service. Use it when
your client needs a local process instead of hosted OAuth. It requires Node.js 18 or newer
and an Idiolect AI API key for account mode; it does not perform browser OAuth itself.

```json
{
  "mcpServers": {
    "idiolect": {
      "command": "npx",
      "args": ["-y", "idiolect-mcp"],
      "env": {
        "IDIOLECT_API_KEY": "<your-api-key>"
      }
    }
  }
}
```

Replace the placeholder through your client's private credential configuration. Never commit
an actual key. `IDIOLECT_BASE` changes the service URL for a self-hosted instance; its default
is `https://idiolect.app`.

### Legacy slug mode

Without an API key, the stdio package exposes its separate legacy catalog. `IDIOLECT_SLUG`
selects a public Voice Card; it does not select an authenticated account's Writing Profile.
Optional `IDIOLECT_SAMPLES_FILE` or `IDIOLECT_SAMPLES` supplies samples for stateless scoring.
This compatibility path is distinct from the five account tools above. Prefer hosted OAuth
for current writing and profile workflows.

## Privacy, support, and maintenance

Writing requests and approved evidence go to the hosted service. Your client controls its
OAuth tokens and tool permissions. Read the [privacy policy](https://idiolect.app/privacy)
and [terms](https://idiolect.app/terms). For help, use [support](https://idiolect.app/support)
or email [hello@idiolect.app](mailto:hello@idiolect.app).

The product repository's `mcp/README.md` is the source used by future exports of this package.
The [MCP playbook](https://github.com/Moshpit-Labs/idiolect-ai/blob/main/docs/MCP-PLAYBOOK.md)
defines its writing and review rules. Generated catalog files come from that repository's
canonical contract and must not be edited by hand.

MIT licensed.
