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

### GitHub Copilot CLI

See the [Copilot CLI plugin guide](docs/COPILOT.md) for the Agent Plugins 1.0 package and local installation.
Native testing of this package is pending; this is separate from the VS Code setup above.

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

Use your own authored writing as profile evidence. Your host can fetch it when you ask.
Review the retrieved pieces, then approve the exact pieces to send for your Writing Profile.
When submitting evidence, the host sets `evidence.userApproved` to `true` only after that approval.
It uses `evidence.source` `sent_writing` for messages you previously sent to others.
It uses `current_request` for other material you supply or approve for the current request.
These values follow the evidence contract; they do not identify the external storage service.
Do not save AI or third-party prose as your writing, or turn inferred patterns into your stated rules.

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

For contributions, keep setup examples aligned with the writing tools and evidence rules above.
Check that examples use supported fields and preserve user approval and the returned writing.
Generated catalog files come from the product repository's canonical contract.
Report catalog changes in an issue rather than editing generated files by hand.

MIT licensed.
