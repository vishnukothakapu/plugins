import { describe, expect, it } from 'vitest';
import { detectControllerActive, getControllerHealth, NRC_LEASE_NAME } from './controllerHealth';

describe('controllerHealth', () => {
  const baseNow = new Date('2026-11-01T20:00:00Z').getTime();

  describe('Primary Check: Leader Election Lease', () => {
    it('returns Active (Leader) when lease is renewed within duration grace window', () => {
      const recentTime = new Date(baseNow - 10 * 1000).toISOString(); // 10s ago
      const leases = [
        {
          metadata: { name: NRC_LEASE_NAME, namespace: 'nrc-system' },
          spec: {
            holderIdentity: 'nrc-controller-pod-xyz',
            renewTime: recentTime,
            leaseDurationSeconds: 15,
          },
        },
      ];

      const result = getControllerHealth({
        leases,
        leaseError: null,
        deployments: null,
        deploymentError: null,
        now: baseNow,
      });

      expect(result.active).toBe(true);
      expect(result.reason).toBe('Active (Leader: nrc-controller-pod-xyz)');
      expect(result.status).toBe('active-leader');
      expect(result.badgeLabel).toBe('Active (Leader)');
      expect(result.badgeStatus).toBe('success');
      expect(result.tooltip).toContain('Leader: nrc-controller-pod-xyz');
      expect(result.tooltip).toContain('Renewed 10s ago');
      expect(result.details?.holderIdentity).toBe('nrc-controller-pod-xyz');
      expect(result.details?.renewAgeSeconds).toBe(10);

      // Verify detectControllerActive helper
      const detection = detectControllerActive({
        leases,
        leaseError: null,
        deployments: null,
        deploymentError: null,
        now: baseNow,
      });
      expect(detection.active).toBe(true);
      expect(detection.reason).toBe('Active (Leader: nrc-controller-pod-xyz)');
    });

    it('returns Inactive when leader lease renewal is older than duration grace window', () => {
      const staleTime = new Date(baseNow - 40 * 1000).toISOString(); // 40s ago (exceeds 15 * 2 = 30s)
      const leases = [
        {
          metadata: { name: NRC_LEASE_NAME, namespace: 'nrc-system' },
          spec: {
            holderIdentity: 'nrc-controller-pod-xyz',
            renewTime: staleTime,
            leaseDurationSeconds: 15,
          },
        },
      ];

      const result = getControllerHealth({
        leases,
        leaseError: null,
        deployments: [],
        deploymentError: null,
        now: baseNow,
      });

      expect(result.active).toBe(false);
      expect(result.reason).toBe('Leader lease expired');
      expect(result.status).toBe('inactive');
      expect(result.badgeLabel).toBe('Inactive');
      expect(result.badgeStatus).toBe('error');
      expect(result.tooltip).toContain('Leader lease expired');
      expect(result.tooltip).toContain('40s ago');
    });

    it('falls back to active non-HA deployment when leftover expired lease exists and controller uses --leader-elect=false', () => {
      const staleTime = new Date(baseNow - 40 * 1000).toISOString();
      const leases = [
        {
          metadata: { name: NRC_LEASE_NAME, namespace: 'nrc-system' },
          spec: {
            holderIdentity: 'nrc-controller-pod-xyz',
            renewTime: staleTime,
            leaseDurationSeconds: 15,
          },
        },
      ];
      const deployments = [
        {
          metadata: { name: 'nrc-non-ha', namespace: 'nrc-system' },
          spec: {
            replicas: 1,
            template: {
              spec: {
                containers: [
                  {
                    name: 'manager',
                    image: 'registry.k8s.io/node-readiness-controller:v0.1.0',
                    args: ['--leader-elect=false'],
                  },
                ],
              },
            },
          },
          status: { readyReplicas: 1 },
        },
      ];

      const result = getControllerHealth({
        leases,
        leaseError: null,
        deployments,
        deploymentError: null,
        now: baseNow,
      });

      expect(result.active).toBe(true);
      expect(result.reason).toBe('Active (Deployment ready)');
      expect(result.status).toBe('active-non-ha');
      expect(result.badgeLabel).toBe('Active (Non-HA)');
    });

    it('falls back to active non-HA deployment when leftover expired lease exists on default single-replica setup', () => {
      const staleTime = new Date(baseNow - 40 * 1000).toISOString();
      const leases = [
        {
          metadata: { name: NRC_LEASE_NAME, namespace: 'nrc-system' },
          spec: {
            holderIdentity: 'nrc-controller-pod-xyz',
            renewTime: staleTime,
            leaseDurationSeconds: 15,
          },
        },
      ];
      const deployments = [
        {
          metadata: { name: 'node-readiness-controller-manager', namespace: 'nrc-system' },
          spec: {
            replicas: 1,
            template: {
              spec: {
                containers: [
                  {
                    name: 'manager',
                    image: 'registry.k8s.io/node-readiness-controller:v0.1.0',
                  },
                ],
              },
            },
          },
          status: { readyReplicas: 1 },
        },
      ];

      const result = getControllerHealth({
        leases,
        leaseError: null,
        deployments,
        deploymentError: null,
        now: baseNow,
      });

      expect(result.active).toBe(true);
      expect(result.reason).toBe('Active (Deployment ready)');
      expect(result.status).toBe('active-non-ha');
    });

    it('does NOT treat standby HA replicas as active leader when an HA deployment lease expires', () => {
      const staleTime = new Date(baseNow - 40 * 1000).toISOString();
      const leases = [
        {
          metadata: { name: NRC_LEASE_NAME, namespace: 'nrc-system' },
          spec: {
            holderIdentity: 'nrc-controller-pod-xyz',
            renewTime: staleTime,
            leaseDurationSeconds: 15,
          },
        },
      ];
      const deployments = [
        {
          metadata: { name: 'nrc-ha-controller', namespace: 'nrc-system' },
          spec: {
            replicas: 3,
            template: {
              spec: {
                containers: [
                  {
                    name: 'manager',
                    image: 'registry.k8s.io/node-readiness-controller:v0.1.0',
                    args: ['--leader-elect=true'],
                  },
                ],
              },
            },
          },
          status: { readyReplicas: 2 },
        },
      ];

      const result = getControllerHealth({
        leases,
        leaseError: null,
        deployments,
        deploymentError: null,
        now: baseNow,
      });

      expect(result.active).toBe(false);
      expect(result.reason).toBe('Leader lease expired');
      expect(result.status).toBe('inactive');
      expect(result.badgeStatus).toBe('error');
    });

    it('falls back to acquireTime if renewTime is not yet populated on initial lease acquisition', () => {
      const acquireTime = new Date(baseNow - 5 * 1000).toISOString(); // 5s ago
      const leases = [
        {
          metadata: { name: NRC_LEASE_NAME },
          spec: {
            holderIdentity: 'nrc-fresh-pod',
            acquireTime,
            leaseDurationSeconds: 15,
          },
        },
      ];

      const result = getControllerHealth({
        leases,
        leaseError: null,
        deployments: null,
        deploymentError: null,
        now: baseNow,
      });

      expect(result.active).toBe(true);
      expect(result.reason).toBe('Active (Leader: nrc-fresh-pod)');
      expect(result.status).toBe('active-leader');
    });

    it('ignores leases belonging to other controllers and proceeds to fallback', () => {
      const leases = [
        {
          metadata: { name: 'kube-controller-manager' },
          spec: {
            holderIdentity: 'control-plane-1',
            renewTime: new Date(baseNow - 5 * 1000).toISOString(),
          },
        },
      ];

      const result = getControllerHealth({
        leases,
        leaseError: null,
        deployments: [],
        deploymentError: null,
        now: baseNow,
      });

      expect(result.active).toBe(false);
      expect(result.reason).toBe('Controller presence could not be determined');
      expect(result.status).toBe('not-detected');
      expect(result.badgeLabel).toBe('Not Detected');
    });
  });

  describe('Fallback Check: Deployments (Non-HA mode)', () => {
    it('detects active non-HA controller by container image with ready replicas', () => {
      const deployments = [
        {
          metadata: { name: 'node-readiness-controller-manager', namespace: 'nrc-system' },
          spec: {
            template: {
              spec: {
                containers: [
                  { name: 'manager', image: 'registry.k8s.io/node-readiness-controller:v0.1.0' },
                ],
              },
            },
          },
          status: { readyReplicas: 1 },
        },
      ];

      const result = getControllerHealth({
        leases: [],
        leaseError: null,
        deployments,
        deploymentError: null,
        now: baseNow,
      });

      expect(result.active).toBe(true);
      expect(result.reason).toBe('Active (Deployment ready)');
      expect(result.status).toBe('active-non-ha');
      expect(result.badgeLabel).toBe('Active (Non-HA)');
      expect(result.badgeStatus).toBe('success');
      expect(result.tooltip).toContain('Active (Deployment ready)');
      expect(result.tooltip).toContain('1 replica');
    });

    it('detects deployment matching nrrcontroller container image', () => {
      const deployments = [
        {
          metadata: { name: 'custom-operator-name', namespace: 'custom-ns' },
          spec: {
            template: {
              spec: {
                containers: [{ name: 'nrr', image: 'ghcr.io/nrrcontroller:latest' }],
              },
            },
          },
          status: { readyReplicas: 2 },
        },
      ];

      const result = getControllerHealth({
        leases: [],
        leaseError: null,
        deployments,
        deploymentError: null,
        now: baseNow,
      });

      expect(result.active).toBe(true);
      expect(result.reason).toBe('Active (Deployment ready)');
      expect(result.status).toBe('active-non-ha');
      expect(result.tooltip).toContain('2 replicas');
    });

    it('detects deployment matching command /manager', () => {
      const deployments = [
        {
          metadata: { name: 'nrc-custom-deploy', namespace: 'custom-system' },
          spec: {
            template: {
              spec: {
                containers: [
                  { name: 'controller', image: 'custom-repo/controller:v1', command: ['/manager'] },
                ],
              },
            },
          },
          status: { readyReplicas: 1 },
        },
      ];

      const result = getControllerHealth({
        leases: [],
        leaseError: null,
        deployments,
        deploymentError: null,
        now: baseNow,
      });

      expect(result.active).toBe(true);
      expect(result.reason).toBe('Active (Deployment ready)');
      expect(result.status).toBe('active-non-ha');
    });

    it('detects deployment matching container image string', () => {
      const deployments = [
        {
          metadata: { name: 'nrc-custom-deploy', namespace: 'nrr-system' },
          spec: {
            template: {
              spec: {
                containers: [
                  { name: 'manager', image: 'registry.k8s.io/node-readiness-controller:v0.1.0' },
                ],
              },
            },
          },
          status: { readyReplicas: 1 },
        },
      ];

      const result = getControllerHealth({
        leases: [],
        leaseError: null,
        deployments,
        deploymentError: null,
        now: baseNow,
      });

      expect(result.active).toBe(true);
      expect(result.reason).toBe('Active (Deployment ready)');
      expect(result.status).toBe('active-non-ha');
    });

    it('returns Inactive when matching deployment has 0 ready replicas', () => {
      const deployments = [
        {
          metadata: { name: 'node-readiness-controller-manager' },
          spec: {
            template: {
              spec: {
                containers: [
                  { name: 'manager', image: 'registry.k8s.io/node-readiness-controller:v0.1.0' },
                ],
              },
            },
          },
          status: { readyReplicas: 0 },
        },
      ];

      const result = getControllerHealth({
        leases: [],
        leaseError: null,
        deployments,
        deploymentError: null,
        now: baseNow,
      });

      expect(result.active).toBe(false);
      expect(result.reason).toBe('Deployment has 0 ready replicas');
      expect(result.status).toBe('inactive');
      expect(result.badgeLabel).toBe('Inactive');
      expect(result.badgeStatus).toBe('error');
      expect(result.tooltip).toContain('Deployment has 0 ready replicas');
    });
  });

  describe('RBAC 403 Forbidden handling', () => {
    it('returns forbidden status when both lease and deployment queries return 403 Forbidden', () => {
      const result = getControllerHealth({
        leases: null,
        leaseError: { status: 403 },
        deployments: null,
        deploymentError: { status: 403 },
        now: baseNow,
      });

      expect(result.active).toBe(false);
      expect(result.status).toBe('forbidden');
      expect(result.reason).toContain('RBAC restricts');
    });

    it('successfully falls back to deployments if lease query is forbidden (403) but deployments succeed', () => {
      const deployments = [
        {
          metadata: { name: 'node-readiness-controller-manager' },
          spec: {
            template: {
              spec: {
                containers: [
                  { name: 'manager', image: 'registry.k8s.io/node-readiness-controller:v0.1.0' },
                ],
              },
            },
          },
          status: { readyReplicas: 1 },
        },
      ];

      const result = getControllerHealth({
        leases: null,
        leaseError: { status: 403 },
        deployments,
        deploymentError: null,
        now: baseNow,
      });

      expect(result.active).toBe(true);
      expect(result.reason).toBe('Active (Deployment ready)');
      expect(result.status).toBe('active-non-ha');
    });

    it('retains forbidden status when lease query is 403 and deployment has leader election enabled', () => {
      const deployments = [
        {
          metadata: { name: 'node-readiness-controller-manager' },
          spec: {
            replicas: 3,
            template: {
              spec: {
                containers: [
                  {
                    name: 'manager',
                    image: 'registry.k8s.io/node-readiness-controller:v0.1.0',
                    args: ['--leader-elect=true'],
                  },
                ],
              },
            },
          },
          status: { readyReplicas: 3 },
        },
      ];

      const result = getControllerHealth({
        leases: null,
        leaseError: { status: 403 },
        deployments,
        deploymentError: null,
        now: baseNow,
      });

      expect(result.active).toBe(false);
      expect(result.status).toBe('forbidden');
      expect(result.reason).toContain('RBAC restricts reading controller lease');
    });

    it('reports Inactive when HA deployment is present but no leader lease exists in cluster', () => {
      const deployments = [
        {
          metadata: { name: 'node-readiness-controller-manager' },
          spec: {
            replicas: 2,
            template: {
              spec: {
                containers: [
                  {
                    name: 'manager',
                    image: 'registry.k8s.io/node-readiness-controller:v0.1.0',
                    args: ['--leader-elect=true'],
                  },
                ],
              },
            },
          },
          status: { readyReplicas: 2 },
        },
      ];

      const result = getControllerHealth({
        leases: [],
        leaseError: null,
        deployments,
        deploymentError: null,
        now: baseNow,
      });

      expect(result.active).toBe(false);
      expect(result.status).toBe('inactive');
      expect(result.reason).toContain('Leader lease not found');
    });
  });

  describe('Loading and Not Detected states', () => {
    it('returns loading status when leases are not yet loaded', () => {
      const result = getControllerHealth({
        leases: null,
        leaseError: null,
        deployments: null,
        deploymentError: null,
        now: baseNow,
      });

      expect(result.status).toBe('loading');
      expect(result.active).toBe(false);
    });

    it('returns loading status when leases are empty and deployments are still loading', () => {
      const result = getControllerHealth({
        leases: [],
        leaseError: null,
        deployments: null,
        deploymentError: null,
        now: baseNow,
      });

      expect(result.status).toBe('loading');
      expect(result.active).toBe(false);
    });

    it('returns Not Detected when neither lease nor deployment matches NRC', () => {
      const result = getControllerHealth({
        leases: [],
        leaseError: null,
        deployments: [
          {
            metadata: { name: 'coredns' },
            status: { readyReplicas: 2 },
          },
        ],
        deploymentError: null,
        now: baseNow,
      });

      expect(result.active).toBe(false);
      expect(result.reason).toBe('Controller presence could not be determined');
      expect(result.status).toBe('not-detected');
      expect(result.badgeLabel).toBe('Not Detected');
      expect(result.badgeStatus).toBe('warning');
    });
  });
});
