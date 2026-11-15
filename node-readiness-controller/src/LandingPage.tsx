import { K8s, Router, useTranslation } from '@kinvolk/headlamp-plugin/lib';
import {
  EmptyContent,
  PageGrid,
  SectionBox,
  StatusLabel,
} from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import { Box, CircularProgress, Typography } from '@mui/material';
import React from 'react';
import { useHistory } from 'react-router-dom';
import { CrdNotInstalled } from './components/common';
import { MetricCardsGrid, RulesAttentionSection, StatusHeader } from './components/landing';
import { NodeReadinessRule } from './resources';
import {
  getControllerHealth,
  getRuleStats,
  isRuleReconciling,
  nrcRouteNames,
  nrcRoutePaths,
} from './utils';

/**
 * Landing Page component providing fleet-wide overview cards and health orientation.
 * Displays high-level summary cards for Total Rules, Rules with Taints Present,
 * Rules with Evaluation Errors, and Reconciling rules, as well as a list of rules needing attention.
 *
 * @returns Rendered JSX LandingPage component.
 */
export default function LandingPage() {
  const { t } = useTranslation();
  const [rules, rulesError] = NodeReadinessRule.useList();

  // 1. Primary controller health check: Query the leader election Lease object
  // directly by name (`ba65f13e.readiness.node.x-k8s.io`, defined in cmd/main.go upstream).
  // Using a fieldSelector allows a single targeted query across namespaces without fetching
  // unrelated cluster leases, verifying active heartbeat renewals against lease duration.
  const [leases, leaseError] = K8s.ResourceClasses.Lease.useList({
    fieldSelector: 'metadata.name=ba65f13e.readiness.node.x-k8s.io',
  });

  // 2. Fallback controller health check: Query deployments matching standard NRC app labels
  // (`app.kubernetes.io/name in (...)`) for non-HA setups where --leader-elect=false.
  // Using a labelSelector ensures we only retrieve potential controller deployments across
  // all namespaces rather than listing every cluster deployment. The returned deployments
  // undergo client-side container image and command verification in getControllerHealth
  // before checking replica readiness.
  const [deployments, deploymentError] = K8s.ResourceClasses.Deployment.useList({
    labelSelector:
      'app.kubernetes.io/name in (node-readiness-controller,nrrcontroller,nrr-controller-manager)',
  });
  const history = useHistory();

  // Periodically refresh current timestamp so lease expiry is re-evaluated even when watch streams are idle
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, []);

  const controllerHealth = getControllerHealth({
    leases,
    leaseError,
    deployments,
    deploymentError,
    now,
  });

  if (rulesError) {
    const isForbidden = (rulesError as any)?.status === 403;
    const isNotFound = (rulesError as any)?.status === 404;

    if (!isForbidden && !isNotFound) {
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
              <StatusLabel status="error">API Unavailable</StatusLabel>
            </Box>
            <Box m={4}>
              <EmptyContent color="error">
                <Typography variant="h6">Unable to load Node Readiness Rules</Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {String(
                    (rulesError as any)?.message ||
                      'The request failed. Please check your connection and try again.'
                  )}
                </Typography>
              </EmptyContent>
            </Box>
          </SectionBox>
        </PageGrid>
      );
    }

    return (
      <PageGrid>
        <SectionBox title={t('Node Readiness Controller')}>
          <Box mb={2} display="flex" alignItems="center" gap={1.5}>
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
              {t('API Status:')}
            </Typography>
            <StatusLabel status={isForbidden ? 'warning' : 'error'}>
              {isForbidden ? t('Permission Denied') : t('Not Installed')}
            </StatusLabel>
          </Box>
          <CrdNotInstalled
            isForbidden={isForbidden}
            title={
              isForbidden
                ? t('Permission Denied: Cannot Read Node Readiness Rules')
                : t('Node Readiness Controller CRDs not installed')
            }
            description={
              isForbidden
                ? t(
                    'Your Kubernetes user or service account lacks read permissions for readiness.node.x-k8s.io/nodereadinessrules.'
                  )
                : t(
                    'Please refer to the Node Readiness Controller installation documentation to set up CRDs.'
                  )
            }
          />
        </SectionBox>
      </PageGrid>
    );
  }

  if (rules === null) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
        <CircularProgress />
        <Typography variant="h6" sx={{ ml: 2, color: 'text.secondary' }}>
          {t('Loading Node Readiness Rules...')}
        </Typography>
      </Box>
    );
  }

  // 1. Total Rules: In-memory count of fetched NodeReadinessRule objects
  const totalRules = rules.length;

  // 2. Rules with Taints Present:
  // Count of non-dry-run rules where at least one node evaluation currently reports taintStatus === 'Present'.
  // Rules with spec.dryRun: true are strictly excluded because they do not actively enforce or apply taints.
  const rulesWithTaintsPresent = rules.filter(rule => {
    const stats = getRuleStats(rule);
    return !stats.isDryRun && typeof stats.unsatisfied === 'number' && stats.unsatisfied > 0;
  }).length;

  // 3. Rules with Evaluation Errors:
  // Count of rules where failedNodes is not empty (applies to both live and dry-run rules).
  const rulesWithEvaluationErrors = rules.filter(rule => getRuleStats(rule).failed > 0).length;

  // 4. Stale/Reconciling count:
  const reconcilingRules = rules.filter(isRuleReconciling).length;

  // Rules Requiring Attention
  const rulesNeedingAttention = rules.filter(rule => {
    const stats = getRuleStats(rule);
    const hasTaintPresent =
      !stats.isDryRun && typeof stats.unsatisfied === 'number' && stats.unsatisfied > 0;
    const hasEvaluationErrors = stats.failed > 0;
    const isReconciling = isRuleReconciling(rule);

    return hasEvaluationErrors || hasTaintPresent || isReconciling;
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
      <SectionBox title={t('Node Readiness Controller')}>
        <StatusHeader
          totalRules={totalRules}
          controllerHealth={controllerHealth}
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
