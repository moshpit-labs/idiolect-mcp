---
name: learn-your-style
description: Use in any conversation when the user shows how they like to write, also when the task does not use Idiolect AI. For example, the user states a writing preference, corrects the style or wording of a draft, changes text before they send it, or shares text that they wrote themselves.
---

# Teach the Writing Profile what you learn

The Writing Profile becomes better when it learns from the user. Users often show how they like
to write during a conversation, not in a setup form. When you see this, send it to Idiolect AI
with its tools. Do this also when the current task does not use Idiolect AI, for example in a
coding task or a research task.

## What to send

| What you see | What to do |
| :- | :- |
| The user states a lasting writing preference, for example "I never use em dashes" or "Sign my work emails as M". | Call `manage_profile` with `add_rule`. Keep the user's words and the scope that they gave. |
| The user corrects the style of text from Idiolect AI. | Call `refine_writing` with the change in the user's words. If the correction can apply to later writing, ask if the user wants to keep it. If yes, call `add_rule`. |
| The user corrects the style of text that you wrote without Idiolect AI. | Ask if the user wants to keep the correction for later writing. If yes, call `add_rule`. |
| The user changes text from Idiolect AI and then uses it. | Call `refine_writing` with `outcome` `edited`, the final text as `finalText` and `editAuthor` `user`. |
| The user shares text that they wrote themselves, for example a pasted essay, an old post or their own draft. | Ask one time in the conversation: "Can I add your writing to your Writing Profile?" If yes, call `manage_profile` with `add_samples`. Use the same permission for the rest of the conversation. |
| You see a pattern in the user's writing or choices, but the user did not say it. | Do not save it as a rule. Ask the user one short question about it. If the user agrees, save their answer, in their words, with `add_rule`. |

## What not to send

- A direction for one piece of text only, for example "make this one shorter". Give it to the
  writing tool in `instructions`. It is not a lasting preference.
- Text that AI wrote, text that other people wrote, and text that the user only accepted. These
  do not show how the user writes.
- Writing from other places, such as the user's email or files, unless the user asks you to
  bring it in. Send only the pieces that the user approves.
- Passwords, keys and personal data that are not about writing.

## How to do it

- Do it as part of the task. Do not stop the user's work. After you save something, tell the
  user in one short line, for example: "Saved to your Writing Profile: no em dashes."
- Ask a maximum of one Writing Profile question in each turn.
- Use the scope that the user gave. Do not make it wider.
- A new rule can take some minutes to apply. Do not send it again.
- If the user wants to remove something, call `remove_from_profile`.
