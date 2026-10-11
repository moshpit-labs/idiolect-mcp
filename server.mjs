#!/usr/bin/env node
// Idiolect AI MCP server — gives any MCP-compatible AI (Claude Desktop, Claude
// Code, etc.) your personal voice. Configure with an account API key:
//
//   {
//     "mcpServers": {
//       "idiolect": {
//         "command": "node",
//         "args": ["/path/to/idiolect/mcp/server.mjs"],
//         "env": { "IDIOLECT_API_KEY": "idiolect_...", "IDIOLECT_BASE": "https://idiolect.app" }
//       }
//     }
//   }
//
// Or configure with your Voice Card slug for the legacy local-samples mode:
//
//   {
//     "mcpServers": {
//       "idiolect": {
//         "command": "node",
//         "args": ["/path/to/idiolect/mcp/server.mjs"],
//         "env": { "IDIOLECT_SLUG": "your-slug", "IDIOLECT_BASE": "https://idiolect.app" }
//       }
//     }
//   }

import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  publicMcpState,
} from "./public-contract.js";

const progressiveCatalog = JSON.parse(
  readFileSync(new URL("./progressive-catalog.json", import.meta.url), "utf8"),
);
const PROGRESSIVE_ACCOUNT_TOOL_NAMES = new Set(
  progressiveCatalog.tools.map((tool) => tool.name),
);
/** Cached tool names stay callable through the remote compatibility adapter. */
export const accountRuntimeCompatibilityToolNames = Object.freeze([
  "feedback",
  "refine",
  "profile",
  "list_writing_samples",
  "create_writing_profile",
  "add_writing_samples",
  "rename_writing_profile",
  "set_current_writing_profile",
  "set_default_writing_template",
  "add_writing_rule",
  "remove_writing_rule",
  "remove_writing_sample",
  "delete_writing_profile",
  "learn_writing_style",
  "get_my_voice",
  "create_my_voice",
  "draft_in_voice",
  "rewrite_in_voice",
  "score_voice",
  "set_up_my_voice",
  "record_voice_feedback",
  "write_as_me",
  "rewrite_as_me",
  "list_writing_profiles",
  "list_writing_profile_samples",
  "add_samples_to_writing_profile",
  "replace_samples_in_writing_profile",
  "remove_sample_from_writing_profile",
  "apply_writing_template",
  "clear_default_writing_template",
  "add_writing_preference",
  "remove_writing_preference",
  "remove_learned_writing_preference",
  "list_style_contributions",
  "remove_style_contribution",
]);
const REMOTE_COMPATIBILITY_TOOL_NAMES = new Set(accountRuntimeCompatibilityToolNames);

const BASE = process.env.IDIOLECT_BASE || "https://idiolect.app";
const ACCOUNT_BASE = BASE.replace(/\/+$/, "");
const API_KEY = process.env.IDIOLECT_API_KEY || "";
const ACCOUNT_MODE = Boolean(API_KEY);
const DEFAULT_SLUG = process.env.IDIOLECT_SLUG || "";
// The user's own writing — their voice region — stays LOCAL (privacy by design).
// Point IDIOLECT_SAMPLES_FILE at a text file of your writing (blank-line separated)
// or set IDIOLECT_SAMPLES inline. score_voice sends it to the metric, never stored.
const SAMPLES_FILE = process.env.IDIOLECT_SAMPLES_FILE || "";
const SAMPLES_INLINE = process.env.IDIOLECT_SAMPLES || "";

function loadRegion() {
  let raw = SAMPLES_INLINE;
  if (!raw && SAMPLES_FILE) {
    try {
      raw = readFileSync(SAMPLES_FILE, "utf8");
    } catch {
      return [];
    }
  }
  return raw
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 4)
    .slice(0, 32);
}

async function fetchVoice(slug) {
  const res = await fetch(`${BASE}/api/voice/${encodeURIComponent(slug)}`);
  if (!res.ok) throw new Error(`Idiolect AI: voice "${slug}" not found (${res.status})`);
  return res.json();
}

async function scoreVoice(candidates, region) {
  const res = await fetch(`${BASE}/api/score`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ candidates, region }),
  });
  if (!res.ok) throw new Error(`Idiolect AI score failed (${res.status})`);
  return res.json();
}

export function formatLegacyScoreVoiceResult(result) {
  const scores = Array.isArray(result?.scores) ? result.scores : [];
  const lines = scores
    .map((score, index) => {
      const text = typeof score?.text === "string" ? score.text : "";
      const excerpt = `${text.slice(0, 60)}${text.length > 60 ? "…" : ""}`;
      const measured = score?.scored !== false && Number.isFinite(score?.voiceMatch);
      const reportable = measured && score?.absoluteScoreReportable !== false;
      const withheld = score?.scored === true && score?.absoluteScoreReportable === false;
      const match = reportable
        ? `Voice Match ${score.voiceMatch}/100`
        : withheld
          ? `Voice Match not calibrated${score?.reason ? ` — ${score.reason}` : ""}`
          : `Voice Match unavailable${score?.reason ? ` — ${score.reason}` : ""}`;
      return `#${index + 1} · ${match} — ${excerpt}`;
    })
    .join("\n");
  const provenance = result?.metric?.validated === true
    ? "Relative Voice Match on the validated instrument"
    : result?.metric?.validated === false
      ? "Relative Voice Match from a quick estimate"
      : "Relative Voice Match; metric provenance unavailable";

  return `${lines}\n\n(${provenance} — higher = reads more like you; not a forensic identity claim.)`;
}

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function accountRequestError(res, toolName) {
  if ((res.headers.get("content-type") || "").includes("application/json")) {
    try {
      const payload = await res.json();
      const creationContent = toolName === "create_my_voice" ? safeCreationFailurePayload(payload) : null;
      if (creationContent) {
        return new AccountRequestError(creationContent.message, res.status, creationContent);
      }
    } catch {
      // The bounded status fallback below deliberately ignores malformed bodies.
    }
  }

  const message = res.status === 401
    ? "Idiolect AI API key is invalid or expired (401). Check IDIOLECT_API_KEY."
    : res.status === 402
      ? `${toolName}: generation access is unavailable for this Idiolect AI account (402).`
      : res.status === 429
        ? `${toolName}: Idiolect AI is temporarily busy (429). Try again shortly.`
        : `${toolName}: Idiolect AI account API failed (${res.status}).`;
  return new AccountRequestError(message, res.status);
}

class AccountRequestError extends Error {
  constructor(message, status, structuredContent = null) {
    super(message);
    this.name = "AccountRequestError";
    this.status = status;
    this.structuredContent = structuredContent;
  }
}

