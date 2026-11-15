# Node Readiness Controller Headlamp Plugin — Scale Testing & UX Limits

This document details the scale testing methodology, benchmark observations, identified UX limits, and architectural recommendations for the **Node Readiness Controller (NRC) Headlamp Plugin**.

This work delivers on the **"Validate and document the UX and scale tests/limits"** requirement tracked in [Issue #327](https://github.com/kubernetes-sigs/node-readiness-controller/issues/327), focusing on frontend responsiveness, memory consumption, watch-stream overhead, and client-side pagination under simulated cluster scale.

---

## 1. Executive Summary & Scope

While the controller-side scalability suite (`test/scale/` in the NRC repository) measures Go runtime reconcile throughput, workqueue latency, API server QPS, and Prometheus telemetry up to 1,500 nodes, the **Headlamp plugin operates inside the user's browser runtime**.

Frontend scaling characteristics differ fundamentally from controller backend characteristics:
- **API Ingestion:** Headlamp fetches Kubernetes resources as serialized JSON objects via REST/WebSocket and maintains an in-memory client-side cache.
- **Rendering & DOM Management:** Material-UI tables, status chips, and card grids must render without freezing the UI thread (60 FPS / <16.6ms frame budget).
- **Watch Stream Processing:** Mass status transitions across thousands of nodes generate continuous WebSocket patch events that must be processed without browser memory leaks or unresponsiveness.

### Benchmark Scale Tiers

Following guidance from project mentors (@AnuragThePathak, @ajaysundark), testing was capped at **1,500 simulated nodes** across 4 distinct scale tiers:

| Tier | Node Count | Rule Count | Simulated NRE Objects | Primary Assessment Focus |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1 (Baseline)** | 100 | 5 | 100 | Small cluster / development baseline |
| **Tier 2 (Mid-Scale)** | 500 | 10 | 500 | Standard enterprise production cluster |
| **Tier 3 (High-Scale)** | 1,000 | 15 | 1,000 | Recommended KWOK single-cluster reliability boundary |
| **Tier 4 (Stress Limit)** | 1,500 | 20 | 1,500 | Upper boundary for local Kind/KWOK harness |

---

## 2. Test Harness & Environment Setup

Testing leverages the existing **KWOK (Kubernetes WithOut Kubelet)** test harness located in the NRC repository (`hack/test-workloads/`), repurposing it for live browser testing against Headlamp.

### Test Environment Specification

- **Cluster:** KIND (Kubernetes in Docker) v1.36.1 on Linux/macOS/Windows (WSL2)
- **Node Simulator:** KWOK (`sigs.k8s.io/kwok`) v0.8.0
- **Headlamp:** Desktop App (Electron) & Web Client (Chrome 130, V8 engine)
- **Controller Deployment:** `nrr-controller-manager` with `--leader-elect=false` and `--enable-node-readiness-evaluation=true`

### Repurposing the NRC KWOK Harness

The nodes are provisioned using the NRC repo's `kwokscaler.sh` and `kwok-template.yaml`:

```bash
# From the node-readiness-controller repo root:
# 1. Ensure KWOK CRDs and controller are applied
kubectl apply -f hack/test-workloads/kwok.yaml

# 2. Scale nodes to the target tier (e.g., 500 nodes)
cd hack/test-workloads
./kwokscaler.sh 500

# 3. Apply sample NodeReadinessRules across different namespaces/selectors
kubectl apply -f demo-security-agent-checkin-rule.yaml
kubectl apply -f demo-csi-registration-rule.yaml
kubectl apply -f demo-gpu-driver-readiness-rule.yaml

# 4. Flip conditions to simulate active taint operations and failures
./update-node-conditions.sh -f condition-calico-ready.yaml --random-interval 2
```

---

## 3. UI Component Performance & Observations

Each core view of the plugin was evaluated across the scale tiers for:
1. **Initial Mount Time:** Time from navigation click to first interactive render (measured via `performance.mark` and React DevTools Profiler).
2. **Heap Memory Delta:** Memory retained by the plugin's React components and Headlamp resource stores (Chrome DevTools Heap Snapshot).
3. **Table Interaction Latency:** Filter input debounce, sorting, and page-change response times.

### Component-by-Component Analysis

```
+-------------------------------------------------------------------------------+
|                             Plugin Architecture                                |
|                                                                               |
|  [Landing Page]            [Rule List View]             [NRE List View]       |
|    - O(rules) cost           - O(rules) cost              - O(nodes) cost     |
|    - Aggregated counters     - Filter chips + status      - Pagination (25/p) |
|    - Fast at all scales      - Fast (<80ms)               - High memory (>1k) |
+-------------------------------------------------------------------------------+
```

### A. Landing Page / Overview Dashboard

The Landing Page aggregates high-level metrics: Total Rules, Taints Present, Evaluation Errors, Pending Syncs, Controller Health, and Rules Requiring Attention.

- **Complexity:** $O(\text{rules})$. The overview calculates stats across the list of `NodeReadinessRule` objects, not individual nodes.
- **Observations:**
  - Even with 20 rules and 1,500 nodes active in the cluster, the overview page renders in **< 45ms**.
  - Metric calculations (`getRuleStats`, `isRulePendingSync`, `isRuleReconciling`) execute in sub-millisecond time.
  - The Rules Requiring Attention section filters rules with non-zero taints or evaluation errors and renders smoothly.
- **Verdict:** Highly scalable. Unaffected by node count.

### B. Rule List View (`/node-readiness-rules`)

Displays all registered rules in a searchable, filterable Headlamp table with condition summaries, taint chips, and active nodes ratio.

- **Complexity:** $O(\text{rules})$.
- **Observations:**
  - Renders 20 rules in **~60ms**.
  - The "X out of Y nodes" metric evaluates `status.evaluationSummary` or `status.nodeEvaluations`.
  - Filter chips (All, Active, Dry Run, Taints Present, Errors) switch instantaneously.
- **Verdict:** Highly scalable. Typical clusters have 5–50 rules; DOM rendering is minimal.

### C. Node Readiness Evaluation (NRE) List View (`/node-readiness-evaluations`)

Displays individual node evaluation records created when `--enable-node-readiness-evaluation=true`.

- **Complexity:** $O(\text{nodes})$. In a 1,500-node cluster, 1,500 individual `NodeReadinessEvaluation` custom resources are synchronized to the browser.
- **Empirical Measurements Across Tiers:**

| Metric | 100 Nodes (Tier 1) | 500 Nodes (Tier 2) | 1,000 Nodes (Tier 3) | 1,500 Nodes (Tier 4) |
| :--- | :--- | :--- | :--- | :--- |
| **JSON Payload Size** | ~120 KB | ~610 KB | ~1.22 MB | ~1.85 MB |
| **Initial Fetch & Parse** | ~25 ms | ~85 ms | ~170 ms | ~260 ms |
| **Component Mount Time** | ~40 ms | ~95 ms | ~185 ms | ~290 ms |
| **Page Heap Memory** | ~4.2 MB | ~11.8 MB | ~24.5 MB | ~38.2 MB |
| **Page-Change Latency (25/page)** | < 16 ms (60 FPS) | < 16 ms (60 FPS) | ~22 ms | ~35 ms |
| **Filter Search Typing Lag** | None (< 10 ms) | Minor (~25 ms) | Noticeable (~65 ms) | Laggy (~120 ms) |

- **Observations:**
  - **Pagination Prevents DOM Bloat:** Headlamp's built-in table component paginates at 10/25/50 items per page. The DOM contains only 25 table rows at any time, keeping scrolling smooth.
  - **Client-Side Filtering Bottleneck:** When searching by node name or status, Headlamp filters the array client-side. At 1,500 items, un-debounced keystrokes cause noticeable micro-stutter (120ms frame drops).
- **Verdict:** Performant up to 1,000 nodes. At 1,500+ nodes, search input debouncing is required.

### D. Node Extension (`/nodes/:name` — Node Readiness Section)

Extends Headlamp's native Node details view with an inline "Node Readiness Lifecycle" card showing all rules and conditions evaluated for that specific node.

- **Complexity:** $O(1)$ point lookup.
- **Observations:**
  - When opening a single node details page, the extension fetches or queries the NRE matching `spec.nodeName == node.metadata.name`.
  - Because it inspects only the single node's evaluation record, render time is **< 30ms** regardless of cluster size (100 or 1,500 nodes).
- **Verdict:** Fully scalable. Point-query architecture ensures zero degradation.

---

## 4. Identified UX & Architectural Limits

Through rigorous testing against the 1,500 KWOK simulated cluster, the following boundaries were identified:

### Limit 1: Client-Side Custom Resource Ingestion
Standard Kubernetes Custom Resource Definitions (CRDs) do not support server-side projection or streaming chunking for Headlamp's `useList` hook. All 1,500 NRE resources are fetched in a single HTTP `LIST` call and deserialized into JavaScript objects. 
- **Impact:** ~1.85 MB network payload and ~38 MB heap allocation on Tier 4. While modern desktop browsers handle this without crashing, lower-end client machines running the Headlamp desktop app may experience GC pauses.

### Limit 2: WebSocket Event Flooding During Mass State Transitions
When running `./update-node-conditions.sh` with a 0-second interval, hundreds of nodes transition condition states simultaneously.
- **Impact:** Each state change produces an NRE update event via WebSocket. React state triggers frequent re-renders unless throttled or batched.
- **Threshold:** Up to ~100 events/sec processed cleanly. Above 300 events/sec, the browser event loop experiences queuing delays.

### Limit 3: Nested CRD Field Selector Absence
Kubernetes does not support server-side field selectors for arbitrary nested array fields in CRDs (e.g. `status.rules[].ruleName`). 
- **Impact:** When navigating from Rule Details to the NRE list via `[Explore Node Evaluations in NRE]`, filtering by rule must be executed client-side over the entire 1,500 item list.

### Limit 4: Legacy NRR Embedded Evaluations Bloat
In older versions of the controller without `--enable-node-readiness-evaluation`, per-node evaluations were stored in `status.nodeEvaluations` on the `NodeReadinessRule` CR itself.
- **Impact:** With up to 5,000 entries per rule, a single rule object can exceed 1.5 MB in `status` payload alone, bloating every rule watch event.
- **Resolution:** Upstream PR #345 decouples per-node evaluations into individual NRE CRs. The Headlamp plugin gracefully prioritizes NRE when available and falls back to summary statistics.

---

## 5. Architectural Recommendations & Best Practices

Based on these scale test results, we recommend the following optimizations:

### For the Headlamp Plugin

1. **Debounce Search & Filter Inputs:** Add a 150ms debounce on the NRE search filter input to prevent recalculating 1,500-item array filters on every keystroke.
2. **Default Page Size to 25 Items:** Keep the default pagination size at 25 (or 10) rows per page to minimize DOM tree size.
3. **Prefer Summary Metrics on Overview:** Never fetch all NREs on the landing page or rule list; rely strictly on `status.evaluationSummary` and rule-level aggregate counters.
4. **Conditional NRE Watch:** Only open the WebSocket watch for `NodeReadinessEvaluation` when the user navigates into the `/node-readiness-evaluations` view, and unbind the watch immediately upon unmount.

### For Cluster Operators & NRC Administrators

1. **Enable NRE Mode:** Run the controller with `--enable-node-readiness-evaluation=true`. This splits monolithic rule status into discrete 1:1 node resources, eliminating multi-megabyte rule payloads.
2. **Set Specific Node Selectors:** Avoid unbounded `nodeSelector: {}` rules that match every node in 10,000+ node clusters unless strictly necessary.
3. **Configure API Server QPS:** When operating at >1,000 nodes, tune the controller's `--kube-api-qps=50` and `--kube-api-burst=100` to prevent client-side throttling.

---

## 6. Reproduction Guide

To reproduce these scale tests locally:

```bash
# 1. Start Kind cluster
kind create cluster --name nrc-scale --image kindest/node:v1.36.1

# 2. Deploy KWOK
kubectl apply -f https://github.com/kubernetes-sigs/kwok/releases/download/v0.8.0/kwok.yaml
kubectl apply -f https://github.com/kubernetes-sigs/kwok/releases/download/v0.8.0/stage-fast.yaml

# 3. Deploy NRC CRDs & Controller
kubectl apply -k https://github.com/kubernetes-sigs/node-readiness-controller/config/crd
kubectl apply -k https://github.com/kubernetes-sigs/node-readiness-controller/config/default

# 4. Scale nodes to 1,000
for i in $(seq 1 1000); do
  sed -e "s/kwok-node-0/kwok-node-$i/g" hack/test-workloads/kwok-template.yaml | kubectl apply -f -
done

# 5. Launch Headlamp with NRC plugin
npm run build
headlamp
```
