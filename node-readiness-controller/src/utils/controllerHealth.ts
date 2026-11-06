/**
 * Known leader election lease identifier for Node Readiness Controller.
 * Defined in cmd/main.go upstream.
 */
export const NRC_LEASE_NAME = 'ba65f13e.readiness.node.x-k8s.io';

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

/**
 * Minimal structural typing for a Kubernetes Lease resource.
 */
export interface K8sLeaseResource {
  metadata?: {
    name?: string;
    namespace?: string;
    [key: string]: any;
  };
  spec?: {
    holderIdentity?: string;
    renewTime?: string;
    acquireTime?: string;
    leaseDurationSeconds?: number;
    leaseTransitions?: number;
    [key: string]: any;
  };
}

/**
 * Minimal structural typing for a Kubernetes Deployment resource.
 */
export interface K8sDeploymentResource {
  metadata?: {
    name?: string;
    namespace?: string;
    [key: string]: any;
  };
  spec?: {
    replicas?: number;
    template?: {
      spec?: {
        containers?: Array<{
          name?: string;
          image?: string;
          command?: string[];
          args?: string[];
          [key: string]: any;
        }>;
        [key: string]: any;
      };
    };
    [key: string]: any;
  };
  status?: {
    readyReplicas?: number;
    replicas?: number;
    [key: string]: any;
  };
}

/**
 * Minimal structural typing for an error object returned by Kubernetes client queries.
 */
export interface K8sApiError {
  status?: number;
  message?: string;
  [key: string]: any;
}

export interface GetControllerHealthOptions {
  /** Array of Lease resources returned by Lease.useList(), or null while loading */
  leases: K8sLeaseResource[] | null;
  /** Error object returned from Lease.useList(), if any */
  leaseError: K8sApiError | null;
  /** Array of Deployment resources returned by Deployment.useList(), or null while loading */
  deployments: K8sDeploymentResource[] | null;
  /** Error object returned from Deployment.useList(), if any */
  deploymentError: K8sApiError | null;
  /** Current timestamp (epoch ms) to allow deterministic testing */
  now?: number;
}

/**
 * Finds a deployment matching standard NRC container images or manager command.
 */
export function findMatchingNRCDeployment(
  deployments: K8sDeploymentResource[] | null
): K8sDeploymentResource | undefined {
  if (!deployments) return undefined;
  return deployments.find(d => {
    const containers = d.spec?.template?.spec?.containers || [];
    return containers.some(
      c =>
        c.image?.includes('node-readiness-controller') ||
        c.image?.includes('nrrcontroller') ||
        c.image?.includes('nrr-controller') ||
        c.command?.includes('/manager')
    );
  });
}

/**
 * Determines whether an NRC deployment is configured to run in non-HA mode (without leader election).
 * Checks if --leader-elect=false is explicitly set or if --leader-elect is absent on a single-replica deployment.
 */
export function isDeploymentExplicitlyNonHA(deployment: K8sDeploymentResource): boolean {
  const containers = deployment.spec?.template?.spec?.containers || [];
  const allFlags = containers.flatMap(c => (c.args || []).concat(c.command || []));

  const hasExplicitLeaderElectFalse = allFlags.some(
    arg => arg === '--leader-elect=false' || arg.startsWith('--leader-elect=false')
  );
  if (hasExplicitLeaderElectFalse) {
    return true;
  }

  const hasLeaderElectionFlag = allFlags.some(
    arg =>
      arg === '--leader-elect' ||
      arg === '--leader-elect=true' ||
      arg.startsWith('--leader-elect=true')
  );
  const replicas = deployment.spec?.replicas ?? 1;
  return !hasLeaderElectionFlag && replicas <= 1;
}

/**
 * Evaluates controller health using Lease-based detection with Deployment fallback:
 * 1. Primary Check: Leader Election Lease (ba65f13e.readiness.node.x-k8s.io)
 *    - Grace window: (leaseDurationSeconds || 15) * 2
 *    - If alive: Active (Leader: ${holderIdentity})
 *    - If expired: Fallback to explicitly non-HA deployment before declaring Inactive.
 *      Standby HA replicas are not treated as active leaders.
 * 2. Fallback Check: Deployment Check (for non-HA mode where --leader-elect=false)
 *    - Filtered by labelSelector: 'app.kubernetes.io/name in (node-readiness-controller, nrrcontroller, nrr-controller-manager)'
 *    - Secondary client-side verification: container image contains node-readiness-controller/nrrcontroller or command /manager
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

  const matchingDeployment = findMatchingNRCDeployment(deployments);
  const isNonHADeploy = matchingDeployment
    ? isDeploymentExplicitlyNonHA(matchingDeployment)
    : false;

  // 1. Primary Check: Leader Election Lease
  if (leases) {
    const nrcLease = leases.find(l => l.metadata?.name === NRC_LEASE_NAME);

    if (nrcLease) {
      const spec = nrcLease.spec;
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
        }

        // If lease is expired and deployments are still loading, wait before concluding
        if (deploymentsLoading) {
          return {
            active: false,
            reason: 'Loading controller status...',
            status: 'loading',
          };
        }

        // If an installation switched to non-HA (--leader-elect=false) leaving an expired lease behind,
        // allow the ready non-HA deployment to establish active health.
        // Standby HA replicas are NOT treated as proof of active leader.
        if (matchingDeployment && isNonHADeploy) {
          const readyReplicas = matchingDeployment.status?.readyReplicas ?? 0;
          const deployName = matchingDeployment.metadata?.name || 'NRC Deployment';

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
          }
        }

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

  // If lease check is still loading, wait before falling back
  if (leasesLoading) {
    return {
      active: false,
      reason: 'Loading controller status...',
      status: 'loading',
    };
  }

  // 2. Fallback Check: Deployment Check (when no lease exists or lease query was forbidden)
  if (matchingDeployment) {
    const readyReplicas = matchingDeployment.status?.readyReplicas ?? 0;
    const deployName = matchingDeployment.metadata?.name || 'NRC Deployment';

    if (isNonHADeploy) {
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

    // Leader election is enabled for this deployment.
    // If lease query returned 403, we cannot verify who holds leadership; readiness probes (healthz.Ping)
    // pass on standby replicas as well and do not establish leadership. Retain forbidden state.
    if (leaseError?.status === 403) {
      return {
        active: false,
        reason: 'Access denied: RBAC restricts reading controller lease to determine leader status',
        status: 'forbidden',
      };
    }

    // If lease query succeeded but no active lease was found for this HA deployment, report inactive.
    const reason = 'Leader lease not found for HA controller deployment';
    return {
      active: false,
      reason,
      status: 'inactive',
      badgeLabel: 'Inactive',
      badgeStatus: 'error',
      tooltip: `HA controller deployment (${deployName}) requires an active leader lease`,
      details: {
        type: 'deployment',
        deploymentName: deployName,
        readyReplicas,
      },
    };
  }

  if (deploymentsLoading) {
    return {
      active: false,
      reason: 'Loading controller status...',
      status: 'loading',
    };
  }

  // 3. Graceful degradation when RBAC denies access
  const isLeaseForbidden = leaseError?.status === 403;
  const isDeployForbidden = deploymentError?.status === 403;
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
