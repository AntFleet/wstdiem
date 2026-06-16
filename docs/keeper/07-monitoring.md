# Monitoring

Recommended metrics, health checks, and alert thresholds for keeper operations.

## Core metrics

### RPC Quorum Health

```ts
async function checkRpcQuorumHealth(): Promise<{
  healthy: boolean;
  activeCount: number;
  blocksLag: bigint[];
}> {
  const results = await Promise.all(
    publicClients.map(client => client.getBlockNumber())
  );

  const maxBlock = Math.max(...results);
  const lagBehind = results.map(bn => maxBlock - bn);

  const healthy = results.filter(bn => bn === maxBlock).length >= 2;

  return {
    healthy,
    activeCount: results.filter(bn => maxBlock - bn <= 5).length,
    blocksLag: lagBehind,
  };
}
```

**Alert threshold:** If < 2 RPC clients agree on current block OR any single RPC is > 10 blocks behind.

### Indexer Freshness

```ts
async function checkIndexerFreshness(): Promise<{
  headBlock: bigint;
  lastAnchorBlock: bigint;
  isStale: boolean;
}> {
  const indexerData = await fetch(`${INDEXER_URL}/health`).then(r => r.json());
  const anchor = await sdk.getAnchorFreshness();

  return {
    headBlock: indexerData.headBlock,
    lastAnchorBlock: anchor.lastAnchoredBlock,
    isStale: anchor.isStale,
  };
}
```

**Alert threshold:** If `lastAnchorBlock < currentBlock - anchorMaxStaleBlocks`.

### Proposal Generation Latency

```ts
async function measureProposalLatency(policyId: PolicyId): Promise<bigint> {
  const start = Date.now();
  const proposal = await sdk.proposeAutomationAction(policyId);
  return Date.now() - start;
}
```

**Alert threshold:** If proposal generation takes > 10 seconds (network lag / indexer load).

### Execution Success Rate

```ts
const executionMetrics = {
  attempted: 0,
  succeeded: 0,
  failed: 0,
  reverted: 0,
  lastFailureReason: "",
};

async function trackExecution(policyId: PolicyId) {
  executionMetrics.attempted++;

  try {
    const txHash = await sdk.executeAutomationProposal(policyId);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    if (receipt.status === "success") {
      executionMetrics.succeeded++;
    } else {
      executionMetrics.reverted++;
      executionMetrics.lastFailureReason = decodeRevertSelector(receipt.data).name;
    }
  } catch (err) {
    executionMetrics.failed++;
    executionMetrics.lastFailureReason = err.message;
  }
}
```

**Alert threshold:** If success rate drops below 90% in a 1-hour window OR consecutive failures > 5.

### Policy Trigger Rate

```ts
const triggerMetrics = {
  checksPerHour: 0,
  triggersPerHour: 0,
  lastTriggerTime: 0,
};

async function trackTriggerRate(policies: Policy[]) {
  triggerMetrics.checksPerHour++;

  for (const policy of policies) {
    const shouldTrigger = await evaluatePolicyCondition(policy, sdk);
    if (shouldTrigger) {
      triggerMetrics.triggersPerHour++;
      triggerMetrics.lastTriggerTime = Date.now();
    }
  }
}
```

**Alert threshold:** If no triggers in 24 hours (keeper may be stuck).

## Health check dashboard

```ts
async function generateHealthReport(): Promise<HealthReport> {
  const rpcHealth = await checkRpcQuorumHealth();
  const indexerHealth = await checkIndexerFreshness();
  const incident = await sdk.getIncidentHistory({ limit: 1 });

  return {
    timestamp: new Date(),
    rpc: {
      healthy: rpcHealth.healthy,
      activeCount: rpcHealth.activeCount,
      maxLagBlocks: Math.max(...rpcHealth.blocksLag),
    },
    indexer: {
      headBlock: indexerHealth.headBlock,
      isStale: indexerHealth.isStale,
      anchorAgeBlocks: currentBlock - indexerHealth.lastAnchorBlock,
    },
    incident: {
      state: incident[0]?.state ?? "NONE",
      blockNumber: incident[0]?.blockNumber ?? 0n,
    },
    execution: {
      successRate: executionMetrics.succeeded / executionMetrics.attempted,
      lastFailure: executionMetrics.lastFailureReason,
    },
  };
}
```

