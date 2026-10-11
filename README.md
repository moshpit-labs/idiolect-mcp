# idiolect-mcp

Idiolect AI creates and revises writing through MCP-compatible AI tools. A Writing Profile
personalizes the result using writing samples, stated preferences, and learned patterns.
Writing requests do not need a brand mention or an existing profile.

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

- **`write`** — drafts writing from requests, facts, notes, or outlines.
- **`rewrite`** — corrects, summarizes, expands, simplifies, paraphrases, or repurposes existing text.
- **`refine_writing`** — changes returned writing, applies a template, or records its outcome.
- **`view_writing_profile`** — read-only: lists Writing Profiles, shows one, and with `samples` lists its writing.
- **`manage_profile`** — every change, by `action`: `create_profile`, `add_samples`, `remove_sample`,
  `add_rule`, `remove_rule`, `rename_profile`, `set_current_profile`, `set_default_template`.

Deleting a whole profile is done on the website. The former per-action profile tools
(`add_writing_rule`, `delete_writing_profile` and the rest) still work and answer as
`manage_profile` with that action, but are not advertised.

Profile creation, approved samples, and lasting preferences can be part of writing and
revision workflows. They do not require a separate profile-management request. Inferred
patterns can contribute approved authored examples; they must not become user-stated rules.
See [the MCP playbook](../docs/MCP-PLAYBOOK.md) for writing and review rules.

Cached account-mode tool names that hosts still call forward to the current tool and are not
advertised; a retired name answers with the current tool to use instead. Slug mode keeps its
legacy local-samples catalogue; locally configured samples are used only for stateless scoring
and are not stored.

When an account has no Writing Profile, `write` and `rewrite` return the setup choices.
`manage_profile` with `create_profile` returns exact missing blocks and characters when evidence is thin.
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

## Words and retries

Each account has a monthly word allowance from its plan, plus any extra words it has bought.
Usage and the plan are shown at idiolect.app/settings/plan.

When an account has no words left, the drafting and rewriting tools return a tool error
before any generation starts. The error text says how many words were used, when the
allowance resets, and where to see the plan. Nothing is charged for a refused call.

Internal generation coordination happens before provider work. A stale internal
state is refreshed before the client receives one public retry action. If durable
completion cannot be confirmed, prose is suppressed and the response uses plain
language without exposing coordination receipts.

Set `IDIOLECT_BASE` to point at a self-hosted instance (defaults to
`https://idiolect.app`).

MIT licensed.
