import { useTranslation } from '@kinvolk/headlamp-plugin/lib';
import {
  Link,
  SectionBox,
  SimpleTable,
  StatusLabel,
} from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import { Box, Chip, Tooltip, Typography } from '@mui/material';
import React from 'react';
import { NodeReadinessEvaluation, type RuleEvaluation } from '../../resources';
import { getEvaluationStateInfo, getEvaluationSummary, nrcRouteNames } from '../../utils';

export interface NodeReadinessExtensionProps {
  /** The Kubernetes Node resource passed by Headlamp's details view section processor. */
  node?: any;
}

/**
 * Node Details Extension component injected into Headlamp's native Node details view.
 * Sourced from the node's NodeReadinessEvaluation custom resource, providing inline visibility
 * into readiness lifecycle state, rule satisfaction, and active NRC taints gating the node.
 *
 * Conforms strictly to Design Doc §5.6:
 * - Silent Omission (null return) if NRE CRD is missing (404), forbidden (403), or node unmanaged.
 * - Summary Bar with State, Active Taints ('None' or outlined chips), and 'View Full Evaluation' CTA.
 * - Rules Table rendered using Headlamp's SimpleTable with columns: Rule Name, Enforcement Mode, Status, Taint, Reason.
 */
export default function NodeReadinessExtension({ node }: NodeReadinessExtensionProps) {
  const { t } = useTranslation();
  const nodeName =
    typeof node?.getName === 'function' ? node.getName() : node?.metadata?.name || '';

  // Silently omit if no valid node name can be determined
  if (!nodeName) {
    return null;
  }

  const [evaluation, evaluationError] = NodeReadinessEvaluation.useGet(nodeName);

  // Design Doc §5.6: Silently return null if NRE is missing (404), forbidden (403), or fails
  if (evaluationError || !evaluation) {
    return null;
  }

  const state = evaluation.state ?? evaluation.status?.state;
  const stateInfo = getEvaluationStateInfo(state);
  const summary = getEvaluationSummary(evaluation);
  const rules = evaluation.rules ?? evaluation.status?.rules ?? [];

  // Identify taints currently enforced by NRC rules on this node
  const activeTaints = rules
    .filter((r: RuleEvaluation) => r.taintStatus === 'Present' && r.taintKey)
    .map((r: RuleEvaluation) => `${r.taintKey}:${r.taintEffect || 'NoSchedule'}`);

  return (
    <SectionBox title={t('Node Readiness Lifecycle')}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Summary Bar */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 2,
            p: 2,
            borderRadius: 1,
            bgcolor: 'background.default',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
            {/* Readiness State */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                {t('State:')}
              </Typography>
              <StatusLabel status={stateInfo.severity}>
                {summary.isPending ? t('Evaluation in progress') : stateInfo.label}
              </StatusLabel>
            </Box>

            {/* Rules Status Ratio */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                {t('Rules Status:')}
              </Typography>
              <StatusLabel status={summary.statusSeverity}>{summary.statusLabel}</StatusLabel>
            </Box>

            {/* Active Taints */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                {t('Active Taints:')}
              </Typography>
              {activeTaints.length > 0 ? (
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {activeTaints.map(taint => (
                    <Chip
                      key={taint}
                      label={taint}
                      size="small"
                      color="warning"
                      variant="outlined"
                      tabIndex={0}
                      aria-label={`Active taint: ${taint}`}
                      sx={{ fontWeight: 600 }}
                    />
                  ))}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  {t('None')}
                </Typography>
              )}
            </Box>
          </Box>

          <Link
            routeName={nrcRouteNames.evaluationDetail}
            params={{ name: nodeName }}
            aria-label={`View full evaluation report for ${nodeName}`}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              px: 1.5,
              py: 0.5,
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'primary.main',
              color: 'primary.main',
              fontSize: '0.8125rem',
              fontWeight: 500,
              lineHeight: 1.75,
              textDecoration: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'background-color 250ms, border-color 250ms',
              '&:hover': {
                backgroundColor: 'action.hover',
                borderColor: 'primary.main',
                textDecoration: 'none',
              },
            }}
          >
            {t('View Full Evaluation')}
          </Link>
        </Box>

        {/* Rules Table conforming to Design Doc §5.6 */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 600 }}>
            {`${t('Readiness Rules')} (${rules.length})`}
          </Typography>

          <SimpleTable
            columns={[
              {
                label: t('Rule Name'),
                getter: (r: RuleEvaluation) => (
                  <Link
                    routeName={nrcRouteNames.ruleDetail}
                    params={{ name: r.ruleName }}
                    aria-label={`View rule details for ${r.ruleName}`}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {r.ruleName}
                    </Typography>
                  </Link>
                ),
              },
              {
                label: t('Enforcement Mode'),
                getter: (r: RuleEvaluation) => (
                  <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>
                    {r.enforcementMode || 'continuous'}
                  </Typography>
                ),
              },
              {
                label: t('Status'),
                getter: (r: RuleEvaluation) => {
                  const isSatisfied = r.ruleStatus === 'Satisfied' || r.status === 'Satisfied';
                  return (
                    <StatusLabel status={isSatisfied ? 'success' : 'warning'}>
                      {r.ruleStatus || (isSatisfied ? 'Satisfied' : 'Unsatisfied')}
                    </StatusLabel>
                  );
                },
              },
              {
                label: t('Taint'),
                getter: (r: RuleEvaluation) => {
                  const isPresent = r.taintStatus === 'Present';
                  const taintDesc = r.taintKey
                    ? `${r.taintKey}:${r.taintEffect || 'NoSchedule'}`
                    : undefined;
                  return isPresent ? (
                    <Chip
                      label={taintDesc || t('Taint Present')}
                      size="small"
                      color="warning"
                      variant="outlined"
                      tabIndex={0}
                      aria-label={`Taint active: ${taintDesc || 'Present'}`}
                    />
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      —
                    </Typography>
                  );
                },
              },
              {
                label: t('Reason'),
                getter: (r: RuleEvaluation) => {
                  const text = r.message || r.reason;
                  if (!text) {
                    return (
                      <Typography variant="caption" color="text.secondary">
                        —
                      </Typography>
                    );
                  }
                  return (
                    <Tooltip title={text} arrow>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        tabIndex={0}
                        aria-label={`Evaluation reason: ${text}`}
                        sx={{
                          maxWidth: '260px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          cursor: 'help',
                        }}
                      >
                        {text}
                      </Typography>
                    </Tooltip>
                  );
                },
              },
            ]}
            data={rules}
            emptyMessage={t('No readiness rules currently evaluated for this node.')}
          />
        </Box>
      </Box>
    </SectionBox>
  );
}
