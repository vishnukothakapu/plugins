import { useTranslation } from '@kinvolk/headlamp-plugin/lib';
import {
  DateLabel,
  Link,
  Resource,
  StatusLabel,
} from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import { Box, Chip } from '@mui/material';
import React from 'react';
import { useParams } from 'react-router-dom';
import { NodeReadinessEvaluation, type RuleEvaluation } from '../../resources';
import { getEvaluationStateInfo, getEvaluationSummary } from '../../utils';
import type { RuleDetailSectionItem } from '../rules/RuleDetails';
import EvaluationConditionsTable from './EvaluationConditionsTable';
import EvaluationRuleTable from './EvaluationRuleTable';

/**
 * Computes custom key-value detail sections for Headlamp's Resource.DetailsGrid,
 * including Target Node link, Readiness State, Rule satisfaction summary,
 * active NRC taints, and Last Evaluated timestamp.
 *
 * @param evaluation - The NodeReadinessEvaluation instance to extract sections for, or null if loading.
 * @returns Array of section name-value pairs for the details grid.
 */
export function getEvaluationDetailSections(
  evaluation: NodeReadinessEvaluation | null,
  t: (key: string) => string = k => k
): RuleDetailSectionItem[] {
  if (!evaluation) return [];

  const nodeName = evaluation.nodeName || evaluation.metadata?.name || '';
  const stateInfo = getEvaluationStateInfo(evaluation.state);
  const summary = getEvaluationSummary(evaluation);
  const rules = evaluation.rules;

  // Collect present taints from rule evaluations
  const presentTaints = rules
    .filter((r: RuleEvaluation) => r.taintStatus === 'Present' && r.taintKey)
    .map((r: RuleEvaluation) => `${r.taintKey}:${r.taintEffect || 'NoSchedule'}`);

  // Find latest evaluation timestamp
  const latestEvaluation = rules.reduce<string | undefined>((latest, r) => {
    const ts = r.lastEvaluatedAt;
    return !ts || (latest && Date.parse(latest) >= Date.parse(ts)) ? latest : ts;
  }, undefined);

  return [
    {
      name: t('Target Node'),
      value: (
        <Link
          routeName="node"
          params={{ name: nodeName }}
          aria-label={`View target Kubernetes node ${nodeName}`}
        >
          {`${t('View Node')} (${nodeName})`}
        </Link>
      ),
    },
    {
      name: t('Readiness State'),
      value: (
        <span aria-label={`Readiness State: ${stateInfo.label}`}>
          <StatusLabel status={stateInfo.severity}>{stateInfo.label}</StatusLabel>
        </span>
      ),
    },
    {
      name: t('Rules Progress'),
      value: (
        <Box
          sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}
          role="group"
          aria-label={`Rules progress: ${summary.satisfied} of ${summary.total} satisfied, ${summary.unsatisfied} unsatisfied`}
        >
          <Chip
            label={`${t('Total:')} ${summary.total}`}
            size="small"
            variant="outlined"
            tabIndex={0}
            aria-label={`Total rules: ${summary.total}`}
          />
          <Chip
            label={`${t('Satisfied:')} ${summary.satisfied}`}
            size="small"
            color="success"
            tabIndex={0}
            aria-label={`Satisfied rules: ${summary.satisfied}`}
          />
          <Chip
            label={`${t('Unsatisfied:')} ${summary.unsatisfied}`}
            size="small"
            color={summary.unsatisfied > 0 ? 'warning' : 'default'}
            tabIndex={0}
            aria-label={`Unsatisfied rules: ${summary.unsatisfied}`}
          />
        </Box>
      ),
    },
    {
      name: t('Active NRC Taints'),
      value:
        presentTaints.length > 0 ? (
          <Box
            sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}
            role="group"
            aria-label="Active NRC taints"
          >
            {presentTaints.map(taint => (
              <Chip
                key={taint}
                label={taint}
                size="small"
                color="warning"
                tabIndex={0}
                aria-label={`Active taint: ${taint}`}
              />
            ))}
          </Box>
        ) : (
          t('None')
        ),
    },
    {
      name: t('Last Evaluated At'),
      value: latestEvaluation ? <DateLabel date={latestEvaluation} /> : '—',
    },
  ];
}

/**
 * Detailed inspector view component for an individual NodeReadinessEvaluation resource.
 * Renders Headlamp's DetailsGrid with node linkage, overall readiness state,
 * rules summary, active taints, expandable rule evaluations, and observation conditions.
 *
 * @returns Rendered JSX DetailsGrid component.
 */
export default function EvaluationDetails() {
  const { t } = useTranslation();
  const { name } = useParams<{ name: string }>();

  return (
    <Resource.DetailsGrid
      resourceType={NodeReadinessEvaluation}
      name={name!}
      noDefaultActions
      withEvents
      extraInfo={(evaluation: NodeReadinessEvaluation | null) =>
        getEvaluationDetailSections(evaluation, t)
      }
      extraSections={(evaluation: NodeReadinessEvaluation | null) => {
        if (!evaluation) return [];
        const sections = [
          {
            id: 'nrc-evaluation-rules',
            section: <EvaluationRuleTable rules={evaluation.rules} />,
          },
        ];

        const conditions = evaluation.status?.conditions || [];
        if (conditions.length > 0) {
          sections.push({
            id: 'nrc-evaluation-conditions',
            section: <EvaluationConditionsTable conditions={conditions} />,
          });
        }

        return sections;
      }}
    />
  );
}