async function accountRequest(path, { method = "GET", body, toolName }) {
  const res = await fetch(`${ACCOUNT_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw await accountRequestError(res, toolName);
  return res.json();
}

async function accountMcpRequest(name, args) {
  const res = await fetch(`${ACCOUNT_BASE}/api/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  if (!res.ok) throw await accountRequestError(res, name);
  const body = await res.json();
  if (body.error || !body.result) throw new Error(`${name}: Idiolect AI returned an invalid MCP response.`);
  return body.result;
}

function formatValue(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

export function scoreSummary(r) {
  const lines = [];
  if (r.voiceMatch !== undefined) {
    const withheld = r.measured === true
      && r.absoluteScoreReportable === false;
    lines.push(
      r.voiceMatch !== null && !withheld
        ? `Voice Match: ${formatValue(r.voiceMatch)}`
        : withheld
          ? `Voice Match: not calibrated — ${r.reason || "insufficient evidence"}.`
          : "Voice Match: unavailable",
    );
  }
  if (r.delta !== undefined) lines.push(r.delta === null ? "Delta: unavailable" : `Delta: ${formatValue(r.delta)}`);
  if (r.candidateDelta !== undefined && r.candidateDelta !== r.delta) {
    lines.push(`Generated candidate delta: ${formatValue(r.candidateDelta)}`);
  }
  if (r.validated !== undefined) lines.push(`Validated: ${formatValue(r.validated)}`);
  if (r.measured !== undefined) lines.push(`Measured: ${formatValue(r.measured)}`);
  if (r.scoreConfidence) lines.push(`Score confidence: ${formatValue(r.scoreConfidence)}`);
  if (r.absoluteScoreReportable !== undefined) {
    lines.push(`Absolute score reportable: ${formatValue(r.absoluteScoreReportable)}`);
  }
  if (r.reason) lines.push(`Reason: ${formatValue(r.reason)}`);
  if (r.instrument) lines.push(`Instrument: ${formatValue(r.instrument)}`);
  if (r.register) lines.push(`Calibration register: ${formatValue(r.register)}`);
  if (r.crossFit !== undefined) lines.push(`Cross-fit: ${formatValue(r.crossFit)}`);
  return lines.join("\n");
}

// Mirrors REWRITE_REGISTERS in lib/connectors.ts. This file ships as a standalone npm
// package with no build step, so it cannot import from the app — keep the two in sync.
const REWRITE_REGISTERS = ["email", "slack", "social", "essay"];
const REGISTER_SET = new Set(REWRITE_REGISTERS);
const CHANGE_SCOPES = ["light_edit", "rewrite", "transform"];
const CHANGE_SCOPE_SET = new Set([...CHANGE_SCOPES, "polish"]);
const EFFECT_KINDS = ["register", "tone", "humour", "candour", "energy", "voice", "other"];
const EFFECT_KIND_SET = new Set(EFFECT_KINDS);
const EFFECT_STRENGTHS = ["light", "full"];
const EFFECT_STRENGTH_SET = new Set(EFFECT_STRENGTHS);
const EFFECT_PROPERTY_SET = new Set(["kind", "ask", "strength"]);
// Who wrote the source or brief; mirrors lib/generation/change-request.ts's SOURCE_AUTHORS.
const SOURCE_AUTHORS = ["user", "host", "other", "unknown"];
const SOURCE_AUTHOR_SET = new Set(SOURCE_AUTHORS);

function backtickedValues(values) {
  return values.map((value) => `\`${value}\``).join(", ");
}

const CHANGE_SCOPE_SCHEMA = {
  type: "string",
  enum: CHANGE_SCOPES,
  description: "`changeScope` carries how much the person wants changed, from their own words.",
};
const EFFECTS_SCHEMA = {
  type: "array",
  maxItems: 20,
  items: {
    type: "object",
    properties: {
      kind: {
        type: "string",
        enum: EFFECT_KINDS,
        description: "`kind` names the tone, register or effect the requester identified.",
      },
      ask: {
        type: "string",
        minLength: 1,
        maxLength: 2000,
        description: "`ask` preserves the requester's own words for this effect.",
      },
      strength: {
        type: "string",
        enum: EFFECT_STRENGTHS,
        description: "`strength` records whether the requester asked for the effect to be `light` or `full`.",
      },
    },
    required: ["kind", "ask"],
    additionalProperties: false,
  },
  description: "`effects` carries each named tone, register or effect.",
};
const SOURCE_AUTHOR_SCHEMA = {
  type: "string",
  enum: SOURCE_AUTHORS,
  description:
    "Who wrote this text. `user` only when the person wrote it themselves; `host` when you (the assistant) drafted it; `other` for a third party's text. Leave it out if unsure.",
};
const BRIEF_AUTHOR_SCHEMA = {
  type: "string",
  enum: SOURCE_AUTHORS,
  description:
    "Who wrote the brief. `user` only when the person wrote it themselves; `host` when you (the assistant) drafted it; `other` for a third party's text. Leave it out if unsure.",
};
const CALIBRATION_SCHEMA = {
  type: "object",
  properties: {
    direction: {
      type: "string",
      enum: ["direct", "balanced", "gentle"],
      description: "The user's answer to the single task-local calibration question.",
    },
  },
  required: ["direction"],
  additionalProperties: false,
};

/** Validates `sourceAuthor`/`briefAuthor` and defaults an absent one to `"unknown"` on the
 * returned copy of `args`. Returns a tool error, never throws. */
export function authorProvenanceError(args, toolName, key) {
  if (args[key] === undefined) return null;
  if (typeof args[key] !== "string" || !SOURCE_AUTHOR_SET.has(args[key])) {
    return toolError(`${toolName}: \`${key}\` must be one of ${backtickedValues(SOURCE_AUTHORS)}.`);
  }
  return null;
}

export function changeRequestError(args, toolName) {
  if (args.changeScope !== undefined
    && (typeof args.changeScope !== "string" || !CHANGE_SCOPE_SET.has(args.changeScope))) {
    return toolError(`${toolName}: \`changeScope\` must be one of ${backtickedValues(CHANGE_SCOPES)}.`);
  }
  if (args.effects === undefined) return null;
  if (!Array.isArray(args.effects)) return toolError(`${toolName}: \`effects\` must be a list.`);
  if (args.effects.length > 20) return toolError(`${toolName}: \`effects\` accepts at most 20 entries.`);
  for (const effect of args.effects) {
    if (!plainObject(effect) || Object.keys(effect).some((key) => !EFFECT_PROPERTY_SET.has(key))) {
      return toolError(`${toolName}: each \`effects\` entry must contain only \`kind\`, \`ask\`, and \`strength\`.`);
    }
    if (typeof effect.kind !== "string" || !EFFECT_KIND_SET.has(effect.kind)) {
      return toolError(`${toolName}: \`effects[].kind\` must be one of ${backtickedValues(EFFECT_KINDS)}.`);
    }
    if (typeof effect.ask !== "string" || effect.ask.length < 1 || effect.ask.length > 2000) {
      return toolError(`${toolName}: \`effects[].ask\` must be 1 to 2,000 characters.`);
    }
    if (effect.strength !== undefined
      && (typeof effect.strength !== "string" || !EFFECT_STRENGTH_SET.has(effect.strength))) {
      return toolError(`${toolName}: \`effects[].strength\` must be one of ${backtickedValues(EFFECT_STRENGTHS)}.`);
    }
  }
  return null;
}

const legacyTools = [
  {
    name: "get_my_voice",
    description:
      "Load the user's Idiolect AI Voice Card when they ask for personal outward-facing prose, such as an email, message, post, or reply, to match their established voice. Do not use it for ordinary factual writing or repository artifacts. Returns a style guide describing how the user actually writes.",
    inputSchema: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description:
            "Idiolect AI voice slug. Optional if IDIOLECT_SLUG is set in the server env.",
        },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false, title: "Load Idiolect AI Voice" },
  },
  {
    name: "score_voice",
    description:
      "Measure how much one or more texts read like the user, on Idiolect AI's validated voice-fidelity metric (Voice Match 0–100, relative — higher means closer to the user's own writing; not a forensic identity claim). Use this to CHECK your draft before sending: write in the user's voice, score it, and revise if the Voice Match is low. Requires the user's writing samples configured locally (IDIOLECT_SAMPLES_FILE).",
    inputSchema: {
      type: "object",
      properties: {
        texts: {
          type: "array",
          items: { type: "string" },
          description: "One or more candidate texts to score against the user's voice.",
        },
      },
      required: ["texts"],
    },
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false, title: "Score Voice Match" },
  },
];

