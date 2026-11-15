import { useTranslation } from '@kinvolk/headlamp-plugin/lib';
import {
  DateLabel,
  SectionBox,
  SimpleTable,
  StatusLabel,
} from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import { Typography } from '@mui/material';
import React from 'react';
import type { NodeReadinessEvaluationCondition } from '../../resources';

export interface EvaluationConditionsTableProps {
  /** Array of status observation conditions for this evaluation. */
  conditions?: NodeReadinessEvaluationCondition[];
}

/**
 * Renders observation lifecycle conditions (e.g., 'Evaluated', 'Available')
 * reported in status.conditions of a NodeReadinessEvaluation.
 */
export default function EvaluationConditionsTable({
  conditions = [],
}: EvaluationConditionsTableProps) {
  const { t } = useTranslation();

  if (conditions.length === 0) {
    return null;
  }

  return (
    <SectionBox title={t('Observation Conditions')}>
      <SimpleTable
        columns={[
          {
            label: t('Condition'),
            getter: (c: NodeReadinessEvaluationCondition) => c.type,
          },
          {
            label: t('Status'),
            getter: (c: NodeReadinessEvaluationCondition) => {
              const statusSeverity =
                c.status === 'True' ? 'success' : c.status === 'False' ? 'error' : 'warning';
              return <StatusLabel status={statusSeverity}>{c.status}</StatusLabel>;
            },
          },
          {
            label: t('Reason'),
            getter: (c: NodeReadinessEvaluationCondition) => c.reason || '—',
          },
          {
            label: t('Message'),
            getter: (c: NodeReadinessEvaluationCondition) => (
              <Typography variant="body2" color="text.secondary">
                {c.message || '—'}
              </Typography>
            ),
          },
          {
            label: t('Last Transition'),
            getter: (c: NodeReadinessEvaluationCondition) =>
              c.lastTransitionTime ? (
                <DateLabel date={c.lastTransitionTime} />
              ) : (
                <Typography variant="caption" color="text.secondary">
                  —
                </Typography>
              ),
          },
        ]}
        data={conditions}
        emptyMessage={t('No conditions recorded.')}
      />
    </SectionBox>
  );
}
