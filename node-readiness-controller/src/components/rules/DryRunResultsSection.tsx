import { useTranslation } from '@kinvolk/headlamp-plugin/lib';
import { Box, Chip, Typography } from '@mui/material';
import React from 'react';
import type { DryRunResults } from '../../resources';

/**
 * Props for the DryRunResultsSection component.
 */
export interface DryRunResultsSectionProps {
  /** Simulation outcome data from the rule status. */
  results?: DryRunResults;
  /** Count of node evaluation errors observed during simulation. */
  failed?: number;
}

/**
 * Renders a simulation results summary box detailing affected nodes, predicted taint
 * additions and removals, risky operation counts, and evaluation errors in dry-run mode.
 *
 * @param props - Component props containing simulation results and error counts.
 * @returns Rendered JSX simulation summary box or fallback pending indicator.
 */
export default function DryRunResultsSection({ results, failed = 0 }: DryRunResultsSectionProps) {
  const { t } = useTranslation();

  if (!results) {
    return <>{t('Pending simulation')}</>;
  }

  return (
    <Box>
      {results.summary && (
        <Typography variant="body2" gutterBottom>
          {results.summary}
        </Typography>
      )}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
        <Chip
          label={`${t('Affected Nodes:')} ${results.affectedNodes || 0}`}
          size="small"
          color="primary"
        />
        <Chip
          label={`${t('Taints To Add:')} ${results.taintsToAdd || 0}`}
          size="small"
          color="warning"
        />
        <Chip
          label={`${t('Taints To Remove:')} ${results.taintsToRemove || 0}`}
          size="small"
          color="success"
        />
        <Chip
          label={`${t('Risky Operations:')} ${results.riskyOperations || 0}`}
          size="small"
          color="error"
        />
        {failed > 0 && (
          <Chip label={`${t('Evaluation Errors:')} ${failed}`} size="small" color="error" />
        )}
      </Box>
    </Box>
  );
}
