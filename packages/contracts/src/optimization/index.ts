// Optimizer execution is backend-owned. Only its validated wire shapes belong
// in the shared FE<->BE contract package.

// One normalized row of public.continuum_action_stream, and the fold that makes a change
// and its undo read as ONE entry. Shared by every surface that narrates what we did.
export * from './action-stream';
// Setup advisor — what a selection will actually DO under an objective/budget/target, said
// before the portfolio is created. Shared so an agent gets the same warnings a human does.
export * from './advisor';
// Meta currency MAJOR->MINOR scaling, shared by the FE guardrail inputs, the apply
// ledger/audit keys, and the Graph budget write. Never hardcode *100.
export * from './currency';
export * from './engine-contracts';
// Which trailing window a portfolio's read surfaces report on, and how to recommend one.
export * from './lookback';
// MCP umbrella IO contracts (optimizer_query read + optimizer_manage write).
export * from './mcp';
// Shared onboarding builders (suggestion→config, create→enroll) — the parity keystone.
export * from './onboarding';
// Optimizer-service orchestration DTOs (enrollment, run requests, FE read model).
export * from './service';
