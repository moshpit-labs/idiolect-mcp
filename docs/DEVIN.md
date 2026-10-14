# Idiolect AI for Devin CLI

This package connects Devin CLI to Idiolect AI's hosted writing service.
Its plugin identifier is `idiolect-ai`; the MCP server name remains `idiolect`.
The publisher is Moshpit Labs and the license is MIT.
It adds no skills, hooks, agents, local executable, or dependencies.

## Format and local installation

Devin supports the existing Agent Plugins 1.0 root `plugin.json` and `mcp.json`.
No additional Devin manifest is needed.
The existing `.mcp.json` takes precedence for a matching server name in Devin.
Both configurations point to the same hosted Idiolect AI endpoint.

For an isolated device-only test, after signing in to Devin:

```sh
devin plugins install --local /absolute/path/to/idiolect-mcp
devin plugins info idiolect-ai
```

Use `--local`: a normal install can sync the plugin to your personal cloud manifest.
Review the installation preview and approve only this package.
Native Devin installation, OAuth, writing, and refinement remain untested.
Static package validation does not prove those workflows.

## Personal account and consent

Each person connects their own Idiolect AI account.
The hosted service allows anonymous discovery and requires sign-in for protected operations.
This packaging keeps lazy sign-in unchanged.
In the CLI, use Devin's native `devin mcp login` flow for the plugin's OAuth server.
Check the selected server and account, and review browser consent and tool permissions.
No API key, token, client secret, or shared organization account is included.
Connecting does not approve arbitrary writing imports or sending or publishing finished writing.

## Tools, data, and support

The service advertises `write`, `rewrite`, `refine_writing`, `view_writing_profile`, and `manage_profile`.
Writing calls send the request and relevant supplied text to Idiolect AI.
Profile operations send only material approved for the requested purpose.
Present returned writing unchanged; use `refine_writing` for requested follow-up edits.
Sending or publishing remains a separate action.

The configured endpoint is `https://idiolect.app/api/mcp` over HTTPS.
Browser authentication follows the service's discovered OAuth flow; Devin manages connection credentials.
This package starts no local process and configures no local file or environment-variable reads.

Read the [privacy policy](https://idiolect.app/privacy) and [terms](https://idiolect.app/terms).
Use [support](https://idiolect.app/support) or [hello@idiolect.app](mailto:hello@idiolect.app) for help.
See [LICENSE](../LICENSE) for the MIT license.

## Scope and references

This preparation targets local Devin CLI with a personal account.
It does not establish cloud-session or Devin Desktop compatibility.
No marketplace submission, acceptance, or publication is claimed.

Checked on 14 October 2026:

- [Devin CLI plugins and compatible formats](https://docs.devin.ai/cli/extensibility/plugins/overview)
- [Official marketplace contribution instructions](https://github.com/CognitionAI/devin-marketplace/blob/main/.agents/skills/adding-a-plugin/SKILL.md)

A future third-party marketplace entry must pin the official MCP repository to a full public commit SHA.
Marketplace contributions require the submitting owner's Contributor License Agreement acceptance.
