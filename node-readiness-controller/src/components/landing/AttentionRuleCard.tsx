import { Icon } from '@iconify/react';
import { Box, Card, CardContent, Chip, Typography } from '@mui/material';
import React from 'react';

interface AttentionRuleCardProps {
  /** Rule name displayed as the card title. */
  name: string;
  /** Whether the rule is in dry-run mode. */
  isDryRun: boolean;
  /** Number of failed node evaluations. */
  failedCount: number;
  /** Number of nodes with taint present (0 for dry-run rules). */
  taintsPresent: number;
  /** Whether the rule spec has been modified and is awaiting reconciliation. */
  isReconciling: boolean;
  /** Click handler (typically navigates to the rule detail view). */
  onClick: () => void;
}

/**
 * A compact card highlighting a single rule that requires operator attention.
 * The left border color signals the most severe issue (error > warning > info).
 */
export default function AttentionRuleCard({
  name,
  isDryRun,
  failedCount,
  taintsPresent,
  isReconciling,
  onClick,
}: AttentionRuleCardProps) {
  const hasFailed = failedCount > 0;

  const borderColor = hasFailed
    ? 'error.light'
    : taintsPresent > 0
    ? 'warning.light'
    : 'info.light';

  const accentColor = hasFailed ? 'error.main' : taintsPresent > 0 ? 'warning.main' : 'info.main';

  return (
    <Card
      elevation={0}
      sx={{
        border: '1px solid',
        borderColor,
        borderLeftWidth: 4,
        borderLeftColor: accentColor,
        cursor: 'pointer',
        '&:hover': { boxShadow: 2 },
      }}
      onClick={onClick}
    >
      <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography
            variant="subtitle1"
            sx={{
              fontWeight: 600,
              color: 'primary.main',
              '&:hover': { textDecoration: 'underline' },
            }}
          >
            {name}
          </Typography>
          {isDryRun && <Chip label="Dry Run" size="small" color="warning" variant="outlined" />}
        </Box>

        <Box mt={1} display="flex" flexDirection="column" gap={0.5}>
          {hasFailed && (
            <Box display="flex" alignItems="center" gap={0.5}>
              <Icon
                icon="mdi:alert-circle-outline"
                style={{ color: '#d32f2f', fontSize: '1rem' }}
              />
              <Typography variant="body2" color="error.main">
                {failedCount} node evaluation error{failedCount > 1 ? 's' : ''}
              </Typography>
            </Box>
          )}
          {taintsPresent > 0 && (
            <Box display="flex" alignItems="center" gap={0.5}>
              <Icon icon="mdi:tag-alert-outline" style={{ color: '#ed6c02', fontSize: '1rem' }} />
              <Typography variant="body2" color="warning.main">
                {taintsPresent} node{taintsPresent > 1 ? 's' : ''} with taint present
              </Typography>
            </Box>
          )}
          {isReconciling && (
            <Box display="flex" alignItems="center" gap={0.5}>
              <Icon icon="mdi:sync" style={{ color: '#0288d1', fontSize: '1rem' }} />
              <Typography variant="body2" color="info.main">
                Spec modified (reconciling)
              </Typography>
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