// Output schemas — enumerate the machine-readable fields each tool returns so the
// model can reuse them in follow-up calls (per OpenAI Apps SDK tool guidance).
const SELECTED_VOICE_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: ["string", "null"] },
    isDefault: { type: "boolean" },
    selection: { type: "string", enum: ["explicit", "default", "latest"] },
  },
};
const EVIDENCE_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    sampleCount: { type: "number" },
    blockCount: { type: "number" },
    characterCount: { type: "number" },
    minimumBlockCount: { type: "number" },
    minimumCharacterCount: { type: "number" },
    selectedExemplarCount: { type: "number" },
    selectedWordCount: { type: "number" },
    profileEvidenceEligible: { type: "boolean" },
    scoringEligible: { type: "boolean" },
    crossFitReady: { type: "boolean" },
    reason: { type: ["string", "null"] },
  },
};
const PROVENANCE_OUTPUT_PROPERTIES = {
  validated: { type: "boolean", description: "True only when this result was measured by the validated LUAR instrument." },
  instrument: { type: ["string", "null"] },
  reason: { type: ["string", "null"] },
  voice: SELECTED_VOICE_SCHEMA,
  evidence: EVIDENCE_OUTPUT_SCHEMA,
};
const NEXT_ACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: { type: "string", enum: ["collect_evidence", "reload_voice", "continue_writing", "ask_feedback", "retry", "done"] },
    tool: { type: ["string", "null"], enum: ["create_my_voice", "get_my_voice", "record_voice_feedback", null] },
  },
  required: ["action", "tool"],
};
const PUBLIC_STATE_PROPERTIES = {
  state: { type: "string", enum: ["ready", "missing", "thin", "stale", "complete", "failed"] },
  message: { type: "string" },
  next: NEXT_ACTION_SCHEMA,
};
const VOICE_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    ...PUBLIC_STATE_PROPERTIES,
    status: { type: "string", enum: ["ready", "setup_required"] },
    message: { type: "string" },
    id: { type: "string" },
    name: { type: ["string", "null"] },
    isDefault: { type: "boolean" },
    selection: { type: "string", enum: ["explicit", "default", "latest"] },
    summary: { type: "string" },
    toneAxes: { type: "object", description: "Signed -100..100 tone axes (formality, warmth, verbosity, playfulness, directness)." },
    signatureMoves: { type: "array", items: { type: "string" } },
    vocabulary: { type: "array", items: { type: "string" } },
    rhythm: { type: "string" },
    taboos: { type: "array", items: { type: "string" } },
    positions: { type: "array", items: { type: "string" }, description: "Real takes the user has expressed; never invent new ones." },
    evidence: EVIDENCE_OUTPUT_SCHEMA,
  },
};
const SCORE_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    ...PUBLIC_STATE_PROPERTIES,
    voiceMatch: { type: ["number", "null"], description: "0–100; higher = closer to the user's own writing. Relative, not a forensic identity claim." },
    measured: { type: "boolean", description: "False when the candidate or corpus is in the unscored band, or the scorer is unavailable." },
    ...PROVENANCE_OUTPUT_PROPERTIES,
    register: { type: "string", description: "Calibration register the anchors come from; the absolute is approximate outside it." },
    approximate: { type: "boolean" },
  },
};
// A draft or rewrite is the writing, the profile that wrote it and its evidence state.
// The score cluster (voiceMatch, measured, deltas, candidate fields, crossFit, the
// calibration constants) was constant on every call and is gone from the account API
// and from here (IDI-381). Voice Match is measured on score_voice.
// IDI-522 step 2: present only for a soft language-policy pass through the profile-less
// shared engine — mirrors app/api/mcp/schemas.ts's `caveatsOutputShape` so this stdio
// schema stays in step with every other writing-tool surface.
const CAVEATS_OUTPUT_PROPERTY = { caveats: { type: "array", items: { type: "string", enum: ["language"] } } };
const REWRITE_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    ...PUBLIC_STATE_PROPERTIES,
    rewritten: { type: "string", description: "The rewritten text." },
    reason: { type: ["string", "null"], description: "Present only when scoring is enabled and the engine did not measure; says why." },
    voice: SELECTED_VOICE_SCHEMA,
    evidence: EVIDENCE_OUTPUT_SCHEMA,
    ...CAVEATS_OUTPUT_PROPERTY,
  },
};
const DRAFT_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    ...PUBLIC_STATE_PROPERTIES,
    draft: { type: "string", description: "New prose drafted in the user's voice." },
    reason: { type: ["string", "null"], description: "Present only when scoring is enabled and the engine did not measure; says why." },
    voice: SELECTED_VOICE_SCHEMA,
    evidence: EVIDENCE_OUTPUT_SCHEMA,
    ...CAVEATS_OUTPUT_PROPERTY,
  },
};
const CREATE_VOICE_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    ...PUBLIC_STATE_PROPERTIES,
    status: { type: "string", enum: ["ready", "more_evidence_required", "build_in_progress", "failed"] },
    message: { type: "string" },
    reason: { type: ["string", "null"] },
    voiceId: { type: ["string", "null"] },
    neededChars: { type: "number", description: "Present only when more writing is needed." },
    neededBlocks: { type: "number", description: "Present only when more writing is needed." },
    replay: { type: "boolean" },
  },
};
const FEEDBACK_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    ...PUBLIC_STATE_PROPERTIES,
    needsFinalText: { type: "boolean" },
  },
};
const PROFILE_REF_OPTIONAL_SCHEMA = {
  type: "string", minLength: 1,
  description: "The Writing Profile's id, or its exact name. Omit to use the current profile.",
};
const PROFILE_REF_REQUIRED_SCHEMA = {
  type: "string", minLength: 1,
  description: "The Writing Profile's id, or its exact name.",
};
const PROFILE_ID_SCHEMA = { type: "string", format: "uuid" };
const PROFILE_SAMPLE_SCHEMA = {
  type: "array",
  minItems: 1,
  maxItems: 500,
  items: { type: "string", maxLength: 20000 },
};
const OPTIONAL_PROFILE_SAMPLE_SCHEMA = {
  type: "array",
  maxItems: 500,
  items: { type: "string", maxLength: 20000 },
};
const PROFILE_SAMPLE_STATE_SCHEMA = {
  type: "object",
  properties: {
    profileId: PROFILE_ID_SCHEMA,
    generation: { type: "integer", minimum: 0 },
    samples: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: PROFILE_ID_SCHEMA,
          text: { type: "string" },
          addedAt: { type: "string" },
        },
        required: ["id", "text", "addedAt"],
        additionalProperties: false,
      },
    },
    needsWriting: { type: "boolean" },
    heldNotUsable: { type: "integer", minimum: 0 },
  },
  required: ["profileId", "generation", "samples", "needsWriting", "heldNotUsable"],
  additionalProperties: false,
};
/** What the caller must change to succeed; present only on evidence failures. */
const PROFILE_SHORTFALL_SCHEMA = {
  type: "object",
  properties: {
    reason: { type: "string", enum: ["insufficient_input", "unsupported_language"] },
    message: { type: "string" },
    neededChars: { type: "integer", minimum: 0 },
    neededBlocks: { type: "integer", minimum: 0 },
    droppedBlocks: { type: "integer", minimum: 0 },
    minimumChars: { type: "integer", minimum: 0 },
    minimumBlocks: { type: "integer", minimum: 0 },
  },
  required: ["message"],
  additionalProperties: false,
};

