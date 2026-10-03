import { K8s, Router } from '@kinvolk/headlamp-plugin/lib';
import {
  EmptyContent,
  PageGrid,
  SectionBox,
  StatusLabel,
} from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import { Box, CircularProgress, Link, Typography } from '@mui/material';
import React from 'react';
import { useHistory } from 'react-router-dom';
import { MetricCardsGrid, RulesAttentionSection, StatusHeader } from './components/landing';
import { NodeReadinessRule } from './resources';
import { nrcRouteNames, nrcRoutePaths } from './utils';

/**
 * Landing Page component providing fleet-wide overview cards and health orientation.
 * Displays high-level summary cards for Total Rules, Rules with Taints Present,
 * Rules with Evaluation Errors, and Reconciling rules, as well as a list of rules needing attention.
 *
 * @returns Rendered JSX LandingPage component.
 */
export default function LandingPage() {
  const [rules, rulesError] = NodeReadinessRule.useList();
  const [deployment, deploymentError] = K8s.ResourceClasses.Deployment.useGet(
    'node-readiness-controller-manager',
    'node-readiness-controller-system'
  );
  const history = useHistory();

  if (rulesError) {
    const isForbidden = (rulesError as any)?.status === 403;
    return (
      <PageGrid>
        <SectionBox title="Node Readiness Controller">
          <Box mb={3} display="flex" alignItems="center" gap={1.5}>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                fontSize: '0.75rem',
              }}
            >
              API Status:
            </Typography>
            <StatusLabel status={isForbidden ? 'warning' : 'error'}>
              {isForbidden ? 'Permission Denied' : 'Not Installed'}
            </StatusLabel>
          </Box>
          <Box m={4}>
            <EmptyContent color="error">
              <Typography variant="h6">
                {isForbidden
                  ? 'Permission Denied: Cannot Read Node Readiness Rules'
                  : 'Node Readiness Controller CRDs not installed'}
              </Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>
                {isForbidden ? (
                  'Your Kubernetes user or service account lacks read permissions for readiness.node.x-k8s.io/nodereadinessrules.'
                ) : (
                  <Link
                    href="https://node-readiness-controller.sigs.k8s.io/getting-started/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Please refer to the Node Readiness Controller installation documentation to set
                    up CRDs.
                  </Link>
                )}
              </Typography>
            </EmptyContent>
          </Box>
        </SectionBox>
      </PageGrid>
    );
  }

  if (rules === null) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
        <CircularProgress />
        <Typography variant="h6" sx={{ ml: 2, color: 'text.secondary' }}>
          Loading Node Readiness Rules...
        </Typography>
      </Box>
    );
  }

  // 1. Total Rules: In-memory count of fetched NodeReadinessRule objects
  const totalRules = rules.length;

  // 2. Rules with Taints Present:
  // Count of non-dry-run rules (spec.dryRun !== true) where at least one node evaluation currently reports taintStatus === 'Present'.
  // Rules with spec.dryRun: true are strictly excluded because they do not actively enforce or apply taints.
  const rulesWithTaintsPresent = rules.filter(rule => {
    if (rule.spec?.dryRun === true) return false;
    const evals = rule.status?.nodeEvaluations || [];
    return evals.some(ev => ev.taintStatus === 'Present');
  }).length;

  // 3. Rules with Evaluation Errors:
  // Count of rules where failedNodes is not empty (applies to both live and dry-run rules).
  const rulesWithEvaluationErrors = rules.filter(rule => {
    const failed = rule.status?.failedNodes || [];
    return failed.length > 0;
  }).length;

  // 4. Stale/Reconciling count:
  const reconcilingRules = rules.filter(rule => {
    const gen = rule.jsonData?.metadata?.generation;
    const obsGen = rule.status?.observedGeneration;
    return gen !== undefined && obsGen !== undefined && obsGen < gen;
  }).length;

  // Rules Requiring Attention
  const rulesNeedingAttention = rules.filter(rule => {
    const failed = rule.status?.failedNodes || [];
    const evals = rule.status?.nodeEvaluations || [];
    const gen = rule.jsonData?.metadata?.generation;
    const obsGen = rule.status?.observedGeneration;

    const hasFailedNodes = failed.length > 0;
    const hasTaintPresent =
      rule.spec?.dryRun !== true && evals.some(e => e.taintStatus === 'Present');
    const isReconciling = gen !== undefined && obsGen !== undefined && obsGen < gen;

    return hasFailedNodes || hasTaintPresent || isReconciling;
  });

  const handleExploreRules = () => {
    try {
      const url = Router?.createRouteURL?.(nrcRouteNames.rulesList);
      if (url) {
        history.push(url);
        return;
      }
    } catch {
      // fallback
    }
    history.push(nrcRoutePaths.rulesList);
  };

  const handleRuleClick = (ruleName: string) => {
    try {
      const url = Router?.createRouteURL?.(nrcRouteNames.ruleDetail, { name: ruleName });
      if (url) {
        history.push(url);
        return;
      }
    } catch {
      // fallback
    }
    history.push(`/nrc/rules/${encodeURIComponent(ruleName)}`);
  };

  return (
    <PageGrid>
      <SectionBox title="Node Readiness Controller">
        <StatusHeader
          totalRules={totalRules}
          deployment={deployment}
          deploymentError={deploymentError}
          onExploreRules={handleExploreRules}
        />

        <MetricCardsGrid
          totalRules={totalRules}
          rulesWithTaintsPresent={rulesWithTaintsPresent}
          rulesWithEvaluationErrors={rulesWithEvaluationErrors}
          reconcilingRules={reconcilingRules}
          onCardClick={handleExploreRules}
        />

        <RulesAttentionSection
          totalRules={totalRules}
          rulesNeedingAttention={rulesNeedingAttention}
          onRuleClick={handleRuleClick}
        />
      </SectionBox>
    </PageGrid>
  );
}
