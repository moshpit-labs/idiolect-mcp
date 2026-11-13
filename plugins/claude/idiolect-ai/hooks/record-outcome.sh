#!/bin/sh
# Runs after a tool that can send or publish text. It reads nothing and
# sends nothing. It only gives Claude a reminder to record the outcome of
# Idiolect AI writing, so that the Writing Profile learns from it.
cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"Idiolect AI: if this tool sent, posted or published text that Idiolect AI wrote or rewrote in this conversation, call refine_writing with its latest writingJobVersionId and outcome kept, or edited with the final text as finalText and editAuthor. If the text did not come from Idiolect AI, or the tool only saved a draft, do nothing."}}
JSON