function profileActionOutput(value, codes) {
  return {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      value,
      error: {
        type: "object",
        properties: {
          code: { type: "string", enum: [...codes, "unexpected_error"] },
          detail: PROFILE_SHORTFALL_SCHEMA,
        },
        required: ["code"],
        additionalProperties: false,
      },
    },
    required: ["ok"],
    additionalProperties: false,
  };
}

const accountToolDefinitions = [
  {
    name: "get_my_voice",
    description:
      "Use this when the user asks for personal outward-facing prose, such as an email, message, post, or reply, to match their established voice. Do not use it for ordinary factual writing or repository artifacts. Reports whether setup is complete, and what is still needed when it is not.",
    inputSchema: { type: "object", properties: {} },
    outputSchema: VOICE_OUTPUT_SCHEMA,
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false, title: "Load Idiolect AI Voice" },
  },
  {
    name: "create_my_voice",
    description:
      "Compatibility setup action for creating a first Writing Profile, from writing samples the user authored or from short answers about how they write. Use create_writing_profile for explicit multi-profile creation.",
    inputSchema: {
      type: "object",
      properties: {
        profileId: {
          ...PROFILE_ID_SCHEMA,
          description:
            "Exact owned Writing Profile to receive this evidence. Omit only when creating the account's first profile or adding to the current profile.",
        },
        samples: {
          type: "array",
          maxItems: 500,
          items: { type: "string", maxLength: 20000 },
          description: "Distinct blocks of writing supplied or explicitly approved by the user.",
        },
        answers: {
          type: "array",
          maxItems: 20,
          items: {
            type: "object",
            properties: {
              question: { type: "string", maxLength: 500 },
              answer: { type: "string", maxLength: 5000 },
            },
            required: ["question", "answer"],
            additionalProperties: false,
          },
          description: "Optional guided questions and the user's own answers.",
        },
        name: { type: "string", maxLength: 60, description: "Optional private name for the Writing Profile." },
      },
      additionalProperties: false,
    },
    outputSchema: CREATE_VOICE_OUTPUT_SCHEMA,
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false, title: "Create My Writing Profile" },
  },
  {
    name: "list_writing_profiles",
    description: "List the authenticated user's Writing Profiles and identify the current profile.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: profileActionOutput({ type: "array" }, []),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false, destructiveHint: false, title: "List Writing Profiles" },
  },
  {
    name: "list_writing_profile_samples",
    description: "List the writing samples and stable sample IDs held by the exact Writing Profile identified by profileId. This does not change the profile.",
    inputSchema: {
      type: "object",
      properties: { profileId: PROFILE_REF_REQUIRED_SCHEMA },
      required: ["profileId"],
      additionalProperties: false,
    },
    outputSchema: profileActionOutput(PROFILE_SAMPLE_STATE_SCHEMA, ["profile_not_found"]),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false, destructiveHint: false, title: "List Writing Profile Samples" },
  },
  {
    name: "create_writing_profile",
    description: "Create a new Writing Profile from approved writing. This never changes an existing profile.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", maxLength: 60 },
        samples: OPTIONAL_PROFILE_SAMPLE_SCHEMA,
        answers: {
          type: "array",
          maxItems: 20,
          items: {
            type: "object",
            properties: {
              question: { type: "string", maxLength: 500 },
              answer: { type: "string", maxLength: 5000 },
            },
            required: ["question", "answer"],
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
    outputSchema: profileActionOutput({ type: "object" }, [
      "insufficient_evidence", "rate_limited", "request_conflict", "build_in_progress",
    ]),
    annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false, destructiveHint: false, title: "Create Writing Profile" },
  },
  {
    name: "add_samples_to_writing_profile",
    description: "Add approved writing samples to the exact Writing Profile identified by profileId.",
    inputSchema: {
      type: "object",
      properties: { profileId: PROFILE_REF_OPTIONAL_SCHEMA, samples: PROFILE_SAMPLE_SCHEMA },
      required: ["samples"],
      additionalProperties: false,
    },
    outputSchema: profileActionOutput({ type: "object" }, [
      "insufficient_evidence", "request_conflict", "build_in_progress", "profile_not_found",
    ]),
    annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false, destructiveHint: false, title: "Add Samples to Writing Profile" },
  },
  {
    name: "replace_samples_in_writing_profile",
    description: "Replace the writing sample set for the exact Writing Profile identified by profileId. Displaced writing is revoked, not deleted. Refuses when the profile holds writing this tool cannot list.",
    inputSchema: {
      type: "object",
      properties: { profileId: PROFILE_REF_REQUIRED_SCHEMA, samples: OPTIONAL_PROFILE_SAMPLE_SCHEMA },
      required: ["profileId", "samples"],
      additionalProperties: false,
    },
    outputSchema: profileActionOutput(PROFILE_SAMPLE_STATE_SCHEMA, ["profile_not_found"]),
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: true, title: "Replace Samples in Writing Profile" },
  },
  {
    name: "remove_sample_from_writing_profile",
    description: "Remove the exact writing sample identified by sampleId from the Writing Profile identified by profileId. The sample stops being used; it is revoked, not erased.",
    inputSchema: {
      type: "object",
      properties: { profileId: PROFILE_REF_REQUIRED_SCHEMA, sampleId: PROFILE_ID_SCHEMA },
      required: ["profileId", "sampleId"],
      additionalProperties: false,
    },
    outputSchema: profileActionOutput(PROFILE_SAMPLE_STATE_SCHEMA, ["profile_not_found", "sample_not_found"]),
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: true, title: "Remove Sample from Writing Profile" },
  },
  {
    name: "set_current_writing_profile",
    description: "Make the exact Writing Profile identified by profileId current for future writing.",
    inputSchema: {
      type: "object",
      properties: { profileId: PROFILE_REF_REQUIRED_SCHEMA },
      required: ["profileId"],
      additionalProperties: false,
    },
    outputSchema: profileActionOutput({ type: "object" }, ["profile_not_found"]),
    annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false, destructiveHint: false, title: "Set Current Writing Profile" },
  },
  {
    name: "delete_writing_profile",
    description: "Delete the exact Writing Profile identified by profileId. A current profile may require a replacementProfileId.",
    inputSchema: {
      type: "object",
      properties: { profileId: PROFILE_REF_REQUIRED_SCHEMA, replacementProfileId: PROFILE_REF_REQUIRED_SCHEMA },
      required: ["profileId"],
      additionalProperties: false,
    },
    outputSchema: profileActionOutput({ type: "object" }, [
      "profile_not_found", "replacement_required", "invalid_replacement",
    ]),
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: true, title: "Delete Writing Profile" },
  },
  {
    name: "score_voice",
    description:
      "Use this only when the user explicitly asks to measure or check how close a piece of text is to their own writing. Returns a relative Voice Match with visible provenance, or an honest reason measurement is unavailable; never a forensic identity claim.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string", description: "Text to score against the user's voice." } },
      required: ["text"],
    },
    outputSchema: SCORE_OUTPUT_SCHEMA,
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false, title: "Score Voice Match" },
  },
  {
    name: "rewrite_in_voice",
    description:
      "Rewrite supplied prose in the user's voice. Returns an in-voice alternative with measurement details and a before→after delta when measured; absolute Voice Match stays withheld unless independent held-out evidence and the target register support it. Use it only when it preserves the user's meaning and fits their request.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Draft prose to rewrite in the user's voice." },
        // `targetRegister` (input) adapts the output format. Not to be confused with
        // the `register` this tool RETURNS, which is the metric's calibration band.
        targetRegister: {
          type: "string",
          enum: REWRITE_REGISTERS,
          description:
            "Optional target register. Adapts the output format while keeping the user's voice; omitted, the input's own format is kept.",
        },
        // The ask, kept out of `text`. /api/v1/rewrite has accepted this all along;
        // only the tool schema was missing it.
        instructions: {
          type: "string",
          description:
                        "The user's actual change request — length, tone, audience, what to cut or keep, make it sound less AI-written, roughen it up, or make it sound like I am talking. Kept separate from `text`: put the request here, never inside the prose to rewrite. `changeScope` carries magnitude; `instructions` carries the requested change.",
        },
        language: {
          type: "string",
          minLength: 1,
          maxLength: 100,
          description: "The language for the finished writing, in plain words (for example 'French'). Set it only when the user asked for a specific language. Omit it to follow the request's language, or the source text's language for a rewrite.",
        },
        changeScope: CHANGE_SCOPE_SCHEMA,
        effects: EFFECTS_SCHEMA,
        sourceAuthor: SOURCE_AUTHOR_SCHEMA,
        calibration: CALIBRATION_SCHEMA,
        profileId: { type: "string", format: "uuid", description: "Use this owned Writing Profile for this piece only. Select an exact profileId; this does not change the account default." },
      },
      required: ["text"],
    },
    outputSchema: REWRITE_OUTPUT_SCHEMA,
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false, title: "Rewrite In Voice" },
  },
  {
    name: "draft_in_voice",
    description:
      "Draft new prose in the user's voice from a supplied `brief`, with the user's direction in the optional `instructions`. Returns a draft with measurement details for review; absolute Voice Match stays withheld unless independent held-out evidence and the target register support it.",
    inputSchema: {
      type: "object",
      properties: {
        brief: {
          type: "string",
          description:
            "`brief` is the material: what the piece is about and what it must contain — its audience, its goal, and the source facts and specifics it has to carry. Never paste directions into `brief`; how to write it goes in `instructions`.",
        },
        format: {
          type: "string",
          enum: ["linkedin", "x_post", "x_thread", "newsletter", "generic"],
          description: "Optional output format (default: `generic`).",
        },
        // The direction, kept out of `brief`. /api/v1/draft accepts it; this schema is the
        // stdio package's own copy because it cannot import lib/connectors.ts. The bounds
        // mirror GENERATION_INPUT_LIMITS.draftInstructions, including the nonempty minimum
        // the remote catalog advertises — an optional field that accepts "" is a third
        // state neither side means.
        instructions: {
          type: "string",
          minLength: 1,
          maxLength: 8000,
          description:
            "`instructions` is the user's actual direction: how to write the piece — tone, length, format, structure, and what to leave out. Optional; omit it when the user gave none. Never paste directions into `brief`, which carries the material, and never put material here. A named output shape goes in `format`.",
        },
        language: {
          type: "string",
          minLength: 1,
          maxLength: 100,
          description: "The language for the finished writing, in plain words (for example 'French'). Set it only when the user asked for a specific language. Omit it to follow the request's language, or the source text's language for a rewrite.",
        },
        effects: EFFECTS_SCHEMA,
        briefAuthor: BRIEF_AUTHOR_SCHEMA,
        calibration: CALIBRATION_SCHEMA,
        profileId: { type: "string", format: "uuid", description: "Use this owned Writing Profile for this piece only. Select an exact profileId; this does not change the account default." },
      },
      required: ["brief"],
    },
    outputSchema: DRAFT_OUTPUT_SCHEMA,
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false, title: "Draft In Voice" },
  },
  {
    name: "learn_writing_style",
    description:
      "Teach Idiolect AI one lasting thing about how the user writes. Send authored writing only with the user's consent, preferences in their words, or observations grounded in their own writing. This stores learning and never writes or revises prose.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        kind: {
          type: "string",
          enum: ["authored_example", "preference", "observation"],
          description: "Whether this is the user's authored writing, a preference they stated, or an observation grounded in their writing.",
        },
        text: { type: "string", minLength: 1, maxLength: 12000 },
        consent: {
          type: "boolean",
          const: true,
          description: "Required only for authored_example: the user wrote it and agreed it may be stored.",
        },
        basis: { type: "string", minLength: 1, maxLength: 2000 },
        scope: { type: "string", enum: ["general", "occasion", "piece"] },
        occasion: { type: "string", minLength: 1, maxLength: 500 },
        profileId: { type: "string", format: "uuid" },
        writingJobVersionId: { type: "string", format: "uuid" },
      },
      required: ["kind", "text"],
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        status: { type: "string", enum: ["saved", "pending", "ready", "failed"] },
        message: { type: "string" },
        next: {
          type: "object",
          additionalProperties: false,
          properties: {
            action: { type: "string", enum: ["done", "retry", "continue_writing"] },
            tool: { type: ["string", "null"], enum: ["refine", null] },
          },
          required: ["action", "tool"],
        },
        contribution: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string", format: "uuid" },
            kind: { type: "string", enum: ["authored_example", "preference", "observation"] },
            status: { type: "string", enum: ["pending", "waiting", "applied", "not_used", "piece_only"] },
          },
          required: ["id", "kind", "status"],
        },
        profileId: { type: "string", format: "uuid" },
        writingJobVersionId: { type: "string", format: "uuid" },
        neededWriting: {
          type: "object",
          additionalProperties: false,
          properties: {
            pieces: { type: "integer", minimum: 0 },
            characters: { type: "integer", minimum: 0 },
          },
          required: ["pieces", "characters"],
        },
      },
      required: ["status", "message", "next"],
    },
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false, title: "Learn Writing Style" },
  },
  {
    name: "record_voice_feedback",
    description:
      "Record bounded feedback for an Idiolect AI output. Send a verdict every time the user responds to one; a verdict on its own is worth having. Put what you observed in critique. Send correctionText only when you have the user's final text verbatim.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        outputId: { type: "string", format: "uuid" },
        // Hand-written mirror of the HTTP route's vocabulary — this file cannot import
        // `lib/feedback/outcomes.ts`. `superseded` means the person changed the brief or
        // direction rather than judging the text (IDI-446); keep it in step by hand.
        status: { type: "string", enum: ["accepted", "corrected_and_accepted", "rejected", "superseded"] },
        correctionText: {
          type: "string",
          minLength: 1,
          maxLength: 20000,
          description: "The user's final text, verbatim and complete. Never an excerpt, a diff, or your own description of what changed — if you do not have their exact words, omit this field and describe the change in critique instead.",
        },
        critique: {
          type: "string",
          minLength: 1,
          maxLength: 2000,
          description: "What you observed about how the output landed, in the user's words or your own: what was wrong, what they changed, or why they kept it. Free text, and the right home for any description of an edit you cannot quote verbatim.",
        },
      },
      required: ["outputId", "status"],
    },
    outputSchema: FEEDBACK_OUTPUT_SCHEMA,
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false, title: "Record Voice Feedback" },
  },
];

