# idiolect-mcp

MCP server that makes any MCP-compatible AI (Claude Desktop, Claude Code, …)
write in **your** voice, using your [Idiolect AI](https://idiolect.app) Voice Card.

## Setup

### Account mode

For account-resolved Writing Profile creation, loading, scoring, rewrite, and draft tools,
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

## Tools

Remote OAuth and account-mode stdio advertise the same user-facing tools.
Setup state, evidence approval, retries, and idempotency stay inside the server;
clients receive one `next` action and never coordinate workflow versions or locks.

- **`write`** — writes new prose in the user's Writing Profile or own style.
- **`rewrite`** — rewrites supplied prose in the user's Writing Profile.
- **`refine_writing`** — changes returned writing, applies a template, or records its outcome.
- **`view_writing_profile`** — lists Writing Profiles and shows the selected or current profile.
- **`list_writing_samples`** — lists the writing behind one profile.
- **`create_writing_profile`** — creates a new profile without changing another.
- **`add_writing_samples`** — adds approved writing to a selected or current profile.
- **`rename_writing_profile`** — renames a profile.
- **`set_current_writing_profile`** — makes a profile current.
- **`set_default_writing_template`** — sets or clears the default template when no profile exists.
- **`add_writing_rule`** — stores a lasting rule in the user's words.
- **`remove_writing_rule`** — stops following one stored rule.
- **`remove_writing_sample`** — revokes one ready or waiting sample.
- **`delete_writing_profile`** — deletes a selected profile.

Cached account-mode tool names remain callable but are not advertised. Slug mode keeps its
legacy local-samples catalogue; locally configured samples are used only for stateless scoring
and are not stored.

When an account has no Writing Profile, `write` and `rewrite` return the setup choices.
`create_writing_profile` returns exact missing blocks and characters when evidence is thin.
Feedback can be accepted, corrected-and-accepted, or rejected only against a
succeeded server-issued output.
Correction prose is retained only when the applicable consent gates permit it and
within its existing expiry rule. An explicitly approved correction can be added as
private V2 evidence; it never changes the current Writing Profile or silently activates
V2. A stored Writing Profile is never described as provisional.

The setup response includes neither an activation token nor a capability/setup URL.
`create_writing_profile` runs only after explicit permission from evidence you supplied or
approved. Creating a profile and
succeeding at a first generation are not activation. Canonical native activation
occurs only after accepted or corrected-and-accepted feedback.

## Credits and retries

Generation is free during beta, and completed drafts and rewrites no longer carry a credit
state. The account's balance and access are shown at idiolect.app/settings. Future credits-mode
states cover available, low, zero, unlimited, and temporarily unavailable balances without
changing the tool names.

A known zero balance returns a structured `purchase_required` tool error with the
stable first-party credit-management path. An accounting outage returns
`accounting_unavailable` without a purchase suggestion. Both denials happen before
generation or charging, so their retry object is explicitly scoped to
`pre_generation`. Successful generation does not yet promise replay after a lost
response, and paid enforcement remains disabled.

Internal generation coordination happens before provider work. A stale internal
state is refreshed before the client receives one public retry action. If durable
completion cannot be confirmed, prose is suppressed and the response uses plain
language without exposing coordination receipts.

Set `IDIOLECT_BASE` to point at a self-hosted instance (defaults to
`https://idiolect.app`).

MIT licensed.
