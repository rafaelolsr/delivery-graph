// Policy and authority engine (M3 — governance spine).
//
// The governor is policy-bounded: it may automatically apply REVERSIBLE changes that
// stay inside already-delegated authority, but a defined set of changes ALWAYS require
// human approval. This module is the single, explainable place that answers two
// questions:
//
//   requiresHumanApproval(change, policy) -> { required, reasons[] }
//   evaluateAuthority(actor, change, policy) -> { decision, reasons[] }
//
// It is pure data-in / verdict-out so every decision is inspectable and replayable.
// It never mutates anything. An agent can never grant itself authority: a change whose
// actor is not human and that expands permissions/authority is rejected here, before
// any gate or mutation runs.

// The human-approval triggers, verbatim from the spec's Authority section. A change
// that matches ANY of these cannot be auto-applied, regardless of reversibility.
export const APPROVAL_TRIGGERS = Object.freeze({
  EXPANDS_PERMISSIONS: "expands permissions or delegation authority",
  MODIFIES_INTENT: "modifies the original Intent",
  WEAKENS_ACCEPTANCE: "weakens acceptance criteria",
  REMOVES_PROOF: "removes required proof",
  EXCEEDS_HARD_BOUNDARY: "exceeds a hard organizational boundary",
  IRREVERSIBLE_EXTERNAL: "introduces an irreversible or high-impact external action",
  CHANGES_FORBIDDEN_DOMAIN: "changes a forbidden domain or compliance constraint",
  UNPROVEN_INFLUENCES_LEARNING: "makes an unproven result influence organizational learning"
});

// An actor string follows the OKF convention (SPEC §7): `human:<id>`, `<agent>/<ver>`,
// or `process:<id>`. Only a human actor carries human authority.
export function isHumanActor(actor) {
  return typeof actor === "string" && actor.startsWith("human:");
}

// A change is a plain descriptor:
//   {
//     type: "mutation" | "allocation" | "learning" | "intent" | ...,
//     actor: "<actor>",
//     reversible: boolean,
//     effects: {
//       expandsPermissions?, modifiesIntent?, weakensAcceptance?, removesProof?,
//       exceedsHardBoundary?, irreversibleExternal?, changesForbiddenDomain?,
//       unprovenInfluencesLearning?
//     }
//   }
// Every effect defaults to false when absent.

const EFFECT_TO_TRIGGER = Object.freeze({
  expandsPermissions: APPROVAL_TRIGGERS.EXPANDS_PERMISSIONS,
  modifiesIntent: APPROVAL_TRIGGERS.MODIFIES_INTENT,
  weakensAcceptance: APPROVAL_TRIGGERS.WEAKENS_ACCEPTANCE,
  removesProof: APPROVAL_TRIGGERS.REMOVES_PROOF,
  exceedsHardBoundary: APPROVAL_TRIGGERS.EXCEEDS_HARD_BOUNDARY,
  irreversibleExternal: APPROVAL_TRIGGERS.IRREVERSIBLE_EXTERNAL,
  changesForbiddenDomain: APPROVAL_TRIGGERS.CHANGES_FORBIDDEN_DOMAIN,
  unprovenInfluencesLearning: APPROVAL_TRIGGERS.UNPROVEN_INFLUENCES_LEARNING
});

// Which triggers to check. A change is auto-applicable only if NONE fire.
export function requiresHumanApproval(change = {}) {
  const effects = change.effects ?? {};
  const reasons = [];
  for (const [effect, trigger] of Object.entries(EFFECT_TO_TRIGGER)) {
    if (effects[effect]) reasons.push(trigger);
  }
  // A change is auto-applicable only when it is AFFIRMATIVELY reversible: the spec
  // allows automatic application only for REVERSIBLE changes inside delegated
  // authority, so unknown reversibility (the field absent) is default-denied, not
  // assumed reversible. Reversibility must be established, never presumed.
  if (change.reversible !== true && reasons.length === 0) {
    reasons.push(change.reversible === false ? "change is not reversible" : "change reversibility is not established");
  }
  return { required: reasons.length > 0, reasons };
}

export const AUTHORITY_DECISIONS = Object.freeze({
  AUTO_OK: "auto_ok", // inside delegated authority, reversible, no trigger — governor may apply
  REQUIRES_HUMAN: "requires_human", // a trigger fired — needs explicit human approval
  REJECTED: "rejected" // an agent tried to self-expand authority — never allowed
});

// The core authority decision. `approvals` is the set of human-approval records
// already attached to the change (see approvals.mjs); a REQUIRES_HUMAN change becomes
// applicable only once a matching human approval exists.
export function evaluateAuthority(change = {}, { approvals = [] } = {}) {
  const { required, reasons } = requiresHumanApproval(change);

  // Hard rule: an agent must never grant itself additional authority. If the change
  // expands permissions/authority and the actor is not a human, it is REJECTED —
  // not merely deferred — because no self-approval could make it legitimate.
  const selfExpansion =
    (change.effects?.expandsPermissions || change.effects?.exceedsHardBoundary) &&
    !isHumanActor(change.actor);
  if (selfExpansion) {
    return {
      decision: AUTHORITY_DECISIONS.REJECTED,
      reasons: ["an agent cannot grant itself additional authority or cross a hard boundary"]
    };
  }

  if (!required) {
    return { decision: AUTHORITY_DECISIONS.AUTO_OK, reasons: ["reversible change inside delegated authority; no approval trigger fired"] };
  }

  // A trigger fired: applicable only if a human approval covers this change.
  const humanApproved = approvals.some((a) => isHumanActor(a.approver) && a.approved === true);
  if (humanApproved) {
    return { decision: AUTHORITY_DECISIONS.AUTO_OK, reasons: [`approved by a human despite: ${reasons.join("; ")}`] };
  }
  return { decision: AUTHORITY_DECISIONS.REQUIRES_HUMAN, reasons };
}
