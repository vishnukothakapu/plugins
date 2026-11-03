import { describe, expect, it } from 'vitest';
import type { NodeReadinessEvaluation } from '../resources';
import {
  formatDurationMs,
  getEvaluationStateInfo,
  getEvaluationSummary,
  getRuleDurationInfo,
} from './evaluationStats';

describe('getEvaluationSummary', () => {
  it('returns pending when evaluation or status is empty or undefined', () => {
    expect(getEvaluationSummary(null)).toEqual({
      total: 0,
      satisfied: 0,
      unsatisfied: 0,
      isPending: true,
      statusLabel: 'Evaluation Pending',
      statusSeverity: undefined,
    });

    const emptyEval = {
      status: {},
    } as unknown as NodeReadinessEvaluation;
    expect(getEvaluationSummary(emptyEval).isPending).toBe(true);
  });

  it('returns no rules applicable when rules array is empty', () => {
    const evalObj = {
      status: {
        rules: [],
      },
      rules: [],
    } as unknown as NodeReadinessEvaluation;

    const summary = getEvaluationSummary(evalObj);
    expect(summary.total).toBe(0);
    expect(summary.statusLabel).toBe('No Rules Applicable');
    expect(summary.statusSeverity).toBe('success');
  });

  it('returns OK status when all rules are satisfied', () => {
    const evalObj = {
      status: {
        rules: [
          { ruleName: 'rule-1', ruleStatus: 'Satisfied', taintStatus: 'Absent' },
          { ruleName: 'rule-2', ruleStatus: 'Satisfied', taintStatus: 'Absent' },
        ],
      },
      rules: [
        { ruleName: 'rule-1', ruleStatus: 'Satisfied', taintStatus: 'Absent' },
        { ruleName: 'rule-2', ruleStatus: 'Satisfied', taintStatus: 'Absent' },
      ],
    } as unknown as NodeReadinessEvaluation;

    const summary = getEvaluationSummary(evalObj);
    expect(summary.total).toBe(2);
    expect(summary.satisfied).toBe(2);
    expect(summary.unsatisfied).toBe(0);
    expect(summary.statusLabel).toBe('OK (2/2)');
    expect(summary.statusSeverity).toBe('success');
  });

  it('returns Not Ready status when some rules are unsatisfied', () => {
    const evalObj = {
      status: {
        rules: [
          { ruleName: 'rule-1', ruleStatus: 'Satisfied', taintStatus: 'Absent' },
          { ruleName: 'rule-2', ruleStatus: 'Unsatisfied', taintStatus: 'Present' },
          { ruleName: 'rule-3', ruleStatus: 'Unsatisfied', taintStatus: 'Present' },
        ],
      },
      rules: [
        { ruleName: 'rule-1', ruleStatus: 'Satisfied', taintStatus: 'Absent' },
        { ruleName: 'rule-2', ruleStatus: 'Unsatisfied', taintStatus: 'Present' },
        { ruleName: 'rule-3', ruleStatus: 'Unsatisfied', taintStatus: 'Present' },
      ],
    } as unknown as NodeReadinessEvaluation;

    const summary = getEvaluationSummary(evalObj);
    expect(summary.total).toBe(3);
    expect(summary.satisfied).toBe(1);
    expect(summary.unsatisfied).toBe(2);
    expect(summary.statusLabel).toBe('Not Ready (2/3)');
    expect(summary.statusSeverity).toBe('warning');
  });
});

describe('getEvaluationStateInfo', () => {
  it('handles Available state', () => {
    expect(getEvaluationStateInfo('Available')).toEqual({
      label: 'Available',
      severity: 'success',
    });
  });

  it('handles NotAvailable state', () => {
    expect(getEvaluationStateInfo('NotAvailable')).toEqual({
      label: 'NotAvailable',
      severity: 'error',
    });
  });

  it('handles undefined or pending state', () => {
    expect(getEvaluationStateInfo(undefined)).toEqual({
      label: 'Evaluation Pending',
      severity: undefined,
    });
  });
});

describe('formatDurationMs & getRuleDurationInfo', () => {
  it('formats milliseconds into human readable durations', () => {
    expect(formatDurationMs(42000)).toBe('42s');
    expect(formatDurationMs(130000)).toBe('2m 10s');
    expect(formatDurationMs(-500)).toBe('0s');
  });

  it('computes unblock duration for satisfied rules with taint timestamps', () => {
    const info = getRuleDurationInfo({
      ruleStatus: 'Satisfied',
      taintAddedAt: '2026-11-06T10:00:00Z',
      taintRemovedAt: '2026-11-06T10:00:42Z',
    });
    expect(info).toEqual({
      label: '⏱️ Unblock Duration',
      text: '42s',
    });
  });

  it('computes currently blocked duration for unsatisfied rules', () => {
    const info = getRuleDurationInfo({
      ruleStatus: 'Unsatisfied',
      taintAddedAt: '2026-11-06T10:00:00Z',
      lastEvaluatedAt: '2026-11-06T10:03:12Z',
    });
    expect(info).toEqual({
      label: '⏳ Currently Blocked',
      text: '3m 12s',
    });
  });

  it('returns null if timestamps are missing', () => {
    expect(getRuleDurationInfo({ ruleStatus: 'Satisfied' })).toBeNull();
    expect(getRuleDurationInfo({ ruleStatus: 'Unsatisfied' })).toBeNull();
  });
});
