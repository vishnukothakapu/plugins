/**
 * Known leader election lease identifier for Node Readiness Controller.
 * Defined in cmd/main.go upstream.
 */
export const NRC_LEASE_NAME = 'ba65f13e.readiness.node.x-k8s.io';

/**
 * Standard namespaces where NRC is typically installed across Helm, Kustomize, and static manifests.
 */
export const NRC_COMMON_NAMESPACES = [
  'node-readiness-controller-system',
  'nrrcontroller-system',
  'nrr-system',
  'kube-system',
];

/**
 * Known deployment names and app.kubernetes.io/name labels used by NRC across
 * Helm, Kustomize, and static manifests.
 */
const NRC_KNOWN_NAMES = new Set([
  'node-readiness-controller',
  'nrrcontroller',
  'nrr-controller-manager',
  'node-readiness-controller-manager',
]);

/**
 * Controller health classification status.
 */
export type ControllerHealthStatus =
  | 'active-leader'
  | 'active-non-ha'
  | 'inactive'
  | 'not-detected'
  | 'loading'
  | 'forbidden';

/**
 * Evaluated health result adhering to Anurag Pathak's detection architecture:
 * provides { active, reason } plus UI badge metadata.
 */
export interface ControllerHealthResult {
  /** Boolean indicating whether controller is actively running */
  active: boolean;
  /** Explicit diagnostic reason describing detection verdict */
  reason: string;
  /** High-level operational status category */
  status: ControllerHealthStatus;
  /** Label for the UI StatusLabel badge */
  badgeLabel?: string;
  /** Severity/type for the StatusLabel */
  badgeStatus?: 'success' | 'warning' | 'error';
  /** Descriptive tooltip detailing why the status was determined */
  tooltip?: string;
  /** Detailed metadata about the detected instance */
  details?: {
    type: 'lease' | 'deployment';
    holderIdentity?: string;
    renewAgeSeconds?: number;
    deploymentName?: string;
    readyReplicas?: number;
  };
}

export interface GetControllerHealthOptions {
  /** Array of Lease resources returned by Lease.useList(), or null while loading */
  leases: any[] | null;
  /** Error object returned from Lease.useList(), if any */
  leaseError: any;
  /** Array of Deployment resources returned by Deployment.useList(), or null while loading */
  deployments: any[] | null;
  /** Error object returned from Deployment.useList(), if any */
  deploymentError: any;
  /** Current timestamp (epoch ms) to allow deterministic testing */
  now?: number;
}

/**
 * Evaluates controller health using Lease-based detection with Deployment fallback:
 * 1. Primary Check: Leader Election Lease (ba65f13e.readiness.node.x-k8s.io)
 *    - Grace window: (leaseDurationSeconds || 15) * 2
 *    - If alive: Active (Leader: ${holderIdentity})
 *    - If expired: Leader lease expired
 * 2. Fallback Check: Deployment Check (for non-HA mode where --leader-elect=false)
 *    - Query standard labels: 'app.kubernetes.io/name in (node-readiness-controller, nrrcontroller, nrr-controller-manager)'
 *    - Client-side verification: container image contains node-readiness-controller/nrrcontroller or command /manager
 *    - If readyReplicas > 0: Active (Deployment ready)
 *    - If readyReplicas === 0: Deployment has 0 ready replicas
 * 3. Graceful degradation when RBAC returns 403 Forbidden on both checks.
 * 4. Default: Controller presence could not be determined
 *
 * @param options Query results and optional clock timestamp.
 * @returns Evaluated ControllerHealthResult.
 */
