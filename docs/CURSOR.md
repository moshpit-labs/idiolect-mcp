# Idiolect AI for Cursor

This MCP-only Cursor plugin connects to `https://idiolect.app/api/mcp`. It uses your own
Idiolect AI account and portable Writing Profile. It adds no hooks, scripts or local executables.

The root `.cursor-plugin/plugin.json` loads the existing `.mcp.json`. For local development,
load this checkout with `cursor-agent --plugin-dir /path/to/idiolect-mcp`. Use one Idiolect AI
connection at a time. You can also use the manual MCP configuration in the main README.

Public tool discovery does not require sign-in. Complete native OAuth when your client asks
for access to a protected operation. Review the consent screen and approve only the tools you
want to use. No API key, copied token or client secret is required.

Ask Idiolect AI to write from your request, or revise supplied prose. `refine_writing` changes
writing it returned using its latest writing reference. Profile reads and changes are separate
tools; writing does not require you to fetch a profile first.

On 15 October 2026, native OAuth, writing and refinement passed with a locally patched Cursor
CLI 2026.10.14-941492e. The released CLI still needs an OAuth fix for public discovery; this
result does not establish compatibility with released Cursor desktop. The package itself has
not yet been installed and tested as a Cursor plugin.

See [Cursor's plugin reference](https://cursor.com/docs/reference/plugins) and
[MCP guide](https://cursor.com/docs/mcp). Service information:
[privacy](https://idiolect.app/privacy), [terms](https://idiolect.app/terms), and
[support](https://idiolect.app/support).
