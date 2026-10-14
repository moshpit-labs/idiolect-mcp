# Idiolect AI for Grok Build

This MCP-only plugin connects Grok Build to Idiolect AI's hosted writing service.
It adds no skills, hooks, shell commands, executable files, or dependencies.
It does not change Idiolect AI's lazy sign-in behavior.

## Installation and verification

This is a local packaging candidate, not a published marketplace entry.
Native Grok Build installation, OAuth, writing, and refinement have not been tested.
The official Grok Build CLI 1.0.52 accepts this manifest with `grok plugin validate`.
Manifest validation does not prove those workflows.

For a local test, use a checkout containing `.grok-plugin/plugin.json` and `.mcp.json`:

```sh
grok --plugin-dir /absolute/path/to/idiolect-mcp
```

Open `/plugins` to check the plugin, then `/mcps` to inspect its `idiolect` connection.
Use `grok inspect` to see configuration origins and avoid a duplicate Idiolect connection.
Use `grok mcp doctor idiolect` for connection diagnostics.
A visible catalog alone does not prove that protected writing works.

A future marketplace entry must reference the official
`https://github.com/moshpit-labs/idiolect-mcp.git` repository and pin a full 40-character commit SHA.
That public commit must contain this packaging. No release SHA is selected yet.
Installing the candidate does not publish or submit it to the marketplace.

## Account, consent, and permissions

Each person signs in with their own Idiolect AI account.
The hosted service permits public discovery and requests sign-in for protected operations.
Grok Build documents browser OAuth on first use and authentication from `/mcps` with `i`.
Complete browser consent when requested and check the account shown there.
This plugin contains no API key, client secret, token, or shared account.
Grok Build manages OAuth tokens; its documentation locates them in `~/.grok/mcp_credentials.json`.
Do not commit or share that file.

Review Grok Build's tool permissions before use.
Connection consent does not approve arbitrary writing imports, publishing, or sending messages.
For profile evidence, approve the exact pieces of your own writing before they are submitted.

## Tools and data

The hosted service currently advertises five tools:

- `write` creates writing from your request, facts, or notes.
- `rewrite` changes supplied prose; directions travel separately in `instructions`.
- `refine_writing` revises returned writing using its writing reference.
- `view_writing_profile` reads your current Writing Profile, rules, or samples.
- `manage_profile` creates or changes Writing Profiles and stated rules.

Writing calls send your request and relevant supplied text to Idiolect AI.
Profile operations send the approved material needed for the requested change.
Writing history and profiles belong to the signed-in account.
Present returned writing unchanged; use `refine_writing` for requested follow-up edits.
Sending or publishing writing is a separate action outside this plugin.

## Network, privacy, and support

The only configured MCP endpoint is `https://idiolect.app/api/mcp` over HTTPS.
Browser sign-in follows the service's OAuth discovery and consent flow.
The plugin itself reads no local files or environment variables and starts no local process.
The existing npm stdio bridge in this repository is separate and is not invoked by this config.

Read the [privacy policy](https://idiolect.app/privacy) and [terms](https://idiolect.app/terms).
Use [support](https://idiolect.app/support) or [hello@idiolect.app](mailto:hello@idiolect.app) for help.
The packaging is MIT licensed; see [LICENSE](../LICENSE).

## References checked on 14 October 2026

- [Grok Build plugins](https://docs.x.ai/build/features/skills-plugins-marketplaces)
- [Grok Build MCP servers](https://docs.x.ai/build/features/mcp-servers)
- [Marketplace format](https://github.com/xai-org/plugin-marketplace/blob/main/README.md)
- [Marketplace contribution requirements](https://github.com/xai-org/plugin-marketplace/blob/main/CONTRIBUTING.md)
