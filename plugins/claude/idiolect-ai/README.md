# Idiolect AI

Idiolect AI makes the text that Claude writes for you sound like you. It keeps a Writing
Profile of how you write, and it uses that profile when it writes or changes any text you will
put your name on: emails and messages, social posts, essays and articles, reports and docs,
cover letters and bios, speeches, scripts and stories.

## Use it

1. Add the plugin. In Claude Code, run:

   ```
   /plugin install idiolect-ai --marketplace moshpit-labs/idiolect-mcp
   ```

   On claude.ai or in Cowork, add it from **Customize > Plugins**. Then connect the Idiolect AI
   connector from the plugin's **Connectors** tab. Sign in with your Idiolect AI account, or
   make one.
2. Ask Claude to write something as usual. You do not have to name Idiolect AI. Claude uses it
   when the text is yours to send, publish or submit.
3. Tell Claude how you like to write, correct a draft, or share something you wrote. Claude
   sends what it learns to your Writing Profile, so later writing sounds more like you.

4. To build or improve your Writing Profile, run `/idiolect-ai:setup` in Cowork or Claude Code,
   or ask Claude in chat to set up your Writing Profile.

The plugin works in Claude chat, Cowork and Claude Code.

## Data

The plugin sends data only to Idiolect AI, through the connector at `https://idiolect.app/api/mcp`:

- the facts, notes and text you ask Claude to write or change;
- writing preferences you state, and corrections you make;
- samples of your own writing, only after you agree to add them.

Idiolect AI keeps your Writing Profile in your account. You can see it, change it and delete
parts of it at any time. See the [privacy policy](https://idiolect.app/privacy). The plugin
itself runs no code and stores nothing.
