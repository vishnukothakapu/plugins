import { Grid } from '@mui/material';
import React from 'react';
import MetricCard from './MetricCard';

interface MetricCardsGridProps {
  /** Total number of NodeReadinessRule objects. */
  totalRules: number;
  /** Count of non-dry-run rules with at least one taint present. */
  rulesWithTaintsPresent: number;
  /** Count of rules with at least one failed node evaluation. */
  rulesWithEvaluationErrors: number;
  /** Count of rules where observedGeneration < metadata.generation. */
  reconcilingRules: number;
  /** Callback invoked when any metric card is clicked. */
  onCardClick: () => void;
}

/**
 * Grid of four metric summary cards providing fleet-wide rule statistics.
 */
export default function MetricCardsGrid({
  totalRules,
  rulesWithTaintsPresent,
  rulesWithEvaluationErrors,
  reconcilingRules,
  onCardClick,
}: MetricCardsGridProps) {
  return (
    <Grid container spacing={3} sx={{ mb: 4 }}>
      <Grid item xs={12} sm={6} md={3}>
        <MetricCard
          title="Total Rules"
          value={totalRules}
          caption="Active rule definitions"
          icon="mdi:shield-check-outline"
          activeColor="var(--mui-palette-primary-main, #1976d2)"
          onClick={onCardClick}
        />
      </Grid>

      <Grid item xs={12} sm={6} md={3}>
        <MetricCard
          title="Taints Present"
          value={rulesWithTaintsPresent}
          caption={
            reconcilingRules > 0
              ? `Rules applying taints (includes ${reconcilingRules} reconciling)`
              : 'Rules actively applying taints'
          }
          icon="mdi:tag-alert-outline"
          activeColor="#ed6c02"
          activeBorderColor="warning.main"
          onClick={onCardClick}
        />
      </Grid>

      <Grid item xs={12} sm={6} md={3}>
        <MetricCard
          title="Evaluation Errors"
          value={rulesWithEvaluationErrors}
          caption="Controller evaluation failures"
          icon="mdi:alert-circle-outline"
          activeColor="#d32f2f"
          activeBorderColor="error.main"
          onClick={onCardClick}
        />
      </Grid>

      <Grid item xs={12} sm={6} md={3}>
        <MetricCard
          title="Reconciling"
          value={reconcilingRules}
          caption="Pending controller status sync"
          icon="mdi:sync"
          activeColor="#0288d1"
          activeBorderColor="info.main"
          onClick={onCardClick}
          tooltip="Rules where spec was modified and controller has not yet updated status (observedGeneration < generation)"
        />
      </Grid>
    </Grid>
  );
}
