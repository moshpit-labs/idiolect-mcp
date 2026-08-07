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

async function readErrorBody(res) {
  try {
    const contentType = res.headers.get("content-type") || "";
    const body = contentType.includes("application/json")
      ? JSON.stringify(await res.json())
      : await res.text();
    return body.trim().slice(0, 500);
  } catch {
    return "";
  }
}

async function accountErrorMessage(res, toolName) {
  if (res.status === 401) {
    return "Idiolect AI API key is invalid or expired (401). Check IDIOLECT_API_KEY.";
  }
  if (res.status === 402) {
    return `${toolName}: generation access is unavailable for this Idiolect AI account (402).`;
  }
  const body = await readErrorBody(res);
  return `${toolName}: Idiolect AI account API failed (${res.status} ${res.statusText})${body ? `: ${body}` : ""}`;
}

class AccountRequestError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "AccountRequestError";
    this.status = status;
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
  if (!res.ok) throw new AccountRequestError(await accountErrorMessage(res, toolName), res.status);
  return res.json();
}

function formatValue(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

function formatAlternatives(alternatives) {
  if (!Array.isArray(alternatives) || alternatives.length === 0) return "";
  return `\n\nAlternatives:\n${alternatives
    .map((alternative, i) => `${i + 1}. ${formatValue(alternative)}`)
    .join("\n")}`;
}

function scoreSummary(r) {
  const lines = [];
  if (r.voiceMatch !== undefined) {
    lines.push(r.voiceMatch === null ? "Voice Match: unavailable" : `Voice Match: ${formatValue(r.voiceMatch)}`);
  }
  if (r.delta !== undefined) lines.push(r.delta === null ? "Delta: unavailable" : `Delta: ${formatValue(r.delta)}`);
  if (r.candidateDelta !== undefined && r.candidateDelta !== r.delta) {
    lines.push(`Generated candidate delta: ${formatValue(r.candidateDelta)}`);
  }
  if (r.validated !== undefined) lines.push(`Validated: ${formatValue(r.validated)}`);
  if (r.measured !== undefined) lines.push(`Measured: ${formatValue(r.measured)}`);
  if (r.reason) lines.push(`Reason: ${formatValue(r.reason)}`);
  if (r.instrument) lines.push(`Instrument: ${formatValue(r.instrument)}`);
  if (r.register) lines.push(`Calibration register: ${formatValue(r.register)}`);
  if (r.crossFit !== undefined) lines.push(`Cross-fit: ${formatValue(r.crossFit)}`);
  return lines.join("\n");
}

// Mirrors REWRITE_REGISTERS in lib/connectors.ts. This file ships as a standalone npm
// package with no build step, so it cannot import from the app — keep the two in sync.
const REWRITE_REGISTERS = ["email", "slack", "essay"];
const REGISTER_SET = new Set(REWRITE_REGISTERS);

const legacyTools = [
  {
    name: "get_my_voice",
    description:
      "Load the user's Idiolect AI Voice Card. Call this BEFORE writing anything on the user's behalf (emails, posts, messages, docs) and then write strictly in the returned voice. Returns a style guide describing how the user actually writes.",
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
  register: { type: "string" },
  approximate: { type: "boolean" },
  voice: SELECTED_VOICE_SCHEMA,
  evidence: EVIDENCE_OUTPUT_SCHEMA,
};
const VOICE_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["ready", "setup_required"] },
    onboardingUrl: { type: ["string", "null"] },
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
    register: { type: "string" },
    approximate: { type: "boolean" },
  },
};
const SCORE_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    voiceMatch: { type: ["number", "null"], description: "0–100; higher = closer to the user's own writing. Relative, not a forensic identity claim." },
    measured: { type: "boolean", description: "False when the candidate or corpus is in the unscored band, or the scorer is unavailable." },
    ...PROVENANCE_OUTPUT_PROPERTIES,
  },
};
const REWRITE_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    rewritten: { type: "string", description: "The recommended text. When the cross-fit-selected candidate regresses on reporting evidence, this is the original." },
    voiceMatch: { type: ["number", "null"] },
    delta: { type: ["number", "null"], description: "Before→after Voice Match change." },
    measured: { type: "boolean" },
    crossFit: { type: "boolean" },
    candidateText: { type: "string", description: "Best generated alternative, retained even when the original is recommended." },
    candidateVoiceMatch: { type: ["number", "null"] },
    candidateDelta: { type: ["number", "null"] },
    improved: { type: ["boolean", "null"] },
    regressed: { type: ["boolean", "null"] },
    ...PROVENANCE_OUTPUT_PROPERTIES,
  },
};
const DRAFT_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    draft: { type: "string", description: "New prose drafted in the user's voice." },
    voiceMatch: { type: ["number", "null"] },
    measured: { type: "boolean" },
    crossFit: { type: "boolean" },
    ...PROVENANCE_OUTPUT_PROPERTIES,
  },
};
const CREATE_VOICE_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["ready", "more_evidence_required", "build_in_progress"] },
    message: { type: "string" },
    reason: { type: ["string", "null"] },
    voiceId: { type: ["string", "null"] },
    onboardingUrl: { type: ["string", "null"] },
    neededChars: { type: "number" },
    neededBlocks: { type: "number" },
    minimumChars: { type: "number" },
    minimumBlocks: { type: "number" },
    replay: { type: "boolean" },
  },
};

