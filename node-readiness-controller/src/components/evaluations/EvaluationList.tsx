import {
  Link,
  ResourceListView,
  SectionBox,
  StatusLabel,
} from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import { Box, Tooltip, Typography } from '@mui/material';
import React, { useMemo } from 'react';
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

  const columns = useMemo(
    () => [
      {
        id: 'name',
        label: 'Name',
        getValue: (evalItem: NodeReadinessEvaluation) => evalItem.metadata?.name || '',
        render: (evalItem: NodeReadinessEvaluation) => {
          const name = evalItem.metadata?.name || '';
          const targetNode = evalItem.nodeName || name;
          const cluster = evalItem.cluster;
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
                    activeCluster={cluster}
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
                  activeCluster={cluster}
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
        filterVariant: 'select' as const,
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
        filterVariant: 'select' as const,
        filterSelectOptions: [
          { label: 'OK (All Satisfied)', value: 'OK' },
          { label: 'Not Ready', value: 'Not Ready' },
        ],
        getValue: (evalItem: NodeReadinessEvaluation) => {
          const summary = getEvaluationSummary(evalItem);
          if (summary.isPending || summary.total === 0) return 'Pending';
          return summary.satisfied === summary.total ? 'OK' : 'Not Ready';
        },
        render: (evalItem: NodeReadinessEvaluation) => {
          const summary = getEvaluationSummary(evalItem);
          return <StatusLabel status={summary.statusSeverity}>{summary.statusLabel}</StatusLabel>;
        },
      },
      'age' as const,
    ],
    []
  );

  if (evaluationsError) {
    const isForbidden =
      (evaluationsError as any)?.status === 403 ||
      (evaluationsError as any)?.code === 403 ||
      (evaluationsError as any)?.reason === 'Forbidden' ||
      String((evaluationsError as any)?.message || evaluationsError)
        .toLowerCase()
        .includes('forbidden');

    const isNotFound =
      (evaluationsError as any)?.status === 404 ||
      (evaluationsError as any)?.code === 404 ||
      (evaluationsError as any)?.reason === 'NotFound' ||
      String((evaluationsError as any)?.message || evaluationsError)
        .toLowerCase()
        .includes('not found') ||
      String((evaluationsError as any)?.message || evaluationsError).includes('404');

    if (isForbidden || isNotFound) {
      return (
        <SectionBox title="Node Readiness Evaluations">
          <CrdNotInstalled
            isForbidden={isForbidden}
            resourceName="NodeReadinessEvaluation"
            title={
              isForbidden
                ? 'Permission Denied: Cannot Read Node Readiness Evaluations'
                : 'NodeReadinessEvaluation CRD Not Installed'
            }
            description={
              isForbidden
                ? 'Your Kubernetes user or service account lacks read permissions for readiness.node.x-k8s.io/nodereadinessevaluations.'
                : 'NodeReadinessEvaluation CRDs are not installed on this cluster. This feature requires a release of Node Readiness Controller with NRE support enabled (v0.7.0+).'
            }
          />
        </SectionBox>
      );
    }
  }

  return (
    <ResourceListView
      title="Node Readiness Evaluations"
      data={evaluations}
      id="nrc-node-evaluations"
      headerProps={{ titleSideActions: [] }}
      enableRowActions={false}
      enableRowSelection={false}
      columns={columns}
    />
  );
}