export const accountTools = progressiveCatalog.tools;
export const accountInstructions = progressiveCatalog.instructions;
/** Hidden schemas retained for cached stdio callers and compatibility tests. */
export const accountCompatibilityTools = accountToolDefinitions;

function toolError(message) {
  return { content: [{ type: "text", text: message }], isError: true };
}

function accountToolError(error) {
  if (error instanceof AccountRequestError && error.structuredContent) {
    return {
      content: [{ type: "text", text: error.structuredContent.message }],
      structuredContent: error.structuredContent,
      isError: true,
    };
  }
  if (error instanceof AccountRequestError) return toolError(error.message);
  return toolError("Idiolect AI account API failed before a safe response was available.");
}

function createVoiceBody(args) {
  const samples = args.samples ?? [];
  const answers = args.answers ?? [];
  if (!Array.isArray(samples) || samples.length > 500 || samples.some((sample) => typeof sample !== "string" || sample.length > 20000)) {
    return { error: "create_my_voice: `samples` must contain at most 500 text blocks of at most 20,000 characters each." };
  }
  if (
    !Array.isArray(answers)
    || answers.length > 20
    || answers.some((answer) => (
      !answer
      || typeof answer !== "object"
      || Array.isArray(answer)
      || typeof answer.question !== "string"
      || answer.question.length > 500
      || typeof answer.answer !== "string"
      || answer.answer.length > 5000
    ))
  ) {
    return { error: "create_my_voice: `answers` must contain at most 20 question/answer pairs within the documented limits." };
  }
  if (args.name !== undefined && (typeof args.name !== "string" || args.name.length > 60)) {
    return { error: "create_my_voice: `name` must be text of at most 60 characters." };
  }
  if (args.profileId !== undefined && typeof args.profileId !== "string") {
    return { error: "create_my_voice: `profileId` must be a Writing Profile UUID." };
  }
  return {
    body: {
      ...(args.profileId !== undefined ? { profileId: args.profileId } : {}),
      samples,
      answers: answers.map(({ question, answer }) => ({ question, answer })),
      ...(args.name !== undefined ? { name: args.name } : {}),
    },
  };
}

