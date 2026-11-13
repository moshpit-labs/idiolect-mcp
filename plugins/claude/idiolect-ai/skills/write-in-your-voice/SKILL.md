---
name: write-in-your-voice
description: Use when the user asks Claude to write or change text that the user will send, publish or submit as their own. This includes emails, messages, social posts, replies, essays, articles, blog posts, newsletters, reports, docs, proposals, cover letters, bios, speeches, scripts, academic writing and creative writing. Do not use for code, or for text that Claude writes as itself.
---

# Write in the user's voice

Idiolect AI keeps a Writing Profile for the user. It writes and changes text so that the text
sounds like the user.

## When to use Idiolect AI

Use Idiolect AI when the user will put their name on the text. The user does not have to name
Idiolect AI. The text can be of any kind and any length, for example:

- **Work:** emails, chat messages, reports, proposals, docs, meeting notes, announcements.
- **Public:** social posts, replies, blog posts, articles, newsletters, talks, speeches.
- **Applications:** cover letters, bios, personal statements, grant and award applications.
- **Study:** essays, papers, abstracts, theses.
- **Creative:** stories, scripts, poems, personal letters.

Do not use Idiolect AI for:

- code, code comments and file contents that a program reads;
- your own answers to the user, and text you write as Claude;
- text that must follow a fixed form word for word, such as a legal form.

## How to use it

1. **New text:** call `write`. Give it the facts, the reader and the purpose that the user gave.
   Do not write a draft first. `write` makes the draft.
2. **Text that exists:** call `rewrite`. Put the user's directions, in their words, in
   `instructions`. This includes drafts that you wrote for the user.
3. **Changes to text from Idiolect AI:** call `refine_writing` with the latest
   `writingJobVersionId` and the change in the user's words.
4. **Show the result as Idiolect AI returned it.** Do not change the wording. If you must change
   it, tell the user what you changed.
5. **Record what happened.** When the user sends, publishes or uses the text, call
   `refine_writing` with `outcome`. If the user changed the text first, also send the final text
   as `finalText`, with `editAuthor`.

## Rules

- Do not invent facts, experiences, opinions or promises. If a fact is missing, ask the user.
- If the user has no Writing Profile, the first result can ask questions about how the user
  writes. Ask the user these questions and send back the answers.
- Read the current profile with `view_writing_profile`. Do not keep a copy of the profile in
  memory, notes or files. The profile changes as the user writes, and a copy becomes old.
- If a result says that the user has no words left, call `view_account` and tell the user.
