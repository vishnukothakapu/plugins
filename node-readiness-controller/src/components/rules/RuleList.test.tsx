/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RuleList from './RuleList';

const mockResourceListViewProps = vi.fn();

vi.mock('@kinvolk/headlamp-plugin/lib/lib/k8s/crd', () => ({
  makeCustomResourceClass: vi.fn().mockReturnValue(class MockCRD {}),
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
  ResourceListView: (props: any) => {
    mockResourceListViewProps(props);
    return (
      <div data-testid="resource-list-view">
        <h1>{props.title}</h1>
      </div>
    );
  },
}));

describe('RuleList component', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders ResourceListView with correct title and id', () => {
    render(<RuleList />);

    expect(screen.getByTestId('resource-list-view')).toBeInTheDocument();
    expect(screen.getByText('Node Readiness Rules')).toBeInTheDocument();

    const lastCall = mockResourceListViewProps.mock.calls.at(-1)?.[0];
    expect(lastCall).toBeDefined();
    expect(lastCall.title).toBe('Node Readiness Rules');
    expect(lastCall.id).toBe('nrc-readiness-rules');
  });

  it('uses rule.getName() for the name column value and render', () => {
    render(<RuleList />);
    const lastCall = mockResourceListViewProps.mock.calls.at(-1)?.[0];
    const nameColumn = lastCall.columns.find((c: any) => c.id === 'name');

    const mockRule = {
      getName: vi.fn().mockReturnValue('my-custom-rule'),
      isDryRun: false,
    } as any;

    expect(nameColumn.getValue(mockRule)).toBe('my-custom-rule');
    expect(mockRule.getName).toHaveBeenCalled();

    const { container } = render(nameColumn.render(mockRule));
    expect(container).toHaveTextContent('my-custom-rule');

    const link = container.querySelector('a');
    expect(link?.getAttribute('data-routename')).toBe('nrc-rule-details');
    expect(link?.getAttribute('data-params')).toBe('{"name":"my-custom-rule"}');
  });
});
