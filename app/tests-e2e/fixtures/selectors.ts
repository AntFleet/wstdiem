// Shared data-testid selector constants for the Playwright acceptance suite.
//
// Centralizing these here keeps the brittle UI-text-vs-testid boundary in one
// place so a component re-style doesn't require updating every spec.

export const HEADER = {
  brandMark: "brand-mark",
  navMarkets: "nav-markets",
  navLoop: "nav-loop",
  navPositions: "nav-positions",
  navAutomation: "nav-automation",
  navEvidence: "nav-evidence",
  hfGauge: "header-hf-gauge",
  auditGateBadge: "audit-gate-badge",
  statePill: "state-pill",
  anchorPill: "anchor-pill",
  singleClientWarning: "single-client-warning",
  quorumDegradedWarning: "quorum-degraded-warning",
  indexerKeyWarning: "indexer-key-warning",
  walletDisconnect: "wallet-disconnect",
  walletConnected: "wallet-connected",
  walletWrongChain: "wallet-wrong-chain",
} as const;

export const MARKETS = {
  screen: "markets-screen",
  empty: "markets-empty",
  listEmpty: "markets-list-empty",
  list: "markets-list",
  row: "market-row",
  filterStrip: "market-filter-strip",
  filterShowAll: "filter-show-all",
  clearFilters: "markets-clear-filters",
  marketCard: "market-card",
  cardOpenCta: "market-card-open",
  cardManageCta: "market-card-manage",
  cardAuditGate: "market-card-audit-gate",
  cardStatePill: "market-card-state-pill",
  cardAutomation: "market-card-automation",
  cardToggle: "market-card-toggle",
  cardDetails: "market-card-details",
} as const;

export const LOOP = {
  primary: "loop-builder-primary",
  routePane: "loop-builder-route-pane",
  intentEarn: "intent-tab-earn-spread",
  intentIncrease: "intent-tab-increase-exposure",
  intentReduce: "intent-tab-reduce-risk",
  intentExit: "intent-tab-exit",
  amountInput: "amount-input",
  leverageSlider: "leverage-slider",
  liveHfSection: "live-hf-section",
  mevModeSelector: "mev-mode-selector",
  mevModeOptionPrivate: "mev-mode-option-PRIVATE_BUILDER",
  mevModeOptionPublic: "mev-mode-option-PUBLIC",
  mevModeOptionSequencer: "mev-mode-option-SEQUENCER_DIRECT_FAILOPEN",
  mevModeOptionSealed: "mev-mode-option-SEALED_AUCTION",
  mevWaiverSection: "mev-waiver-section",
  mevWaiverBlocked: "mev-waiver-blocked",
  mevWaiverExtraBits: "mev-waiver-extra-bits",
  openPreviewCta: "open-preview-cta",
} as const;

export const PREVIEW = {
  drawer: "preview-drawer",
  drawerPanel: "preview-drawer-panel",
  drawerOverlay: "preview-drawer-overlay",
  drawerLoading: "preview-drawer-loading",
  drawerClose: "preview-drawer-close",
  drawerFooter: "preview-drawer-footer",
  signButton: "preview-sign-button",
  signOverrideReason: "preview-sign-override-reason",
  authorizerMismatch: "preview-authorizer-mismatch",
  authorizerMismatchReason: "preview-authorizer-mismatch-reason",
  verifyingContract: "preview-verifying-contract",
  identity: "preview-identity",
  spenders: "preview-spenders",
  digest: "preview-digest",
  ledger: "preview-ledger",
  amountsRoute: "preview-amounts-route",
  feesYield: "preview-fees-yield",
  approvals: "preview-approvals",
  calldata: "preview-calldata",
  failureConditions: "preview-failure-conditions",
  gates: "preview-gates",
  forceExitBlock: "preview-force-exit-block",
  ledgerBefore: "ledger-before",
  ledgerAfter: "ledger-after",
} as const;

export const POSITIONS = {
  screen: "positions-screen",
  disconnected: "positions-disconnected",
  noMarket: "positions-no-market",
  noAddress: "positions-no-address",
  riskHeader: "risk-header",
  actionRow: "position-action-row",
  yieldSection: "yield-section",
  authorizationRow: "authorization-row",
  eventTimeline: "event-timeline",
  actionAddCollateral: "action-button-add-collateral",
  actionRepay: "action-button-repay",
  actionRebalanceDown: "action-button-rebalance-down",
  actionExit: "action-button-exit",
  actionForceExit: "action-button-force-exit",
  actionRevoke: "action-button-revoke",
} as const;

export const FORCE_EXIT = {
  panel: "force-exit-confirm-panel",
  header: "force-exit-header",
  cancel: "force-exit-cancel",
  cancelBottom: "force-exit-cancel-bottom",
  authorizerMismatch: "force-exit-authorizer-mismatch",
  phishingBanner: "force-exit-phishing-banner",
  resolvedName: "force-exit-resolved-name",
  resolvedAuthorizer: "resolved-authorizer",
  overrideReasons: "force-exit-override-reasons",
  decodedFields: "force-exit-decoded-fields",
  risksChecklist: "force-exit-risks-checklist",
  risksChecklistInner: "force-exit-risks-checklist-inner",
  typedConfirmSection: "force-exit-typed-confirm-section",
  dwellSection: "force-exit-dwell-section",
  dwellCountdown: "dwell-countdown",
  dwellCountdownIdle: "dwell-countdown-idle",
  signButton: "force-exit-sign",
} as const;

export const AUTOMATION = {
  screen: "automation-screen",
  disconnected: "automation-disconnected",
  policyEditor: "policy-editor",
  livePolicies: "live-policies",
  livePoliciesLoading: "live-policies-loading",
  policyClassRebalance: "policy-class-REBALANCE",
  policyClassDeleverage: "policy-class-DELEVERAGE_ONLY",
  policyClassForceExit: "policy-class-FORCE_EXIT",
  acknowledgedRisks: "acknowledged-risks-section",
  signPolicyCta: "sign-policy-cta",
} as const;

export const EVIDENCE = {
  screen: "evidence-screen",
  auditGateSummary: "audit-gate-summary",
  stateBitGridSection: "state-bit-grid-section",
  stateBitGrid: "state-bit-grid",
  canonicalErrorsSection: "canonical-errors-section",
  download: "evidence-download",
  copy: "evidence-copy",
} as const;

export const BANNER = {
  stateBitmapBanner: "state-bitmap-banner",
  matrix: "state-bitmap-banner-matrix",
  matrixRow: (bitName: string) => `state-bitmap-banner-matrix-row-${bitName}`,
} as const;

export const BOOT = {
  indexerKeyMissing: "boot-indexer-key-missing",
} as const;
