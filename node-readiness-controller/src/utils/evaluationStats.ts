import type { NodeReadinessEvaluation } from '../resources';
import type { NodeEvaluationState } from '../resources/types';

/**
 * Summary statistics representing rule satisfaction progress for a NodeReadinessEvaluation.
 */
export interface EvaluationSummary {
  /** Total number of rules applicable to this node. */
  total: number;
  /** Number of rules whose criteria are completely satisfied. */
  satisfied: number;
  /** Number of rules with unmet conditions. */
  unsatisfied: number;
  /** Indicates whether the controller has not yet written evaluation records. */
  isPending: boolean;
  /** Human-readable status label (e.g. 'OK (2/2)', 'Not Ready (1/3)', 'Evaluation Pending'). */
  statusLabel: string;
  /** Semantic severity for Headlamp StatusLabel badges. */
  statusSeverity: 'success' | 'warning' | 'error' | undefined;
}

/**
 * Computes rule satisfaction summary metrics for a NodeReadinessEvaluation object.
 *
 * @param evaluation - The NodeReadinessEvaluation instance or null/undefined.
 * @returns Summary metrics object.
 */
export function getEvaluationSummary(
  evaluation: NodeReadinessEvaluation | null | undefined
): EvaluationSummary {
  const status = evaluation?.status;
  const rules = evaluation?.rules ?? status?.rules;

  if (!status || !rules || (Object.keys(status).length === 0 && rules.length === 0)) {
    return {
      total: 0,
      satisfied: 0,
      unsatisfied: 0,
      isPending: true,
      statusLabel: 'Evaluation Pending',
      statusSeverity: undefined,
    };
  }

  const total = rules.length;
  let satisfied = 0;

  for (const r of rules) {
    if (r.ruleStatus === 'Satisfied' || r.status === 'Satisfied') {
      satisfied++;
    }
  }

  const unsatisfied = total - satisfied;

  if (total === 0) {
    return {
      total: 0,
      satisfied: 0,
      unsatisfied: 0,
      isPending: false,
      statusLabel: 'No Rules Applicable',
      statusSeverity: 'success',
    };
  }

  if (satisfied === total) {
    return {
      total,
      satisfied,
      unsatisfied: 0,
      isPending: false,
      statusLabel: `OK (${satisfied}/${total})`,
      statusSeverity: 'success',
    };
  }

  return {
    total,
    satisfied,
    unsatisfied,
    isPending: false,
    statusLabel: `Not Ready (${unsatisfied}/${total})`,
    statusSeverity: 'warning',
  };
}

/**
 * Maps an overall NodeEvaluationState enum to a display label and StatusLabel severity.
 *
 * @param state - The node evaluation state from status.state.
 * @returns Object with display label and severity.
 */
export function getEvaluationStateInfo(state?: NodeEvaluationState): {
  label: string;
  severity: 'success' | 'error' | undefined;
} {
  if (state === 'Available') {
    return { label: 'Available', severity: 'success' };
  }
  if (state === 'NotAvailable') {
    return { label: 'NotAvailable', severity: 'error' };
  }
  return { label: 'Evaluation Pending', severity: undefined };
}

/**
 * Formats a duration in milliseconds into a concise readable string (e.g., '42s', '3m 12s').
 */
export function formatDurationMs(ms: number): string {
  if (ms < 0 || isNaN(ms)) return '0s';
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

/**
 * Computes duration metric according to Design Doc §5.5:
 * "⏱️ Unblock Duration: {duration}" when the rule is satisfied,
 * or "⏳ Currently Blocked: {duration}" when actively held by the taint.
 */
export function getRuleDurationInfo(rule: {
  ruleStatus?: string;
  status?: string;
  taintAddedAt?: string;
  taintRemovedAt?: string;
  lastEvaluatedAt?: string;
}): { label: string; text: string } | null {
  const isSatisfied = rule.ruleStatus === 'Satisfied' || rule.status === 'Satisfied';
  if (isSatisfied) {
    if (rule.taintAddedAt && rule.taintRemovedAt) {
      const added = Date.parse(rule.taintAddedAt);
      const removed = Date.parse(rule.taintRemovedAt);
      if (!isNaN(added) && !isNaN(removed) && removed >= added) {
        return { label: '⏱️ Unblock Duration', text: formatDurationMs(removed - added) };
      }
    }
    return null;
  }
  // Currently blocked
  if (rule.taintAddedAt) {
    const added = Date.parse(rule.taintAddedAt);
    if (!isNaN(added)) {
      const now = rule.lastEvaluatedAt ? Date.parse(rule.lastEvaluatedAt) : Date.now();
      const elapsed = Math.max(0, now - added);
      return { label: '⏳ Currently Blocked', text: formatDurationMs(elapsed) };
    }
  }
  return null;
}
