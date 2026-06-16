// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Canonical WSTDIEM Phase 1 fail-closed error selector set.
/// @dev Errors mirror PROTOCOL.md section 5.5 and the Phase A appendix.
library LoopV1Errors {
    error WrongChain(); // 0x10dfc033: digest.chainId != block.chainid.
    error RegistryVersionMismatch(); // 0x66bc64c3: digest registryVersion is stale.
    error RegistryMerkleRootMismatch(); // 0x0ef0eebc: digest root differs from registry root.
    error ExecutorMismatch(); // 0x3cb9597b: digest executor is not registry-pinned.
    error SpenderNotRegistered(); // 0x89a5dd7e: token/spender pair absent from registry.
    error BytecodeMismatch(); // 0xd0d8722b: spender/integration codehash or impl getter mismatch.
    error VaultAssetMismatch(); // 0x088e1066: wstDIEM.asset() != configured DIEM.
    error MorphoParamsMismatch(uint8 reason); // PB1.4 used reasons: 3 = params tuple, 4 = market id, 5 = onBehalf. (Selectors / class / receiver have dedicated errors.)
    error MinimumRepayShort(); // PB2-fix-2/A6.2: terminal repay assets fall below the armed `minRepay` floor.
    error RebalanceModeAmbiguous(); // PB1.5/A6.4: both maxDebtIncrease and maxCollateralSold are positive.
    error MorphoSelectorForbidden(); // PB1.3/A6.3: selector outside Phase 1 Morpho allow-list or action matrix.
    error MorphoSharesModeForbidden(); // PB1.3/A6.3: Phase 1 requires borrow/repay shares == 0.
    error ReceiverNotAllowed(); // PB1.3/A6.5: receiver must be digest.identity.executor in Phase 1.
    error ActionContextMissing(); // PB1.3/A6.2: executeMorpho called without validate* transient context.
    error ActionContextDigestMismatch(); // PB1.3/A6.2: executeMorpho digest differs from transient context.
    error ActionContextAlreadyArmed(); // PB1.4/A6.11: validate* would overwrite unconsumed context.
    error MorphoSelectorOutOfOrder(); // PB1.3/A6.7: selector does not match the next expected Morpho step.
    error MorphoSelectorAfterTerminal(); // PB1.3/A6.7: selector was submitted after terminal action step.
    error MorphoTerminalSelectorMissing(); // PB1.3/A6.7: validate* would overwrite an unterminated context.
    error ConfigIntegrityFailure(); // 0xaddf81d8: ExternalProtocolFingerprint drift.
    error StateBitmapUnknownBits(); // PR-5/Lock C: stateBitmap includes bits outside KNOWN_STATE_MASK.
    error RegistryVersionStale(); // PR-5/Lock D: registry version did not advance with a gated config commit.
    error FingerprintTimelockNotElapsed(); // PR-5/Lock E: queued fingerprint update is still timelocked.
    error FingerprintInvalid(uint8 reason); // PR-5/Lock E: queued fingerprint violates semantic invariants.
    error FingerprintMismatch(uint8 reason); // PR-5/Lock E: live fingerprint drifted from registry storage.
    error ConfigMutationOutsideAtomicGate(); // PR-5/Lock A: digest-bound config mutation bypassed batch commit.
    error HarvestAuthorityOnly(); // PR-5/I-69: harvest observation caller is not authorized.
    error OnlyAuthorization(); // PR-5/NF-8: activity write caller is not LoopAuthorization.
    error InvalidSignature(); // 0x8baa579f: ECDSA/EIP-1271 signature invalid at execution.
    error DigestTypeMismatch(); // 0x8a83a48e: primaryType submitted to wrong entrypoint.
    error NonceAlreadyUsed(); // 0x1fb09b80: nonce bitmap bit already consumed.
    error PolicyRevoking(); // 0x1db69521: policy inside revocation grace window.
    error PolicyExpired(); // 0x9c5bebca: policy/action expired.
    error PolicyClassMismatch(); // 0x0b522b0c: policy class cannot authorize requested action.
    error ForceAuthorizationRequired(); // 0xf5dfdc25: force path lacks force-specific authorization.
    error AckRiskBitMissing(); // 0x4fc90c8e: required ForceExit risk bit unset.
    error ExecutionKindMismatch(); // 0xe1d08d96: runtime caller class disagrees with signed executionKind.
    error CallbackDataForbidden(); // 0xb2b04bdb: Morpho callback data was non-empty.
    error ReentrantCallback(); // 0x493f562f: I-54 single-external-reentry guard: callback re-entered armed context.
    error InvalidCallbackSender(); // 0x891fcda5: I-11 canonical sender check: flash callback caller is not the canonical pool.
    error InvalidCallbackContext(); // 0x654b1394: armed-context hash does not match the running action's context.
    error VaultEvidenceMissing(); // 0x85e84fcb: section 7.1 VAULT_EVIDENCE_MISSING state-bit revert.
    error Eip1271PreimageNotAttested(); // 0x6f1b4474: high-risk smart-wallet preimage proof missing.
    error ForceExitWaiverOverbroad(); // 0xa228b165: multiple critical ForceExit override bits set.
    error ForceExitPolicyNotAllowedInPhase1(); // 0x7230dafb: stored ForceExit policy attempted in Phase 1.
    error ForceExitDeadlineExceedsBound(); // 0xbcacdcdc: ForceExit deadline exceeds 24h Phase 1 cap.
    error MevWaiverMissing(); // 0x857d72c0: runtime submission path requires unset mevWaiverBits.
    error Phase1AutomationScopeViolation(); // 0x360d2734: permissionless execution of out-of-Phase-1-scope policy class.
    error QuoteStale(); // 0x36a5021e: quoteBlockNumber + maxQuoteAgeBlocks exceeded.
    error QuoteDeviationExceeded(); // 0x13549b5f: automation quote reread exceeds max deviation.
    error EvidenceStale(); // 0x1d7c2680: ActionEvidence source stale for action class.
    error BlockInconsistent(); // 0x9b33cfd9: safety reads span inconsistent blocks.
    error DeadlineExceeded(); // 0x559895a3: block.timestamp > deadline.
    error IndexerAnchorStale(); // 0x5767979e: SDK-ONLY (contractEmitted=false). Surfaced by getCanonicalErrors as a fail-closed SDK gate; executor does NOT revert with this selector.
    error HarvestConvergencePending(); // 0xd8772d7c: risk-increase inside harvest cooling window.
    error RpcQuorumDegraded(); // 0x45490bfd: SDK-ONLY (contractEmitted=false). Fewer than quorumThreshold healthy providers.
    error MevModeMismatch(); // 0x91cd5bbd: executor-emitted. Runtime submission channel disagrees with signed mode.
    error RevealTooEarly(); // 0xc349402d: Phase G placeholder for commit-reveal.
    error RpcQuorumNotIndependent(); // 0x39281770: SDK-ONLY (contractEmitted=false). Quorum lacks provider-family independence.
    error KeeperBuilderOutage(); // 0x0f792d25: SDK-ONLY (contractEmitted=false). Keeper-side observability selector; signals builder outage without silent degrade.
    error CurveLiquidityInsufficient(); // 0xa1eee051: route depth below registry minimum.
    error CurveSlippageExceeded(); // 0xacaf05d8: realized slippage above signed bound.
    error CurvePriceImpactExceeded(); // 0x4f7fe240: price impact above signed bound.
    error FlashLiquidityUnavailable(); // 0x3db74538: Uniswap V3 flash cannot supply amount.
    error AlternateProviderMissing(); // 0xb3504b2a: Phase G alternate flash provider unavailable.
    error OracleStale(); // 0x04578698: oracle source stale.
    error OracleMissing(); // 0x37c1269f: required oracle source missing.
    error OracleDeviationExceeded(); // 0x2d33ffcf: cross-feed deviation above threshold.
    error SequencerDown(); // 0x032b3d00: Base sequencer feed reports down.
    error SequencerGracePeriod(); // 0xb5d44b5c: sequencer resumed but grace still active.
    error NavStepExceeded(); // 0x08fd99f3: unexplained NAV step above bound.
    error MorphoEvidenceMissing(); // 0xa50e1b8c: owner/market position evidence unavailable.
    error HealthFactorBoundFailure(); // 0x0d340143: post-action HF below signed minimum.
    error DebtNotReduced(); // PB1.6/PR-3: risk-reducing action failed strict postDebt < preDebt predicate.
    error HealthIndeterminate(); // 0xc8d7a22b: HF cannot be safely computed.
    error LeverageBoundFailure(); // 0xcd8a6ffb: leverage above signed maximum.
    error BorrowedDiemOutOfBand(); // 0x6618b7b5: Open borrow outside signed min/max.
    error CollateralSoldExceeded(); // 0xe5b73547: sold wstDIEM above signed cap.
    error DustBoundExceeded(); // 0x18d303ad: residual/dust above bound.
    error LiquidationDistanceBoundFailure(); // 0x3fe6d421: economic liquidation distance below bound.
    error UtilizationImpactExceeded(); // 0xdc92e56d: Morpho utilization impact above bound.
    error CurveShareExceeded(); // 0x04b17402: Curve route share above bound.
    error VaultDepositShortfall(); // 0x8717c893: vault.deposit minted below signed floor.
    error ThirdPartyRepayNotAccepted(); // 0x3000eb40: owner did not opt in to third-party repay.
    error AuditGateClosed(); // 0x3fef151f: Protocol Audit Gate v2 closed.
    error PausedAction(); // 0xa59392f5: action blocked by valid pause row.
    error PauseRateLimited(); // PR-6/O26: pause toggle attempted inside the 900-block window.
    error PauseScopeViolation(); // PR-6/PROTOCOL.md §12: guardian attempted to pause an escape/risk-reducing path.
    error PauseAuthorityOnly(); // PR-6: caller is not the active guardian role.
    error GovernanceRoleOnly(); // PR-6: caller is not the governance role.
    error AnchorSubmitterOnly(); // PR-6/F-7: caller is not the registry-pinned anchor submitter.
    error AnchorTooFrequent(); // PR-6/F-7: snapshot anchor submitted before the minimum cadence gap.
    error AnchorInFuture(); // PR-6/F-7: snapshot anchor block is greater than the current block.
    error NotPaused(); // PR-6: governance reaffirmed or unpaused a pause row that is not active.
    error AlreadyPaused(); // PR-6: guardian attempted to refresh an active pause window.
    error RolesMustDiffer(); // PR-6: emergency guardian and governance roles must stay separated.
    error IncidentInvestigating(); // 0x0971eb12: incident matrix row blocks action.
    error IncidentMitigating(); // 0x899f96ca: incident matrix row blocks action.
    error RevokedAuthorization(); // 0xb98202c4: policy is fully revoked after grace.
    error AutomationAttemptThrottled(); // 0x121bbfc2: I-72 failed-attempt throttle hit.
    error BuilderQuotaExceeded(); // 0x33faf508: builder API quota budget exhausted.
    error CallerNotAllowed(); // 0x2af07d20: permissionless caller not registry-allowlisted.
    error LedgerBeforeUnavailable(); // 0x27e35cb3: preview cannot compute before ledger.
    error LedgerAfterUnavailable(); // 0xd9e948ca: preview cannot compute after ledger.
    error EvidenceUnsorted(); // 0xe1527a5f: sources not strict ascending.
    error EvidenceSourceUnexpected(); // 0x4bde5c7e: sourceId not required for action.
    error EvidenceSourceMissing(); // 0x79194196: required sourceId absent.
    error EvidenceSourceAddressMismatch(); // 0xf0239d9e: sourceAddress not registry canonical.
    error EvidenceBundleHashMismatch(); // PB1.4/H-1: submitted evidence does not match digest-bound bundle hash.
    error PolicyHashMismatch(); // PB1.4/C-2: AutomationExec policyHash does not match stored policy.
    error AutomationProposalWindow(); // PB1.4/C-2: AutomationExec block window is not active.
    error PolicyExpiryExceedsBound(); // PB1.4/M-2: stored policy expiry exceeds registry max.
    error DeadlineExceedsBound(); // PB1.4/M-2: action deadline exceeds registry max.
    error AnchorNotMonotonic(); // PB1.4/H-3: indexer anchor block must increase.
    error OperatorRecoveryActivityUnknown(); // PB1.4/NEW-10: no owner activity anchor for recovery predicate.
    error Erc20ApproveFailed(); // PB1.6/PR-3: ERC-20 approve returned false or reverted.
    error Erc20TransferFailed(); // PB1.6/PR-3: ERC-20 transfer returned false or reverted.
    error Erc20TransferFromFailed(); // PB1.6/PR-3: ERC-20 transferFrom returned false or reverted.
}
