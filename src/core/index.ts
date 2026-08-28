// Host-agnostic attention engine. No imports under this directory may reference
// the DOM or `chrome.*`; the engine must run unchanged in the extension and in a
// headless eval harness. See docs/attention-engine-spec.md §6.

export type { Content, Platform } from './content';
export type { PreferenceDoc, ExampleLink } from './prefs';
export type { LlmProvider, GenerateOptions, ChatMessage } from './llm/provider';
export { createOllamaProvider, type OllamaConfig } from './llm/providers/ollama';
export { createAnthropicProvider, type AnthropicConfig } from './llm/providers/anthropic';
export { createGeminiProvider, type GeminiConfig } from './llm/providers/gemini';
export { createProvider, type ProviderId, type ProviderConfig } from './llm/registry';
export { MODELS, DEFAULT_MODEL, NEEDS_API_KEY, type ModelOption } from './llm/models';
export type {
  AxisId,
  ContributionAxisId,
  GateAxisId,
  AxisScore,
  ScoreVector,
  ScoringContext,
  AxisScorer
} from './axes/types';
export { relevanceScorer } from './axes/relevance';
export { pollutionScorer } from './axes/pollution';
export { qualityScorer } from './axes/quality';
export { noveltyScorer } from './axes/novelty';
export { challengeScorer } from './axes/challenge';
export { calibrationScorer, calibrationHasABand } from './axes/calibration';
export { parseAxisJson, axisSchema } from './axes/shared';
export { judgeSlate, motivateRefusals, type EditorialJudgeOptions } from './editorial-judge';
export { runDigest, type DigestRun, type DigestOutcome } from './digest';
export { CancelledError } from './retrieval';
export { standardScorers } from './scorers';
export { compose, DEFAULT_POLICY, type CompositionPolicy, type ComposedScore } from './compose';
export { scoreAll, type EngineResult, type AxisFailure } from './engine';
export {
  looksResolvable,
  keepResolvable,
  cleanUrl,
  type SearchAdapter,
  type SearchQuery,
  type SearchResult
} from './search/adapter';
export type { Transport, TransportInit, TransportResponse } from './search/adapter';
export { classifyAddress, type AddressVerdict } from './net/address';
export { createFetcher, htmlToText, titleOf, decodeEntities, type FetcherOptions } from './net/extract';
export {
  composeReliability,
  mayOfferDownLevel,
  TIER_RANK,
  TIER_WEIGHT,
  type CrabeTier,
  type CrabeAxisId,
  type CrabeStatus,
  type CrabeNotRunReason,
  type CrabeFinding,
  type CrabeAxisResult,
  type CrabeVector,
  type Reliability,
  type ExcludedAxis
} from './crabe';
export {
  assembleEditorial,
  gatherContext,
  surfacedUngated,
  enforceOneSlotPerSubject,
  type EditorialCandidate,
  type EditorialDecision,
  type EditorialOutcome,
  type EditorialEntry,
  type EditorialResult,
  type EditorialContext
} from './editorial';
export {
  buildEditorialQueries,
  challengeIsUsable,
  DEFAULT_QUERY_POLICY,
  type EditorialIntent,
  type CandidateSubject,
  type EditorialQuery,
  type EditorialQueryPolicy,
  type EditorialRoundReport
} from './editorial-queries';
export {
  assembleManifest,
  mayPersist,
  declaredOnly,
  backingIsUniform,
  type Backing,
  type ArtefactClass,
  type CapabilityDeclaration,
  type TransportDeclaration,
  type StorageDeclaration,
  type AbsentCapability,
  type HostManifest
} from './capabilities';
export { createSearxngAdapter, type SearxngConfig } from './search/searxng';
export { createFeedsAdapter, parseFeed, type FeedSource, type FeedsConfig } from './search/feeds';
export { createBraveAdapter, type BraveConfig } from './search/brave';
export { createOpenAlexAdapter, type OpenAlexConfig } from './search/openalex';
export {
  retrieve,
  DEFAULT_RETRIEVAL_POLICY,
  type RetrievalRun,
  type RetrievalPolicy,
  type RetrievalReport,
  type ScoredCandidate,
  type TriageReason,
  type DocumentFetcher,
  type FetchedDocument
} from './retrieval';
export {
  createMemoryStore,
  documentIdFor,
  editorViewOf,
  SURFACES,
  type SpotterStore,
  type EditorView
} from './store/store';
export {
  emptySignals,
  mergeSignals,
  JOURNAL_HORIZON_DAYS,
  type Topic,
  type StoredDocument,
  type DocumentInput,
  type Relation,
  type RelationType,
  type JournalEntry,
  type ReadingSignals,
  type Surface
} from './store/model';
export type { Judgment, Judge, AxisTrace as JudgmentAxisTrace } from './store/judgment';