export const accountTools = [
  {
    name: "get_my_voice",
    description:
      "Use this when you are about to write anything on the user's behalf — emails, posts, messages, commit messages, PR descriptions, docs. It loads the user's Idiolect AI voice so you can write strictly as them.",
    inputSchema: { type: "object", properties: {} },
    outputSchema: VOICE_OUTPUT_SCHEMA,
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false, title: "Load Idiolect AI Voice" },
  },
  {
    name: "create_my_voice",
    description:
      "Create the authenticated user's Voice Profile from writing they supplied or explicitly approved. Returns exact evidence still needed when the input is too thin; never infer or scrape another person's writing.",
    inputSchema: {
      type: "object",
      properties: {
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
        name: { type: "string", maxLength: 60, description: "Optional private name for the Voice Profile." },
        idempotencyKey: {
          type: "string",
          minLength: 8,
          maxLength: 160,
          description: "Stable unique key for retries of this same creation intent.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: CREATE_VOICE_OUTPUT_SCHEMA,
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false, title: "Create My Voice Profile" },
  },
  {
    name: "score_voice",
    description:
      "Use this when you want to check how close a piece of text is to the user's own writing. Returns a Voice Match (0–100, relative — higher means closer to the user's voice; not a forensic identity claim).",
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
      "Rewrite supplied prose in the user's voice. Returns an in-voice alternative with a Voice Match and before→after delta; use it only when it preserves the user's meaning and fits their request.",
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
      },
      required: ["text"],
    },
    outputSchema: REWRITE_OUTPUT_SCHEMA,
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false, title: "Rewrite In Voice" },
  },
  {
    name: "draft_in_voice",
    description:
      "Draft new prose in the user's voice from a supplied brief. Returns a draft with a Voice Match score for the user or agent to review.",
    inputSchema: {
      type: "object",
      properties: {
        brief: { type: "string", description: "What to write: audience, goal, constraints, and source facts." },
        format: {
          type: "string",
          enum: ["linkedin", "x_post", "x_thread", "newsletter", "generic"],
          description: "Optional output format (default: generic).",
        },
      },
      required: ["brief"],
    },
    outputSchema: DRAFT_OUTPUT_SCHEMA,
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false, title: "Draft In Voice" },
  },
];