function safeCreationResult(r) {
  const status = r.status ?? "more_evidence_required";
  const state = status === "ready" ? "complete" : status === "build_in_progress" ? "stale" : status === "failed" ? "failed" : "thin";
  const next = status === "ready"
    ? { action: "reload_voice", tool: "get_my_voice" }
    : status === "build_in_progress"
      ? { action: "retry", tool: "create_my_voice" }
    : status === "failed" ? { action: "done", tool: null } : { action: "collect_evidence", tool: "create_my_voice" };
  const neededChars = Number.isFinite(r.neededChars) ? r.neededChars : 0;
  const neededBlocks = Number.isFinite(r.neededBlocks) ? r.neededBlocks : 0;
  const message = state === "thin"
    ? `More of the user's own writing is needed: add ${neededBlocks} distinct block${neededBlocks === 1 ? "" : "s"} and ${neededChars} characters.`
    : r.message ?? (state === "complete" ? "Writing Profile ready." : "Writing Profile creation is still in progress.");
  return publicMcpState(state, message, next, {
    status,
    reason: r.reason ?? null,
    voiceId: r.voiceId ?? null,
    // The shortfall appears only when there is one; the fixed minimums are gone (IDI-381).
    ...(neededChars > 0 || neededBlocks > 0 ? { neededChars, neededBlocks } : {}),
    replay: r.replay === true,
  });
}

/** Preserve a server-proven refinement conflict without copying unknown fields. */
function safeCreationFailurePayload(value) {
  if (
    !plainObject(value)
    || value.status !== "failed"
    || typeof value.message !== "string"
    || !(value.reason === null || typeof value.reason === "string")
    || !(value.voiceId === null || typeof value.voiceId === "string")
    || typeof value.replay !== "boolean"
  ) return null;
  return safeCreationResult(value);
}

const WRITING_PROFILE_ERROR_CODES = {
  list_writing_profiles: new Set(["unexpected_error"]),
  list_writing_profile_samples: new Set(["profile_not_found", "unexpected_error"]),
  create_writing_profile: new Set([
    "insufficient_evidence", "rate_limited", "request_conflict", "build_in_progress", "unexpected_error",
  ]),
  add_samples_to_writing_profile: new Set([
    "insufficient_evidence", "request_conflict", "build_in_progress", "profile_not_found", "unexpected_error",
  ]),
  replace_samples_in_writing_profile: new Set([
    "insufficient_evidence", "profile_not_found", "samples_not_fully_visible", "unexpected_error",
  ]),
  remove_sample_from_writing_profile: new Set([
    "profile_not_found", "sample_not_found", "unexpected_error",
  ]),
  set_current_writing_profile: new Set(["profile_not_found", "unexpected_error"]),
  delete_writing_profile: new Set([
    "profile_not_found", "replacement_required", "invalid_replacement", "unexpected_error",
  ]),
};

function writingProfileRequest(name, args) {
  if (name === "list_writing_profiles") return { path: "/api/writing-profiles", method: "GET" };
  if (name === "create_writing_profile") {
    return {
      path: "/api/writing-profiles",
      method: "POST",
      body: {
        samples: args.samples ?? [],
        answers: args.answers ?? [],
        ...(args.name === undefined ? {} : { name: args.name }),
      },
    };
  }
  const id = encodeURIComponent(args.profileId ?? '');
  if (name === "list_writing_profile_samples") {
    return { path: `/api/writing-profiles/${id}/samples`, method: "GET" };
  }
  if (name === "add_samples_to_writing_profile") {
    // Absent means the current profile; the account API resolves it, this only forwards.
    const path = args.profileId === undefined
      ? "/api/writing-profiles/current/samples"
      : `/api/writing-profiles/${id}/samples`;
    return { path, method: "POST", body: { samples: args.samples } };
  }
  if (name === "replace_samples_in_writing_profile") {
    return { path: `/api/writing-profiles/${id}/samples`, method: "PUT", body: { samples: args.samples } };
  }
  if (name === "remove_sample_from_writing_profile") {
    const sampleId = encodeURIComponent(args.sampleId);
    return { path: `/api/writing-profiles/${id}/samples/${sampleId}`, method: "DELETE" };
  }
  if (name === "set_current_writing_profile") {
    return { path: `/api/writing-profiles/${id}/current`, method: "PUT" };
  }
  const replacement = args.replacementProfileId === undefined
    ? ""
    : `?replacementProfileId=${encodeURIComponent(args.replacementProfileId)}`;
  return { path: `/api/writing-profiles/${id}${replacement}`, method: "DELETE" };
}

/** The shortfall is re-validated field by field: an unchecked passthrough would let the
 * account API widen this tool's declared output schema without the stdio server knowing. */
function safeProfileShortfall(value) {
  if (!plainObject(value) || typeof value.message !== "string") return null;
  const detail = { message: value.message.slice(0, 2000) };
  if (value.reason === "insufficient_input" || value.reason === "unsupported_language") {
    detail.reason = value.reason;
  }
  // Counts travel only when the evidence gate produced them; a profile that could not be
  // found has no shortfall to count.
  for (const key of ["neededChars", "neededBlocks", "droppedBlocks", "minimumChars", "minimumBlocks"]) {
    if (Number.isInteger(value[key]) && value[key] >= 0) detail[key] = value[key];
  }
  return detail;
}

function safeWritingProfileResult(name, value) {
  if (!plainObject(value) || typeof value.ok !== "boolean") return null;
  if (value.ok === true && Object.hasOwn(value, "value")) return { ok: true, value: value.value };
  const code = plainObject(value.error) ? value.error.code : null;
  if (typeof code !== "string" || !WRITING_PROFILE_ERROR_CODES[name]?.has(code)) return null;
  const detail = safeProfileShortfall(plainObject(value.error) ? value.error.detail : null);
  return { ok: false, error: detail ? { code, detail } : { code } };
}

