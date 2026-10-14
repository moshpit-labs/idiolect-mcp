# Idiolect AI for Antigravity

Idiolect AI uses your portable Writing Profile to write and refine prose in your voice.
The publisher is Moshpit Labs; the plugin identifier is `idiolect-ai` and MCP server is `idiolect`.

## Install locally

Antigravity uses its own manifest format. Install the host-specific directory shown below.

```sh
agy plugin install /absolute/path/to/idiolect-mcp/plugins/antigravity/idiolect-ai
agy plugin list --json
```

Alternatively, copy this plugin directory into your workspace's `.agents/plugins/idiolect-ai/`.
Review the loaded plugin and approve only the tools you intend to use. Avoid a duplicate server connection.
On 15 October 2026, official Antigravity CLI 1.3.5 passed local plugin loading, explicit native OAuth authentication, writing and refinement.
The returned writing agreed with the saved versions; refinement retained the original writing job and correct parent.
The host required explicit native MCP authentication before exposing the five tools to the model. Automatic recovery from a protected-call 401 was not verified.
This verifies the tested CLI workflow; IDE, app and marketplace installation remain unverified.
No marketplace acceptance or publication is claimed.

## Account, tools and data

Each person signs in to their own Idiolect AI account through Antigravity's native browser OAuth.
The HTTPS endpoint is `https://idiolect.app/api/mcp`; no token or shared credentials are embedded.
Anonymous tool discovery and lazy sign-in are unchanged. Protected operations require authentication.
Check the account displayed during consent and review the host's tool permissions.

The service advertises `write`, `rewrite`, `refine_writing`, `view_writing_profile`, and `manage_profile`.
Writing sends your request and relevant supplied text to the hosted service; profile operations send material approved for that purpose.
Present returned writing unchanged and use `refine_writing` for follow-up changes. Sending or publishing is a separate action.
This MCP-only plugin adds no skills, rules, subagents, hooks, executables or dependencies.

Read the [privacy policy](https://idiolect.app/privacy), [terms](https://idiolect.app/terms), and [support](https://idiolect.app/support).
For help, email [hello@idiolect.app](mailto:hello@idiolect.app). The package is [MIT licensed](../LICENSE).

References checked on 15 October 2026: [plugins](https://antigravity.google/docs/plugins), [MCP](https://antigravity.google/docs/mcp/), and [CLI installation](https://antigravity.google/docs/cli/install/).