export function getControllerHealth(options: GetControllerHealthOptions): ControllerHealthResult {
  const { leases, leaseError, deployments, deploymentError, now = Date.now() } = options;

  const leasesLoading = leases === null && !leaseError;
  const deploymentsLoading = deployments === null && !deploymentError;

  // 1. Primary Check: Leader Election Lease
  if (leases) {
    const nrcLease = leases.find(l => {
      const name = l.metadata?.name || l.jsonData?.metadata?.name;
      return name === NRC_LEASE_NAME;
    });

    if (nrcLease) {
      const spec = nrcLease.spec || nrcLease.jsonData?.spec;
      const renewTimeStr = spec?.renewTime || spec?.acquireTime;
      const holderIdentity = spec?.holderIdentity || 'Unknown Pod';

      if (renewTimeStr) {
        const renewTimeMs = new Date(renewTimeStr).getTime();
        const renewAgeSeconds = Math.round(Math.max(0, (now - renewTimeMs) / 1000));
        const leaseDurationMs = (spec?.leaseDurationSeconds || 15) * 2 * 1000;
        const isAlive = now - renewTimeMs < leaseDurationMs;

        if (isAlive) {
          const reason = `Active (Leader: ${holderIdentity})`;
          return {
            active: true,
            reason,
            status: 'active-leader',
            badgeLabel: 'Active (Leader)',
            badgeStatus: 'success',
            tooltip: `${reason} • Renewed ${renewAgeSeconds}s ago`,
            details: {
              type: 'lease',
              holderIdentity,
              renewAgeSeconds,
            },
          };
        } else {
          const reason = 'Leader lease expired';
          return {
            active: false,
            reason,
            status: 'inactive',
            badgeLabel: 'Inactive',
            badgeStatus: 'error',
            tooltip: `${reason} (${renewAgeSeconds}s ago, duration window ${Math.round(
              leaseDurationMs / 1000
            )}s)`,
            details: {
              type: 'lease',
              holderIdentity,
              renewAgeSeconds,
            },
          };
        }
      }
    }
  }

  // If lease check is still loading, wait before falling back
  if (leasesLoading) {
    return {
      active: false,
      reason: 'Loading controller status...',
      status: 'loading',
    };
  }

  // 2. Fallback Check: Deployment Check (e.g. non-HA or --leader-elect=false)
  if (deployments) {
    const matchingDeployment = deployments.find(d => {
      const name = d.metadata?.name || d.jsonData?.metadata?.name || '';
      const namespace = d.metadata?.namespace || d.jsonData?.metadata?.namespace || '';
      const appLabel = d.jsonData?.metadata?.labels?.['app.kubernetes.io/name'] || '';

      const isKnownLabelOrName = NRC_KNOWN_NAMES.has(appLabel) || NRC_KNOWN_NAMES.has(name);

      const containers =
        d.jsonData?.spec?.template?.spec?.containers || d.spec?.template?.spec?.containers || [];
      const hasContainerMatch = containers.some(
        (c: any) =>
          c.image?.includes('node-readiness-controller') ||
          c.image?.includes('nrrcontroller') ||
          c.image?.includes('nrr-controller')
      );

      const isInCommonNamespace = NRC_COMMON_NAMESPACES.includes(namespace);

      return isKnownLabelOrName || (isInCommonNamespace && hasContainerMatch);
    });

    if (matchingDeployment) {
      const readyReplicas =
        matchingDeployment.status?.readyReplicas ??
        matchingDeployment.jsonData?.status?.readyReplicas ??
        0;
      const deployName =
        matchingDeployment.metadata?.name ||
        matchingDeployment.jsonData?.metadata?.name ||
        'NRC Deployment';

      if (readyReplicas > 0) {
        const reason = 'Active (Deployment ready)';
        return {
          active: true,
          reason,
          status: 'active-non-ha',
          badgeLabel: 'Active (Non-HA)',
          badgeStatus: 'success',
          tooltip: `${reason}: ${deployName} (${readyReplicas} replica${
            readyReplicas > 1 ? 's' : ''
          })`,
          details: {
            type: 'deployment',
            deploymentName: deployName,
            readyReplicas,
          },
        };
      } else {
        const reason = 'Deployment has 0 ready replicas';
        return {
          active: false,
          reason,
          status: 'inactive',
          badgeLabel: 'Inactive',
          badgeStatus: 'error',
          tooltip: `${reason}: ${deployName}`,
          details: {
            type: 'deployment',
            deploymentName: deployName,
            readyReplicas: 0,
          },
        };
      }
    }
  }

  if (deploymentsLoading) {
    return {
      active: false,
      reason: 'Loading controller status...',
      status: 'loading',
    };
  }

  // 3. Graceful degradation when RBAC denies access
  const isLeaseForbidden = (leaseError as any)?.status === 403;
  const isDeployForbidden = (deploymentError as any)?.status === 403;
  if (isLeaseForbidden && (isDeployForbidden || deployments?.length === 0)) {
    return {
      active: false,
      reason: 'Access denied: RBAC restricts reading controller lease and deployment',
      status: 'forbidden',
    };
  }

  // 4. Default: Presence could not be determined
  const reason = 'Controller presence could not be determined';
  return {
    active: false,
    reason,
    status: 'not-detected',
    badgeLabel: 'Not Detected',
    badgeStatus: 'warning',
    tooltip: `${reason} (no active lease ba65f13e.readiness.node.x-k8s.io or deployment found)`,
  };
}

/**
 * Standalone helper implementing the exact signature from Anurag Pathak's template.
 */
export function detectControllerActive(options: GetControllerHealthOptions): {
  active: boolean;
  reason: string;
} {
  const result = getControllerHealth(options);
  return {
    active: result.active,
    reason: result.reason,
  };
}