function writingProfileSuccessMessage(name, value, title) {
  if (name === "list_writing_profiles" && Array.isArray(value)) {
    if (value.length === 0) return "No Writing Profiles found.";
    return ["Writing Profiles:", ...value.map((profile) => {
      const label = typeof profile?.name === "string" && profile.name.length > 0
        ? profile.name
        : "Unnamed profile";
      const current = profile?.isCurrent === true ? " (current)" : "";
      return `- ${label}: ${String(profile?.id ?? "unknown")}${current}`;
    })].join("\n");
  }
  if (
    ["list_writing_profile_samples", "replace_samples_in_writing_profile", "remove_sample_from_writing_profile"].includes(name)
    && plainObject(value)
    && Array.isArray(value.samples)
  ) {
    const samples = value.samples.map((sample) => {
      const id = plainObject(sample) && typeof sample.id === "string" ? sample.id : "unknown";
      const writing = plainObject(sample) && typeof sample.text === "string" ? sample.text : "";
      return `- sampleId ${id}: ${JSON.stringify(writing)}`;
    });
    return [
      `${title} complete for profile ${String(value.profileId ?? "unknown")} (generation ${String(value.generation ?? "unknown")}).`,
      `Usable samples: ${value.samples.length}.`,
      ...(samples.length > 0 ? samples : ["- No usable writing samples remain."]),
      ...(Number.isInteger(value.heldNotUsable) && value.heldNotUsable > 0
        ? [`Held but not usable for rebuild: ${value.heldNotUsable}.`]
        : []),
    ].join("\n");
  }
  return `${title} complete.`;
}

async function callWritingProfileApi(name, args) {
  const request = writingProfileRequest(name, args);
  const res = await fetch(`${ACCOUNT_BASE}${request.path}`, {
    method: request.method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      ...(request.body ? { "content-type": "application/json" } : {}),
    },
    body: request.body ? JSON.stringify(request.body) : undefined,
  });
  let parsed = null;
  try {
    parsed = safeWritingProfileResult(name, await res.json());
  } catch {
    // The bounded failure below handles non-JSON and malformed responses.
  }
  if (!parsed) throw new AccountRequestError(`${name}: Idiolect AI account API failed (${res.status}).`, res.status);
  const title = accountToolDefinitions.find((tool) => tool.name === name)?.annotations.title ?? name;
  const building = name === "create_writing_profile"
    && parsed.ok === false
    && parsed.error.code === "build_in_progress";
  const message = parsed.ok
    ? writingProfileSuccessMessage(name, parsed.value, title)
    : building
      ? "Writing Profile accepted and building. Retry this same call shortly to get the completed profile."
    : parsed.error.detail?.message ?? `${title} failed: ${parsed.error.code}.`;
  return {
    content: [{ type: "text", text: message }],
    structuredContent: parsed,
    ...(!parsed.ok && !building ? { isError: true } : {}),
  };
}

/** Import-safe account handler used by the stdio server and its parity tests. */
export async function handleAccountTool(name, args = {}) {
  if (Object.hasOwn(WRITING_PROFILE_ERROR_CODES, name)) {
    try {
      return await callWritingProfileApi(name, args);
    } catch (error) {
      return accountToolError(error);
    }
  }
  if (name === "get_credit_status") {
    return toolError("This tool is no longer available. Refresh the Idiolect AI tool catalogue.");
  }

  if (name === "get_my_voice") {
    try {
      const r = await accountRequest("/api/v1/voice", { toolName: "get_my_voice" });
      const card = r.card || formatValue(r.voice);
      return {
        content: [
          {
            type: "text",
            text: `${card}\n\n---\n(Idiolect AI account voice loaded. Write everything as this person from now on.)`,
          },
        ],
        structuredContent: publicMcpState("ready", "Writing Profile ready.", { action: "continue_writing", tool: null }, {
          status: "ready",
          ...(r.voice || {}),
        }),
      };
    } catch (error) {
      if (error instanceof AccountRequestError && error.status === 404) {
        const message = "No Writing Profile yet. Offer the user both ways to create one: sharing writing they authored, or answering a few short questions about how they write. Use only natural writing the user actually composed; approval alone does not establish authorship. Nothing is created until the user agrees.";
        return {
          content: [{ type: "text", text: message }],
          structuredContent: publicMcpState("missing", message, { action: "collect_evidence", tool: "create_my_voice" }, {
            status: "setup_required",
          }),
        };
      }
      return accountToolError(error);
    }
  }

  if (name === "create_my_voice") {
    const prepared = createVoiceBody(args);
    if (prepared.error) return {
      content: [{ type: "text", text: prepared.error }],
      structuredContent: publicMcpState("failed", prepared.error, { action: "retry", tool: "create_my_voice" }),
      isError: true,
    };
    try {
      const r = await accountRequest("/api/v1/voice/create", {
        method: "POST",
        body: prepared.body,
        toolName: "create_my_voice",
      });
      const structuredContent = safeCreationResult(r);
      return {
        content: [{ type: "text", text: structuredContent.message }],
        structuredContent,
      };
    } catch (error) {
      return accountToolError(error);
    }
  }

  if (name === "record_voice_feedback" || name === "learn_writing_style") {
    try {
      return await accountMcpRequest(name, args);
    } catch {
      const learning = name === "learn_writing_style";
      const message = learning
        ? "Writing style could not be saved. Retry once or finish."
        : "Feedback could not be recorded. Retry once or finish.";
      return {
        content: [{ type: "text", text: message }],
        ...(learning
          ? { structuredContent: { status: "failed", message, next: { action: "retry", tool: null } } }
          : { structuredContent: publicMcpState("failed", message, { action: "retry", tool: "record_voice_feedback" }) }),
        isError: true,
      };
    }
  }

  return undefined;
}

const PACKAGE_VERSION = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version;
const server = new Server(
  { name: "idiolect", version: PACKAGE_VERSION },
  {
    capabilities: { tools: {} },
    // Hint folded into the client's context (MCP spec).
    instructions: ACCOUNT_MODE
      ? accountInstructions
      : "Use `rewrite_in_voice` or `draft_in_voice` only when the user asks for writing in the configured voice. Use `score_voice` only when the user explicitly asks for measurement. Never infer another person's writing or invent the user's opinions.",
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: ACCOUNT_MODE ? accountTools : legacyTools,
}));

