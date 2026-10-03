import { Icon } from '@iconify/react';
import { StatusLabel } from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import { Box, Button, Chip, Typography } from '@mui/material';
import React from 'react';

interface StatusHeaderProps {
  /** Total number of rules, displayed in the explore button label. */
  totalRules: number;
  /** Deployment object returned by useGet, or null if unavailable. */
  deployment: any;
  /** Error returned by the deployment useGet hook. */
  deploymentError: any;
  /** Callback invoked when the "Explore All Rules" button is clicked. */
  onExploreRules: () => void;
}

/**
 * Top header bar displaying the CRD API status, optional controller health badge,
 * and the "Explore All Rules" action button.
 */
export default function StatusHeader({
  totalRules,
  deployment,
  deploymentError,
  onExploreRules,
}: StatusHeaderProps) {
  return (
    <Box
      mb={3}
      display="flex"
      alignItems="center"
      justifyContent="space-between"
      flexWrap="wrap"
      gap={2}
    >
      <Box display="flex" alignItems="center" gap={1.5} flexWrap="wrap">
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
        <StatusLabel status="success">API Available</StatusLabel>
        <Chip
          label="readiness.node.x-k8s.io/v1alpha1"
          size="small"
          variant="outlined"
          sx={{
            fontSize: '0.75rem',
            height: 24,
            color: 'text.secondary',
            borderColor: 'divider',
          }}
        />
        {/* Controller Deployment Health: omitted if 403 / RBAC forbidden or not found */}
        {(() => {
          if (deploymentError || !deployment) {
            return null;
          }
          const isReady = (deployment.status?.readyReplicas ?? 0) > 0;
          return (
            <Box display="flex" alignItems="center" gap={1}>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  fontSize: '0.75rem',
                  ml: 1,
                }}
              >
                Controller:
              </Typography>
              <StatusLabel status={isReady ? 'success' : 'error'}>
                {isReady ? 'Running' : 'Stopped'}
              </StatusLabel>
            </Box>
          );
        })()}
      </Box>
      <Button
        variant="contained"
        color="primary"
        onClick={onExploreRules}
        startIcon={<Icon icon="mdi:format-list-checks" />}
        size="small"
      >
        Explore All Rules ({totalRules})
      </Button>
    </Box>
  );
}
