/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EvaluationRuleTable from './EvaluationRuleTable';

vi.mock('@iconify/react', () => ({
  Icon: ({ icon }: any) => <span data-testid={`icon-${icon}`} />,
}));

vi.mock('@kinvolk/headlamp-plugin/lib/CommonComponents', () => ({
  Link: ({ children, routeName, params }: any) => (
    <a data-routename={routeName} data-params={JSON.stringify(params)}>
      {children}
    </a>
  ),
  StatusLabel: ({ children, status }: any) => (
    <span data-testid="status-label" data-status={status}>
      {children}
    </span>
  ),
  DateLabel: ({ date }: any) => <span data-testid="date-label">{date}</span>,
  SectionBox: ({ title, children }: any) => (
    <div data-testid={`section-${title}`}>
      <h3>{title}</h3>
      {children}
    </div>
  ),
  SimpleTable: ({ columns, data }: any) => (
    <table data-testid="simple-table">
      <tbody>
        {data.map((item: any, idx: number) => (
          <tr key={idx}>
            {columns.map((col: any, colIdx: number) => (
              <td key={colIdx}>{col.getter(item)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

describe('EvaluationRuleTable component', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders empty message when no rules are evaluated', () => {
    render(<EvaluationRuleTable rules={[]} />);
    expect(screen.getByText('No rules evaluated for this node yet.')).toBeInTheDocument();
  });

  it('renders rule summary rows and nested per-condition breakdown for satisfied rule', () => {
    const mockRules = [
      {
        ruleName: 'rule-cni-ready',
        enforcementMode: 'continuous' as const,
        conditionPolicy: 'allOf' as const,
        ruleStatus: 'Satisfied' as const,
        taintStatus: 'Absent' as const,
        taintKey: 'readiness.k8s.io/cni-not-ready',
        taintEffect: 'NoSchedule' as const,
        reason: 'AllConditionsSatisfied',
        message: 'Calico CNI setup succeeded',
        firstEvaluatedAt: '2026-11-06T10:00:00Z',
        lastEvaluatedAt: '2026-11-06T10:02:15Z',
        taintAddedAt: '2026-11-06T10:00:05Z',
        taintRemovedAt: '2026-11-06T10:02:15Z',
        readinessConditions: [
          {
            type: 'network.kubernetes.io/CNIReady',
            requiredStatus: 'True' as const,
            currentStatus: 'True' as const,
          },
        ],
      },
    ];

    render(<EvaluationRuleTable rules={mockRules} />);

    // Top-level summary columns
    expect(screen.getByText('rule-cni-ready')).toBeInTheDocument();
    expect(screen.getByText('Visit rule')).toBeInTheDocument();
    expect(screen.getByText('continuous')).toBeInTheDocument();
    expect(screen.getAllByText('Satisfied').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('1/1')).toBeInTheDocument();

    // Diagnostics & Unblock Duration metric
    expect(screen.getByText('⏱️ Unblock Duration')).toBeInTheDocument();
    expect(screen.getByText('2m 10s')).toBeInTheDocument();
    expect(screen.getByText('AllConditionsSatisfied')).toBeInTheDocument();
    expect(screen.getByText('Calico CNI setup succeeded')).toBeInTheDocument();

    // Nested conditions table
    expect(screen.getByText('Readiness Conditions Breakdown (1)')).toBeInTheDocument();
    expect(screen.getByText('network.kubernetes.io/CNIReady')).toBeInTheDocument();
    expect(screen.getByText('Unknown (implicit)')).toBeInTheDocument();
  });

  it('renders active taint and currently blocked duration for unsatisfied rule', () => {
    const mockRules = [
      {
        ruleName: 'rule-gpu-driver',
        enforcementMode: 'bootstrap-only' as const,
        conditionPolicy: 'anyOf' as const,
        ruleStatus: 'Unsatisfied' as const,
        taintStatus: 'Present' as const,
        taintKey: 'readiness.k8s.io/gpu-not-ready',
        taintEffect: 'NoSchedule' as const,
        reason: 'ConditionsNotMet',
        message: 'GPU driver kernel module not found',
        firstEvaluatedAt: '2026-11-06T10:00:00Z',
        lastEvaluatedAt: '2026-11-06T10:05:00Z',
        taintAddedAt: '2026-11-06T10:00:00Z',
        readinessConditions: [
          {
            type: 'nvidia.com/GPUReady',
            requiredStatus: 'True' as const,
            currentStatus: 'False' as const,
            defaultStatus: 'False' as const,
          },
        ],
      },
    ];

    render(<EvaluationRuleTable rules={mockRules} />);

    expect(screen.getByText('rule-gpu-driver')).toBeInTheDocument();
    expect(screen.getByText('[anyOf]')).toBeInTheDocument();
    expect(screen.getByText('readiness.k8s.io/gpu-not-ready:NoSchedule')).toBeInTheDocument();
    expect(screen.getAllByText('Unsatisfied').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('0/1')).toBeInTheDocument();

    // Currently Blocked metric
    expect(screen.getByText('⏳ Currently Blocked')).toBeInTheDocument();
    expect(screen.getByText('5m 0s')).toBeInTheDocument();
  });
});
