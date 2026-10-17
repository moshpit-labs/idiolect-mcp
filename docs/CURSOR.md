# Idiolect AI for Cursor

This MCP-only Cursor plugin connects to `https://idiolect.app/api/mcp`. It uses your own
Idiolect AI account and portable Writing Profile. It adds no hooks, scripts or local executables.

The root `.cursor-plugin/plugin.json` loads the existing `.mcp.json`. For local development,
load this checkout with `cursor-agent --plugin-dir /path/to/idiolect-mcp`. Use one Idiolect AI
connection at a time. You can also use the manual MCP configuration in the main README.

In Cursor's MCP controls, choose **Authenticate** for Idiolect AI and complete browser sign-in.
Review the consent screen and approve only the tool actions you want to use. No API key,
copied token or client secret is required.

Ask Idiolect AI to write from your request, or revise supplied prose. `refine_writing` changes
writing it returned using its latest writing reference. Profile reads and changes are separate
tools; writing does not require you to fetch a profile first.

On 17 October 2026, this package at commit
`43b3b3bd8041180eca5283c688d134a6e36156a9` was installed in released Cursor 3.25.6 and passed
native OAuth and writing. A single `refine_writing` call reached Idiolect AI, but the account
had no writing allowance remaining. No refined output or saved version was produced, so
refinement was not verified in this check. No further test was run.

See [Cursor's plugin reference](https://cursor.com/docs/reference/plugins) and
[MCP guide](https://cursor.com/docs/mcp). Service information:
[privacy](https://idiolect.app/privacy), [terms](https://idiolect.app/terms), and
[support](https://idiolect.app/support).