export async function handleToolRequest(req) {
  if (ACCOUNT_MODE) {
    const args = req.params.arguments || {};
    if (
      PROGRESSIVE_ACCOUNT_TOOL_NAMES.has(req.params.name) ||
      REMOTE_COMPATIBILITY_TOOL_NAMES.has(req.params.name)
    ) {
      try {
        return await accountMcpRequest(req.params.name, args);
      } catch (error) {
        return accountToolError(error);
      }
    }
    const nativeAccountResult = await handleAccountTool(req.params.name, args);
    if (nativeAccountResult) return nativeAccountResult;

    if (req.params.name === "score_voice") {
      const text = typeof args.text === "string" ? args.text.trim() : "";
      if (!text) {
        return { content: [{ type: "text", text: "score_voice: provide `text` to score." }], isError: true };
      }
      try {
        const r = await accountRequest("/api/v1/score", {
          method: "POST",
          body: { text },
          toolName: "score_voice",
        });
        return {
          content: [{ type: "text", text: scoreSummary(r) }],
          structuredContent: publicMcpState("complete", "Voice Match check complete.", { action: "continue_writing", tool: null }, {
            voiceMatch: r.absoluteScoreReportable === false ? null : r.voiceMatch ?? null,
            measured: !!r.measured,
            validated: !!r.validated,
            instrument: r.instrument ?? null,
            reason: r.reason ?? null,
            ...(typeof r.register === "string" ? { register: r.register } : {}),
            ...(typeof r.approximate === "boolean" ? { approximate: r.approximate } : {}),
            ...(r.voice ? { voice: r.voice } : {}),
            ...(r.evidence ? { evidence: r.evidence } : {}),
          }),
        };
      } catch (e) {
        return accountToolError(e);
      }
    }

    if (req.params.name === "rewrite_in_voice") {
      const text = typeof args.text === "string" ? args.text.trim() : "";
      const profileId = typeof args.profileId === "string" ? args.profileId : undefined;
      const targetRegister = typeof args.targetRegister === "string" ? args.targetRegister : undefined;
      const instructions = typeof args.instructions === "string" && args.instructions.trim()
        ? args.instructions.trim()
        : undefined;
      const language = typeof args.language === "string" && args.language.trim()
        ? args.language.trim()
        : undefined;
      const invalidChangeRequest = changeRequestError(args, "rewrite_in_voice");
      if (invalidChangeRequest) return invalidChangeRequest;
      const invalidSourceAuthor = authorProvenanceError(args, "rewrite_in_voice", "sourceAuthor");
      if (invalidSourceAuthor) return invalidSourceAuthor;
      const changeScope = args.changeScope === "polish" ? "light_edit" : args.changeScope;
      const effects = args.effects;
      const sourceAuthor = args.sourceAuthor;
      const calibration = args.calibration;
      if (!text) {
        return { content: [{ type: "text", text: "rewrite_in_voice: provide `text` to rewrite." }], isError: true };
      }
      if (targetRegister && !REGISTER_SET.has(targetRegister)) {
        return {
          content: [
            {
              type: "text",
              text: `rewrite_in_voice: \`targetRegister\` must be one of ${backtickedValues(REWRITE_REGISTERS)}.`,
            },
          ],
          isError: true,
        };
      }
      try {
        const r = await accountRequest("/api/v1/rewrite", {
          method: "POST",
          body: {
            text,
            ...(profileId !== undefined ? { voice: profileId } : {}),
            ...(targetRegister ? { targetRegister } : {}),
            ...(instructions ? { instructions } : {}),
            ...(language ? { language } : {}),
            ...(changeScope !== undefined ? { changeScope } : {}),
            ...(effects !== undefined ? { effects } : {}),
            ...(sourceAuthor !== undefined ? { sourceAuthor } : {}),
            ...(calibration !== undefined ? { calibration } : {}),
          },
          toolName: "rewrite_in_voice",
        });
        // The account API returns the rewrite, the profile and its evidence state. The
        // score block this used to print and the constants it used to coerce into the
        // structured result are gone (IDI-381).
        return {
          content: [{ type: "text", text: `Rewritten:\n${r.rewritten || ""}` }],
          structuredContent: publicMcpState("complete", "Rewrite complete.", { action: "continue_writing", tool: null }, {
            rewritten: r.rewritten ?? "",
            ...(r.reason !== undefined ? { reason: r.reason ?? null } : {}),
            ...(r.voice ? { voice: r.voice } : {}),
            ...(r.evidence ? { evidence: r.evidence } : {}),
          }),
        };
      } catch (e) {
        return accountToolError(e);
      }
    }

    if (req.params.name === "draft_in_voice") {
      const brief = typeof args.brief === "string" ? args.brief.trim() : "";
      const profileId = typeof args.profileId === "string" ? args.profileId : undefined;
      const format = typeof args.format === "string" ? args.format : undefined;
      const instructions = typeof args.instructions === "string" && args.instructions.trim()
        ? args.instructions.trim()
        : undefined;
      const language = typeof args.language === "string" && args.language.trim()
        ? args.language.trim()
        : undefined;
      const formats = new Set(["linkedin", "x_post", "x_thread", "newsletter", "generic"]);
      const invalidChangeRequest = changeRequestError(args, "draft_in_voice");
      if (invalidChangeRequest) return invalidChangeRequest;
      const invalidBriefAuthor = authorProvenanceError(args, "draft_in_voice", "briefAuthor");
      if (invalidBriefAuthor) return invalidBriefAuthor;
      const changeScope = args.changeScope === "polish" ? "light_edit" : args.changeScope;
      const effects = args.effects;
      const briefAuthor = args.briefAuthor;
      const calibration = args.calibration;
      if (!brief) {
        return { content: [{ type: "text", text: "draft_in_voice: provide `brief` to draft from." }], isError: true };
      }
      if (format && !formats.has(format)) {
        return {
          content: [
            {
              type: "text",
              text: `draft_in_voice: \`format\` must be one of ${backtickedValues([...formats])}.`,
            },
          ],
          isError: true,
        };
      }
      try {
        const r = await accountRequest("/api/v1/draft", {
          method: "POST",
          body: {
            brief,
            ...(profileId !== undefined ? { voice: profileId } : {}),
            ...(format ? { format } : {}),
            ...(instructions ? { instructions } : {}),
            ...(language ? { language } : {}),
            ...(changeScope !== undefined ? { changeScope } : {}),
            ...(effects !== undefined ? { effects } : {}),
            ...(briefAuthor !== undefined ? { briefAuthor } : {}),
            ...(calibration !== undefined ? { calibration } : {}),
          },
          toolName: "draft_in_voice",
        });
        return {
          content: [{ type: "text", text: `Draft:\n${r.draft || ""}` }],
          structuredContent: publicMcpState("complete", "Draft complete.", { action: "continue_writing", tool: null }, {
            draft: r.draft ?? "",
            ...(r.reason !== undefined ? { reason: r.reason ?? null } : {}),
            ...(r.voice ? { voice: r.voice } : {}),
            ...(r.evidence ? { evidence: r.evidence } : {}),
          }),
        };
      } catch (e) {
        return accountToolError(e);
      }
    }

    throw new Error(`Unknown tool: ${req.params.name}`);
  }

  if (req.params.name === "score_voice") {
    const texts = (req.params.arguments?.texts || []).filter(
      (t) => typeof t === "string" && t.trim(),
    );
    if (texts.length === 0) {
      return { content: [{ type: "text", text: "score_voice: provide `texts` to score." }], isError: true };
    }
    const region = loadRegion();
    if (region.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "score_voice needs your writing samples. Set IDIOLECT_SAMPLES_FILE (a text file of your writing, blank-line separated) or IDIOLECT_SAMPLES in the server env. Your samples stay local and are never stored.",
          },
        ],
        isError: true,
      };
    }
    try {
      const r = await scoreVoice(texts, region);
      return {
        content: [
          {
            type: "text",
            text: formatLegacyScoreVoiceResult(r),
          },
        ],
      };
    } catch (e) {
      return { content: [{ type: "text", text: String(e) }], isError: true };
    }
  }

  if (req.params.name !== "get_my_voice") {
    throw new Error(`Unknown tool: ${req.params.name}`);
  }
  const slug = req.params.arguments?.slug || DEFAULT_SLUG;
  if (!slug) {
    return {
      content: [
        {
          type: "text",
          text: "No Idiolect AI slug provided. Pass `slug` or set IDIOLECT_SLUG. Get yours at https://idiolect.app",
        },
      ],
      isError: true,
    };
  }
  try {
    const v = await fetchVoice(slug);
    return {
      content: [
        {
          type: "text",
          text: `${v.voiceCard}\n\n---\n(Idiolect AI voice #${slug} · genericness ${v.genericnessScore}/100. Write everything as this person from now on.)`,
        },
      ],
    };
  } catch (e) {
    return { content: [{ type: "text", text: String(e) }], isError: true };
  }
}

server.setRequestHandler(CallToolRequestSchema, handleToolRequest);

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