function toolError(message) {
  return { content: [{ type: "text", text: message }], isError: true };
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
  if (
    args.idempotencyKey !== undefined
    && (
      typeof args.idempotencyKey !== "string"
      || args.idempotencyKey.length < 8
      || args.idempotencyKey.length > 160
    )
  ) {
    return { error: "create_my_voice: `idempotencyKey` must be 8–160 characters." };
  }
  return {
    body: {
      samples,
      answers: answers.map(({ question, answer }) => ({ question, answer })),
      ...(args.name !== undefined ? { name: args.name } : {}),
      ...(args.idempotencyKey !== undefined ? { idempotencyKey: args.idempotencyKey } : {}),
    },
  };
}

function safeCreationResult(r) {
  return {
    status: r.status ?? "more_evidence_required",
    message: r.message ?? "Voice Profile setup needs more information.",
    reason: r.reason ?? null,
    voiceId: r.voiceId ?? null,
    onboardingUrl: r.onboardingUrl ?? null,
    neededChars: Number.isFinite(r.neededChars) ? r.neededChars : 0,
    neededBlocks: Number.isFinite(r.neededBlocks) ? r.neededBlocks : 0,
    minimumChars: Number.isFinite(r.minimumChars) ? r.minimumChars : 600,
    minimumBlocks: Number.isFinite(r.minimumBlocks) ? r.minimumBlocks : 4,
    replay: r.replay === true,
  };
}

/** Import-safe account handler used by the stdio server and its parity tests. */
export async function handleAccountTool(name, args = {}) {
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
        structuredContent: {
          status: "ready",
          onboardingUrl: null,
          message: "Voice Profile ready.",
          ...(r.voice || {}),
        },
      };
    } catch (error) {
      if (error instanceof AccountRequestError && error.status === 404) {
        const message = "Your Idiolect AI account is connected. A Voice Profile is the only step left. Choose one: paste 3–5 examples of writing you authored, or say ‘Guide me’ for a short voice interview. Nothing will be created until you ask.";
        return {
          content: [{ type: "text", text: message }],
          structuredContent: { status: "setup_required", onboardingUrl: null, message },
        };
      }
      return toolError(String(error));
    }
  }

  if (name === "create_my_voice") {
    const prepared = createVoiceBody(args);
    if (prepared.error) return toolError(prepared.error);
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
      return toolError(String(error));
    }
  }

  return undefined;
}

