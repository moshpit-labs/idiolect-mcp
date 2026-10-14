# Idiolect AI for GitHub Copilot CLI

This Agent Plugins 1.0 package connects interactive GitHub Copilot CLI to Idiolect AI's hosted MCP service.
It contains one remote MCP configuration and no skills, hooks, agents, or local executable.
Packaging version `1.0.0` is manifest metadata, not a release or published marketplace listing.

## Local installation

From a checkout containing the root `plugin.json` and `mcp.json`:

```sh
copilot plugin install /absolute/path/to/idiolect-mcp
copilot plugin list
```

Copilot CLI caches installed plugins. Reinstall after local packaging changes.
Avoid a duplicate connection if Idiolect AI is already configured.
On 14 October 2026, Copilot CLI 1.0.97 passed local marketplace installation and explicit browser OAuth authentication.
Writing and refinement each made one MCP call and presented the returned writing unchanged.
Saved ownership, the selected test profile, and refinement parent linkage were verified.
Anonymous discovery remains available. Automatic sign-in recovery after a protected tool returns 401 was not tested.

## Account and permissions

Each person connects their own Idiolect AI account through browser OAuth.
The service permits public discovery and requires sign-in for protected operations.
This packaging preserves lazy sign-in; it contains no token, API key, or client secret.
Review the account and consent screen, then review Copilot's tool permissions.
Connecting does not approve importing arbitrary writing or sending or publishing results.

This package targets interactive Copilot CLI.
It makes no OAuth compatibility claim for the GitHub cloud agent or code review.

## Writing and data

The service advertises `write`, `rewrite`, `refine_writing`, `view_writing_profile`, and `manage_profile`.
Use `write` for a new request, `rewrite` for supplied prose, and `refine_writing` for returned writing.
Writing calls send the request and relevant supplied text to Idiolect AI.
Profile changes send only the material you approve for that purpose.
Present returned writing unchanged; sending or publishing it is a separate action.

The only configured endpoint is `https://idiolect.app/api/mcp` over HTTPS.
Browser sign-in follows the service's discovered OAuth flow; Copilot manages the connection credentials.
No local process, file-reading tool, or environment-variable access is configured by this package.
The repository's npm bridge and Grok Build configurations are separate and unchanged.

Read the [privacy policy](https://idiolect.app/privacy) and [terms](https://idiolect.app/terms).
Use [support](https://idiolect.app/support) or [hello@idiolect.app](mailto:hello@idiolect.app) for help.
The package is MIT licensed; see [LICENSE](../LICENSE).

## Format references checked on 14 October 2026

- [Creating Copilot CLI plugins](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-creating)
- [Agent Plugins manifest schema](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json)
- [Agent Plugins MCP schema](https://agent-plugins.org/schemas/1.0.0/mcp.schema.json)

The root manifest selects Agent Plugins 1.0 through its canonical `$schema`.
This format reads MCP configuration from root `mcp.json` with transport `streamable-http`.
