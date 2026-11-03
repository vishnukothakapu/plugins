import {
  Link,
  ResourceListView,
  SectionBox,
  StatusLabel,
} from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import { Box, Tooltip, Typography } from '@mui/material';
import React from 'react';
import { NodeReadinessEvaluation } from '../../resources';
import { getEvaluationStateInfo, getEvaluationSummary, nrcRouteNames } from '../../utils';
import { CrdNotInstalled } from '../common';

/**
 * Cluster-level list view component displaying all NodeReadinessEvaluation custom resources.
 * Renders a canonical Headlamp ResourceListView table showing node name, overall readiness state,
 * rule satisfaction ratio, and creation age, conforming to Design Doc §5.4.
 *
 * @returns Rendered JSX ResourceListView component.
 */
export default function EvaluationList() {
  const [evaluations, evaluationsError] = NodeReadinessEvaluation.useList();

  if (evaluationsError) {
    const isForbidden = (evaluationsError as any)?.status === 403;
    const isNotFound = (evaluationsError as any)?.status === 404;

    if (isForbidden || isNotFound) {
      return (
        <SectionBox title="Node Readiness Evaluations">
          <CrdNotInstalled isForbidden={isForbidden} resourceName="NodeReadinessEvaluation" />
        </SectionBox>
      );
    }
  }

  return (
    <ResourceListView
      title="Node Readiness Evaluations"
      data={evaluations}
      errorMessage={
        evaluationsError
          ? String((evaluationsError as any)?.message || evaluationsError)
          : undefined
      }
      id="nrc-node-evaluations"
      headerProps={{ titleSideActions: [] }}
      enableRowActions={false}
      enableRowSelection={false}
      columns={[
        {
          id: 'name',
          label: 'Name',
          getValue: (evalItem: NodeReadinessEvaluation) => evalItem.metadata?.name || '',
          render: (evalItem: NodeReadinessEvaluation) => {
            const name = evalItem.metadata?.name || '';
            const targetNode = evalItem.nodeName || name;
            return (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <Tooltip title={name}>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 'bold',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '220px',
                    }}
                  >
                    <Link
                      routeName={nrcRouteNames.evaluationDetail}
                      params={{ name }}
                      aria-label={`View readiness evaluation for ${name}`}
                    >
                      {name}
                    </Link>
                  </Typography>
                </Tooltip>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25 }}>
                  <Link
                    routeName="node"
                    params={{ name: targetNode }}
                    aria-label={`View Kubernetes node ${targetNode}`}
                  >
                    View Node ({targetNode})
                  </Link>
                </Typography>
              </Box>
            );
          },
        },
        {
          id: 'state',
          label: 'State',
          filterVariant: 'select',
          filterSelectOptions: [
            { label: 'Available', value: 'Available' },
            { label: 'NotAvailable', value: 'NotAvailable' },
          ],
          getValue: (evalItem: NodeReadinessEvaluation) => evalItem.state || 'Pending',
          render: (evalItem: NodeReadinessEvaluation) => {
            const stateInfo = getEvaluationStateInfo(evalItem.state);
            return <StatusLabel status={stateInfo.severity}>{stateInfo.label}</StatusLabel>;
          },
        },
        {
          id: 'rulesStatus',
          label: 'Rules Status',
          filterVariant: 'select',
          filterSelectOptions: [
            { label: 'OK (All Satisfied)', value: 'OK' },
            { label: 'Not Ready', value: 'Not Ready' },
          ],
          getValue: (evalItem: NodeReadinessEvaluation) =>
            getEvaluationSummary(evalItem).statusLabel,
          render: (evalItem: NodeReadinessEvaluation) => {
            const summary = getEvaluationSummary(evalItem);
            return <StatusLabel status={summary.statusSeverity}>{summary.statusLabel}</StatusLabel>;
          },
        },
        'age',
      ]}
    />
  );
}
