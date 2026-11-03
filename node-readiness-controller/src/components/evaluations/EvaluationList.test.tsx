/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EvaluationList from './EvaluationList';

const { mockResourceListViewProps, mockUseList } = vi.hoisted(() => ({
  mockResourceListViewProps: vi.fn(),
  mockUseList: vi.fn(),
}));

vi.mock('@kinvolk/headlamp-plugin/lib/lib/k8s/crd', () => ({
  makeCustomResourceClass: vi.fn().mockReturnValue(
    class MockCRD {
      static useList(...args: any[]) {
        return mockUseList(...args);
      }
    }
  ),
}));

vi.mock('@kinvolk/headlamp-plugin/lib/CommonComponents', () => ({
  Link: ({ children, routeName, url, params, activeCluster }: any) => (
    <a
      href={`#${routeName || url || 'test'}`}
      data-routename={routeName}
      data-url={url}
      data-params={JSON.stringify(params)}
      data-cluster={activeCluster}
    >
      {children}
    </a>
  ),
  StatusLabel: ({ children, status }: any) => (
    <span data-testid="status-label" data-status={status}>
      {children}
    </span>
  ),
  SectionBox: ({ title, children }: any) => (
    <div data-testid="section-box">
      <h2>{title}</h2>
      {children}
    </div>
  ),
  ResourceListView: (props: any) => {
    mockResourceListViewProps(props);
    return (
      <div data-testid="resource-list-view">
        <h1>{props.title}</h1>
      </div>
    );
  },
}));

