// Generated from lib/mcp/public-contract.js by `npm run mcp:generate-public-artifacts`. Do not edit.
export const PUBLIC_MCP_TOOL_NAMES = Object.freeze([
  "get_my_voice",
  "create_my_voice",
  "draft_in_voice",
  "rewrite_in_voice",
  "score_voice",
  "record_voice_feedback",
  "learn_writing_style",
  "list_writing_profiles",
  "list_writing_profile_samples",
  "create_writing_profile",
  "add_samples_to_writing_profile",
  "replace_samples_in_writing_profile",
  "remove_sample_from_writing_profile",
  "set_current_writing_profile",
  "delete_writing_profile",
]);

// Decision for the 2026-08-10 high-arrival review: keep measurement available,
// but tell hosts to invoke it only when the user explicitly asks for a check.
// Unmeasured results must continue to say why and expose scorer provenance.
export const SCORE_VOICE_ADVERTISING_DECISION = Object.freeze({
  advertised: true,
  invocation: "explicit_request_only",
});

const PUBLIC_STATES = new Set([
  "ready",
  "missing",
  "thin",
  "stale",
  "complete",
  "failed",
]);
const NEXT_ACTIONS = new Set([
  "collect_evidence",
  "reload_voice",
  "continue_writing",
  "ask_feedback",
  "retry",
  "done",
]);
const NEXT_TOOLS = new Set([
  "create_my_voice",
  "get_my_voice",
  "record_voice_feedback",
  null,
]);
const SERVER_ONLY_KEYS = new Set([
  "workflowId",
  "baseVersion",
  "idempotencyKey",
  "onboardingIdempotencyKey",
  "leaseToken",
  "fencingToken",
  "attemptToken",
  "buildBindingId",
]);

function stripServerOnly(value) {
  if (Array.isArray(value)) return value.map(stripServerOnly);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SERVER_ONLY_KEYS.has(key))
      .map(([key, nested]) => [key, stripServerOnly(nested)]),
  );
}

/**
 * Build the only model-visible state/continuation envelope. Details are copied
 * through a denylist so internal coordination receipts cannot leak by spread.
 */
export function publicMcpState(state, message, next, details = {}) {
  if (!PUBLIC_STATES.has(state)) throw new TypeError(`Unknown public MCP state: ${state}`);
  if (!next || !NEXT_ACTIONS.has(next.action) || !NEXT_TOOLS.has(next.tool)) {
    throw new TypeError("Invalid public MCP next action");
  }
  const safeDetails = stripServerOnly(details);
  delete safeDetails.state;
  delete safeDetails.message;
  delete safeDetails.next;
  return {
    state,
    message,
    ...safeDetails,
    next: {
      action: next.action,
      tool: next.tool,
      ...(next.action === "retry" && typeof next.retryAfterSeconds === "number"
        ? { retryAfterSeconds: next.retryAfterSeconds }
        : {}),
    },
  };
}