Run health check every 5–10 minutes and export to monitoring system (Prometheus, Datadog, etc.).

## Alert examples

### Critical alerts

```ts
// RPC quorum broken
if (rpcHealth.activeCount < 2) {
  alert("CRITICAL: RPC quorum broken. Keeper cannot proceed.");
}

// Indexer stale (emergency mode)
if (indexerHealth.anchorAgeBlocks > anchorMaxStaleBlocks * 3) {
  alert("CRITICAL: Indexer anchor in emergency mode. SDK refusing new actions.");
}

// Incident state != NONE
if (incident.state !== "NONE") {
  alert(`INCIDENT: ${incident.previousState} → ${incident.state}`);
}

// Execution failure rate high
if (executionMetrics.succeeded / executionMetrics.attempted < 0.7) {
  alert("WARNING: Execution success rate below 70% in past hour.");
}
```

### Warning alerts

```ts
// One RPC lagging
if (Math.max(...rpcHealth.blocksLag) > 10) {
  alert("WARNING: One RPC client is 10+ blocks behind.");
}

// Proposal latency high
if (proposalLatency > 5000) {
  alert("WARNING: Proposal generation took 5+ seconds.");
}

// No triggers in 6 hours
if (Date.now() - triggerMetrics.lastTriggerTime > 6 * 3600 * 1000) {
  alert("WARNING: No policy triggers in 6 hours. Keeper may be stuck.");
}
```

## Structured logging

```ts
const logger = createLogger({
  service: "keeper",
  level: process.env.LOG_LEVEL || "info",
});

// Policy triggered
logger.info("policy.triggered", {
  policyId,
  condition: policy.condition,
  userAddress: policy.owner,
  block: currentBlock,
});

// Proposal generated
logger.info("proposal.generated", {
  policyId,
  proposalId,
  debtIncrease: proposal.readinessResult.debtIncrease,
  healthFactor: proposal.readinessResult.healthFactorWad,
  latencyMs: proposalLatency,
});

// Execution submitted
logger.info("execution.submitted", {
  proposalId,
  txHash,
  gasPrice: tx.gasPrice,
});

// Execution failed
logger.error("execution.failed", {
  proposalId,
  reason: revertSelector.name,
  gas: receipt.gasUsed,
});

// Incident state changed
logger.warn("incident.stateChanged", {
  previousState: history[1]?.state,
  newState: history[0].state,
  block: history[0].blockNumber,
});
```

All logs go to a centralized log aggregator (ELK, Datadog, Sumo Logic, etc.).

## Alerting setup (example)

```ts
const alertChannels = {
  critical: "slack://wstdiem-critical",   // PagerDuty integration
  warning: "slack://wstdiem-warnings",    // Keeper team channel
  info: "slack://wstdiem-logs",           // Archive channel
};

function alert(level: "critical" | "warning" | "info", message: string) {
  logger[level](message);

  if (alertChannels[level]) {
    fetch(alertChannels[level], {
      method: "POST",
      body: JSON.stringify({
        text: `[${level.toUpperCase()}] ${message}`,
        timestamp: new Date().toISOString(),
      }),
    });
  }
}
```

## Dashboards and runbooks

Recommended Grafana panels:

1. **RPC Quorum Status** — Uptime per provider family
2. **Indexer Freshness** — Anchor age over time
3. **Proposal Latency** — P50 / P95 / P99 latencies
4. **Execution Success Rate** — Success / fail / revert counts
5. **Policy Trigger Rate** — Triggers per hour
6. **Gas Costs** — Gas per execution, trend over time
7. **Incident Timeline** — State transitions with blocks

For runbooks, see:
- [Incident Response](./06-incident-response.md) — what to do when incident occurs
- [MEV Posture](./04-mev-posture.md) — handling builder outages

## See also

- [Setup](./02-setup.md) — initial configuration
- [Incident Response](./06-incident-response.md) — emergency procedures
