import {
  registerDetailsViewSectionsProcessor,
  registerRoute,
  registerSidebarEntry,
} from '@kinvolk/headlamp-plugin/lib';
import React from 'react';
import { EvaluationDetails, EvaluationList } from './components/evaluations';
import { NodeReadinessExtension } from './components/node-extension';
import { RuleDetails, RuleList } from './components/rules';
import LandingPage from './LandingPage';
import { nrcRouteNames, nrcRoutePaths, nrcSidebarNames } from './utils';

export * from './components/evaluations';
export * from './components/node-extension';
export * from './components/rules';
export { default as LandingPage } from './LandingPage';
export * from './resources';
export * from './utils';

// Landing page is the main entry point
registerRoute({
  path: nrcRoutePaths.overview,
  component: () => <LandingPage />,
  exact: true,
  name: nrcRouteNames.overview,
  sidebar: nrcSidebarNames.overview,
});

// Rules list
registerRoute({
  path: nrcRoutePaths.rulesList,
  component: () => <RuleList />,
  exact: true,
  name: nrcRouteNames.rulesList,
  sidebar: nrcSidebarNames.rulesList,
});

// Rule details
registerRoute({
  path: nrcRoutePaths.ruleDetail,
  component: () => <RuleDetails />,
  exact: true,
  name: nrcRouteNames.ruleDetail,
  sidebar: nrcSidebarNames.rulesList,
});

// Node evaluations list
registerRoute({
  path: nrcRoutePaths.evaluationsList,
  component: () => <EvaluationList />,
  exact: true,
  name: nrcRouteNames.evaluationsList,
  sidebar: nrcSidebarNames.evaluationsList,
});

// Node evaluation details
registerRoute({
  path: nrcRoutePaths.evaluationDetail,
  component: () => <EvaluationDetails />,
  exact: true,
  name: nrcRouteNames.evaluationDetail,
  sidebar: nrcSidebarNames.evaluationsList,
});

// Node details extension: injects Node Readiness Lifecycle section into core Node details view
registerDetailsViewSectionsProcessor(function addNodeReadinessLifecycleSection(resource, sections) {
  if (resource?.kind === 'Node') {
    sections.push({
      id: 'nrc-node-readiness-lifecycle',
      section: <NodeReadinessExtension node={resource} />,
    });
  }
  return sections;
});

// Parent entry in sidebar
registerSidebarEntry({
  name: nrcSidebarNames.root,
  label: 'Node Readiness',
  icon: 'mdi:shield-check',
  url: nrcRoutePaths.overview,
});

// Overview child entry in sidebar
registerSidebarEntry({
  parent: nrcSidebarNames.root,
  name: nrcSidebarNames.overview,
  label: 'Overview',
  url: nrcRoutePaths.overview,
});

// Rules list child entry in sidebar
registerSidebarEntry({
  parent: nrcSidebarNames.root,
  name: nrcSidebarNames.rulesList,
  label: 'Readiness Rules',
  url: nrcRoutePaths.rulesList,
});

// Node evaluations child entry in sidebar
registerSidebarEntry({
  parent: nrcSidebarNames.root,
  name: nrcSidebarNames.evaluationsList,
  label: 'Node Evaluations',
  url: nrcRoutePaths.evaluationsList,
});