const server = new Server(
  { name: "idiolect", version: "0.4.0" },
  {
    capabilities: { tools: {} },
    // Hint folded into the client's context (MCP spec): use Idiolect AI proactively.
    instructions:
      "Idiolect AI makes you write in THIS user's own voice. Whenever you are about to write any prose on the user's behalf — emails, replies, messages, posts, commit messages, PR descriptions, docs — FIRST call get_my_voice (once per session) and write in that voice. If setup is required, explain that the user can paste 3–5 examples of writing they authored or ask for a short guided interview. If they choose the interview, ask one question at a time about how they communicate and retain only their answers as approved evidence. Use create_my_voice only after the user explicitly asks to create the profile from writing they supplied or approved; never infer, scrape, or attribute someone else's writing to them. get_my_voice may be used afterward to confirm readiness. You may call rewrite_in_voice to generate an in-voice alternative with a Voice Match; use it only when it preserves the user's meaning and fits their request. Do not use for code. Never invent the user's opinions — only match their style.",
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: ACCOUNT_MODE ? accountTools : legacyTools,
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (ACCOUNT_MODE) {
    const args = req.params.arguments || {};
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
          structuredContent: {
            voiceMatch: r.voiceMatch ?? null,
            measured: !!r.measured,
            validated: !!r.validated,
            instrument: r.instrument ?? null,
            reason: r.reason ?? null,
            register: r.register ?? "",
            approximate: !!r.approximate,
            ...(r.voice ? { voice: r.voice } : {}),
            ...(r.evidence ? { evidence: r.evidence } : {}),
          },
        };
      } catch (e) {
        return { content: [{ type: "text", text: String(e) }], isError: true };
      }
    }

    if (req.params.name === "rewrite_in_voice") {
      const text = typeof args.text === "string" ? args.text.trim() : "";
      const targetRegister = typeof args.targetRegister === "string" ? args.targetRegister : undefined;
      if (!text) {
        return { content: [{ type: "text", text: "rewrite_in_voice: provide `text` to rewrite." }], isError: true };
      }
      if (targetRegister && !REGISTER_SET.has(targetRegister)) {
        return {
          content: [
            {
              type: "text",
              text: `rewrite_in_voice: \`targetRegister\` must be one of ${REWRITE_REGISTERS.join(", ")}.`,
            },
          ],
          isError: true,
        };
      }
      try {
        const r = await accountRequest("/api/v1/rewrite", {
          method: "POST",
          body: { text, ...(targetRegister ? { targetRegister } : {}) },
          toolName: "rewrite_in_voice",
        });
        return {
          content: [
            {
              type: "text",
              text: `Rewritten:\n${r.rewritten || ""}\n\n${scoreSummary(r)}${formatAlternatives(r.alternatives)}`,
            },
          ],
          structuredContent: {
            rewritten: r.rewritten ?? "",
            voiceMatch: r.voiceMatch ?? null,
            delta: r.delta ?? null,
            measured: !!r.measured,
            crossFit: !!r.crossFit,
            candidateText: r.candidateText ?? r.rewritten ?? "",
            candidateVoiceMatch: r.candidateVoiceMatch ?? null,
            candidateDelta: r.candidateDelta ?? null,
            improved: r.improved ?? null,
            regressed: r.regressed ?? null,
            validated: !!r.validated,
            instrument: r.instrument ?? null,
            reason: r.reason ?? null,
            register: r.register ?? "",
            approximate: !!r.approximate,
            ...(r.voice ? { voice: r.voice } : {}),
            ...(r.evidence ? { evidence: r.evidence } : {}),
          },
        };
      } catch (e) {
        return { content: [{ type: "text", text: String(e) }], isError: true };
      }
    }

    if (req.params.name === "draft_in_voice") {
      const brief = typeof args.brief === "string" ? args.brief.trim() : "";
      const format = typeof args.format === "string" ? args.format : undefined;
      const formats = new Set(["linkedin", "x_post", "x_thread", "newsletter", "generic"]);
      if (!brief) {
        return { content: [{ type: "text", text: "draft_in_voice: provide `brief` to draft from." }], isError: true };
      }
      if (format && !formats.has(format)) {
        return {
          content: [
            {
              type: "text",
              text: "draft_in_voice: `format` must be one of linkedin, x_post, x_thread, newsletter, generic.",
            },
          ],
          isError: true,
        };
      }
      try {
        const r = await accountRequest("/api/v1/draft", {
          method: "POST",
          body: { brief, ...(format ? { format } : {}) },
          toolName: "draft_in_voice",
        });
        return {
          content: [
            {
              type: "text",
              text: `Draft:\n${r.draft || ""}\n\n${scoreSummary(r)}${formatAlternatives(r.alternatives)}`,
            },
          ],
          structuredContent: {
            draft: r.draft ?? "",
            voiceMatch: r.voiceMatch ?? null,
            measured: !!r.measured,
            crossFit: !!r.crossFit,
            validated: !!r.validated,
            instrument: r.instrument ?? null,
            reason: r.reason ?? null,
            register: r.register ?? "",
            approximate: !!r.approximate,
            ...(r.voice ? { voice: r.voice } : {}),
            ...(r.evidence ? { evidence: r.evidence } : {}),
          },
        };
      } catch (e) {
        return { content: [{ type: "text", text: String(e) }], isError: true };
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
      const lines = r.scores
        .map((s, i) => `#${i + 1} · Voice Match ${s.voiceMatch}/100 — ${s.text.slice(0, 60)}…`)
        .join("\n");
      return {
        content: [
          {
            type: "text",
            text: `${lines}\n\n(Relative voice-fidelity on the validated LUAR metric — higher = reads more like you. Revise low-scoring drafts before sending.)`,
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
});

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
