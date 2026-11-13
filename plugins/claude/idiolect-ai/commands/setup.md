---
description: Set up or improve your Idiolect AI Writing Profile from writing you approve. Use when the user wants Idiolect AI to learn how they write, or asks to set up, start or improve their Writing Profile.
---

# Set up the Writing Profile

Help the user give Idiolect AI good examples of how they write. Good examples make every later
piece of writing sound more like the user.

1. **Check what exists.** Call `view_writing_profile`. If the connector is not connected, tell the
   user to connect Idiolect AI from the plugin's **Connectors** tab, then stop.
2. **Ask what the user writes.** Ask one short question: "What kinds of writing do you do most?"
   Writers are different. Some write emails and messages. Others write essays, posts, reports,
   papers, scripts or stories. Use the user's answer to choose what to collect.
3. **Collect writing that the user wrote themselves.** Ask for a few pieces of different kinds
   and lengths. The user can:
   - paste text or attach files;
   - ask you to get pieces from a connected app or folder, such as their sent email, chat
     messages, documents, notes or blog. Get only what the user asks for. Show the user what you
     found, and use only the pieces that the user approves.
4. **Check each piece.** Use only text that the user wrote. Do not use text that AI wrote, text
   that other people wrote, quoted replies, signatures or templates. Remove these parts from a
   piece before you send it.
5. **Send the writing.**
   - If the user has no Writing Profile, call `manage_profile` with `create_profile` and the
     approved pieces as `evidence`.
   - If the user has a Writing Profile, call `manage_profile` with `add_samples`.
6. **Answer the questions.** Idiolect AI can ask questions about how the user writes. Ask the user
   these questions, and send the answers with `answer_question`.
7. **Show the result.** Call `view_writing_profile` and tell the user, in a few lines, what Idiolect
   AI learned. If the user says that a habit is correct, call `confirm_habit`. If the user says
   that a habit is wrong, ask how they really write and call `add_rule` with `correctsHabitId`.

If the user has no writing to share, call `write` for the first piece that they need. Its first
result can ask questions about how the user writes instead.

$ARGUMENTS