describe('EvaluationList component', () => {
  beforeEach(() => {
    mockUseList.mockReturnValue([[], null]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders ResourceListView with correct title and resourceClass', () => {
    render(<EvaluationList />);

    expect(screen.getByTestId('resource-list-view')).toBeInTheDocument();
    expect(screen.getByText('Node Readiness Evaluations')).toBeInTheDocument();

    const lastCall = mockResourceListViewProps.mock.calls.at(-1)?.[0];
    expect(lastCall).toBeDefined();
    expect(lastCall.title).toBe('Node Readiness Evaluations');
    expect(lastCall.id).toBe('nrc-node-evaluations');
    expect(lastCall.data).toBeDefined();
    expect(lastCall.enableRowActions).toBe(false);
    expect(lastCall.enableRowSelection).toBe(false);
  });

  it('configures expected columns', () => {
    render(<EvaluationList />);
    const lastCall = mockResourceListViewProps.mock.calls.at(-1)?.[0];
    const columnIds = lastCall.columns.map((c: any) => (typeof c === 'string' ? c : c.id));

    expect(columnIds).toEqual(['name', 'state', 'rulesStatus', 'age']);
  });

  it('correctly extracts and renders name column with deep links and preserves cluster for multi-cluster views', () => {
    render(<EvaluationList />);
    const lastCall = mockResourceListViewProps.mock.calls.at(-1)?.[0];
    const nameColumn = lastCall.columns.find((c: any) => c.id === 'name');

    const mockEvalClusterA = {
      metadata: { name: 'worker-node-01' },
      nodeName: 'worker-node-01',
      cluster: 'prod-east',
    } as any;

    const mockEvalClusterB = {
      metadata: { name: 'worker-node-01' },
      nodeName: 'worker-node-01',
      cluster: 'staging-west',
    } as any;

    expect(nameColumn.getValue(mockEvalClusterA)).toBe('worker-node-01');

    // Render row from cluster A
    const { container: containerA } = render(nameColumn.render(mockEvalClusterA));
    expect(containerA).toHaveTextContent('worker-node-01');
    expect(containerA).toHaveTextContent('View Node (worker-node-01)');

    const linksA = containerA.querySelectorAll('a');
    expect(linksA[0].getAttribute('data-routename')).toBe('nrc-evaluation-details');
    expect(linksA[0].getAttribute('data-cluster')).toBe('prod-east');
    expect(linksA[1].getAttribute('data-routename')).toBe('node');
    expect(linksA[1].getAttribute('data-params')).toBe(JSON.stringify({ name: 'worker-node-01' }));
    expect(linksA[1].getAttribute('data-cluster')).toBe('prod-east');

    // Render row from cluster B with identical node name
    const { container: containerB } = render(nameColumn.render(mockEvalClusterB));
    const linksB = containerB.querySelectorAll('a');
    expect(linksB[0].getAttribute('data-cluster')).toBe('staging-west');
    expect(linksB[1].getAttribute('data-cluster')).toBe('staging-west');

    // Assert that identically named rows produce distinct destinations
    expect(linksA[0].getAttribute('data-cluster')).not.toBe(linksB[0].getAttribute('data-cluster'));
  });

  it('renders CrdNotInstalled when NRE CRD returns 404 Not Found', () => {
    mockUseList.mockReturnValue([null, { status: 404, message: 'Resource not found' }]);
    render(<EvaluationList />);

    expect(screen.getByText('NodeReadinessEvaluation CRD Not Installed')).toBeInTheDocument();
    expect(
      screen.getByText(/NodeReadinessEvaluation CRDs are not installed on this cluster/i)
    ).toBeInTheDocument();
    expect(screen.queryByTestId('resource-list-view')).not.toBeInTheDocument();
  });

  it('renders CrdNotInstalled when user lacks permissions (403 Forbidden)', () => {
    mockUseList.mockReturnValue([null, { status: 403, message: 'Forbidden' }]);
    render(<EvaluationList />);

    expect(
      screen.getByText('Permission Denied: Cannot Read Node Readiness Evaluations')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('resource-list-view')).not.toBeInTheDocument();
  });

  it('correctly extracts and renders state column', () => {
    render(<EvaluationList />);
    const lastCall = mockResourceListViewProps.mock.calls.at(-1)?.[0];
    const stateColumn = lastCall.columns.find((c: any) => c.id === 'state');

    const availableEval = { state: 'Available' } as any;
    expect(stateColumn.getValue(availableEval)).toBe('Available');
    const { container: availableContainer } = render(stateColumn.render(availableEval));
    expect(availableContainer).toHaveTextContent('Available');
    expect(availableContainer.querySelector('[data-testid="status-label"]')).toHaveAttribute(
      'data-status',
      'success'
    );

    cleanup();

    const blockedEval = { state: 'NotAvailable' } as any;
    expect(stateColumn.getValue(blockedEval)).toBe('NotAvailable');
    const { container: blockedContainer } = render(stateColumn.render(blockedEval));
    expect(blockedContainer).toHaveTextContent('NotAvailable');
    expect(blockedContainer.querySelector('[data-testid="status-label"]')).toHaveAttribute(
      'data-status',
      'error'
    );

    cleanup();

    const pendingEval = { state: undefined } as any;
    expect(stateColumn.getValue(pendingEval)).toBe('Pending');
    const { container: pendingContainer } = render(stateColumn.render(pendingEval));
    expect(pendingContainer).toHaveTextContent('Evaluation Pending');
  });

  it('correctly extracts and renders rulesStatus column', () => {
    render(<EvaluationList />);
    const lastCall = mockResourceListViewProps.mock.calls.at(-1)?.[0];
    const rulesStatusColumn = lastCall.columns.find((c: any) => c.id === 'rulesStatus');

    const satisfiedEval = {
      status: {
        rules: [
          { ruleName: 'rule-1', ruleStatus: 'Satisfied' },
          { ruleName: 'rule-2', ruleStatus: 'Satisfied' },
        ],
      },
      rules: [
        { ruleName: 'rule-1', ruleStatus: 'Satisfied' },
        { ruleName: 'rule-2', ruleStatus: 'Satisfied' },
      ],
    } as any;

    expect(rulesStatusColumn.getValue(satisfiedEval)).toBe('OK');
    const { container: satisfiedContainer } = render(rulesStatusColumn.render(satisfiedEval));
    expect(satisfiedContainer).toHaveTextContent('OK (2/2)');
    expect(satisfiedContainer.querySelector('[data-testid="status-label"]')).toHaveAttribute(
      'data-status',
      'success'
    );

    cleanup();

    const unsatisfiedEval = {
      status: {
        rules: [
          { ruleName: 'rule-1', ruleStatus: 'Satisfied' },
          { ruleName: 'rule-2', ruleStatus: 'Unsatisfied' },
        ],
      },
      rules: [
        { ruleName: 'rule-1', ruleStatus: 'Satisfied' },
        { ruleName: 'rule-2', ruleStatus: 'Unsatisfied' },
      ],
    } as any;

    expect(rulesStatusColumn.getValue(unsatisfiedEval)).toBe('Not Ready');
    const { container: unsatisfiedContainer } = render(rulesStatusColumn.render(unsatisfiedEval));
    expect(unsatisfiedContainer).toHaveTextContent('Not Ready (1/2)');
    expect(unsatisfiedContainer.querySelector('[data-testid="status-label"]')).toHaveAttribute(
      'data-status',
      'warning'
    );
  });
});
