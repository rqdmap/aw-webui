import moment from 'moment';
import { getClient } from '~/util/awclient';

export const LLM_RAW_BUCKET_TYPE = 'com.rqdmap.llm.raw.v1';
export const LLM_WORKSPACE_HOST_PREFIX = 'llm-workspace-';
const DEFAULT_TIMELINE_LIMIT = Number.POSITIVE_INFINITY;
const UNKNOWN_SOURCE = 'unknown-source';
const SOURCE_LABELS: Record<string, string> = {
  opencode: 'OpenCode',
  claudecode: 'Claude Code',
  codex: 'Codex',
};
const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  azure: 'Azure',
  bedrock: 'Bedrock',
  deepseek: 'DeepSeek',
  google: 'Google',
  groq: 'Groq',
  'gpt-sg': 'GPT-SG',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  ollama: 'Ollama',
  sglang: 'SG',
  together: 'Together',
  vertex: 'Vertex',
  xai: 'xAI',
};
const COMPACT_PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'anth',
  azure: 'az',
  bedrock: 'aws',
  deepseek: 'ds',
  google: 'ggl',
  groq: 'groq',
  'gpt-sg': 'gpt-sg',
  openai: 'oa',
  openrouter: 'or',
  ollama: 'ollama',
  sglang: 'sg',
  together: 'tg',
  vertex: 'vertex',
  xai: 'xai',
};

export interface SummaryItem {
  key: string;
  label: string;
  totalTokens: number;
  activeDurationSec: number;
  responseCount: number;
  source?: string | null;
  sourceLabel?: string | null;
  provider?: string | null;
  providerLabel?: string | null;
  providerLabels?: string[];
  providerBreakdown?: ProviderBreakdown[];
  modelBreakdown?: ModelBreakdown[];
  modelLabels?: string[];
  compactModelLabels?: string[];
}

export interface ProviderBreakdown {
  key: string;
  provider: string | null;
  label: string;
  totalTokens: number;
  responseCount: number;
}

export interface ModelBreakdown {
  key: string;
  label: string;
  compactLabel: string;
  totalTokens: number;
  responseCount: number;
}

export interface ProjectSummary {
  key: string;
  label: string;
  totalTokens: number;
  activeDurationSec: number;
  responseCount: number;
  sessionCount: number;
}

export interface BarChartDataset {
  label: string;
  backgroundColor: string;
  data: Array<number | null>;
}

export interface RhythmSeries {
  labels: string[];
  rangeLabels: string[];
  rawValues: number[];
  smoothValues: number[];
  bucketMinutes: number;
  smoothingWindow: number;
  foldedToDay: boolean;
  windowDays: number;
}

export interface ConcurrencySeries {
  labels: string[];
  rangeLabels: string[];
  values: number[];
  bucketMinutes: number;
  maxValue: number;
}

export interface LLMSummary {
  activeDurationSec: number;
  sessionCount: number;
  responseCount: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalCost: number;
}

export interface TimelineSegment {
  key: string;
  leftPct: number;
  widthPct: number;
}

export interface TimelineSession {
  key: string;
  rootSessionId: string;
  label: string;
  project: string | null;
  source: string;
  sourceLabel: string;
  provider: string | null;
  providerLabel: string | null;
  modelLabel: string | null;
  modelLabels: string[];
  compactModelLabels: string[];
  modelBreakdown: ModelBreakdown[];
  meta: string;
  isChild: boolean;
  responseCount: number;
  totalTokens: number;
  activeDurationSec: number;
  startLabel: string;
  endLabel: string;
  leftPct: number;
  widthPct: number;
  segments: TimelineSegment[];
}

export interface LLMOverview {
  hasBuckets: boolean;
  sources: string[];
  summary: LLMSummary;
  topSources: SummaryItem[];
  topModels: SummaryItem[];
  topSessionsByTime: SummaryItem[];
  topProjects: ProjectSummary[];
  activityBarDatasets: BarChartDataset[];
  activityRhythm: RhythmSeries | null;
  concurrencySeries: ConcurrencySeries | null;
  parallelTimeSec: number;
  peakConcurrency: number;
  sessionTimeline: TimelineSession[];
  hiddenSessionCount: number;
}

interface SessionAggregate {
  key: string;
  label: string;
  project: string | null;
  rootSessionId: string;
  parentSessionId: string | null;
  isChild: boolean;
  source: string;
  sourceLabel: string;
  provider: string | null;
  providerLabel: string | null;
  startMs: number;
  endMs: number;
  intervals: Array<{ startMs: number; endMs: number }>;
  responseCount: number;
  totalTokens: number;
  activeDurationSec: number;
  modelLabel: string | null;
  modelLabels: string[];
  compactModelLabels: string[];
  modelBreakdown: ModelBreakdown[];
}

interface ProjectAccumulator extends ProjectSummary {
  sessionIds: Set<string>;
}

interface ModelAccumulator extends SummaryItem {
  providerMap: Map<string, ProviderBreakdown>;
}

const overviewCache = new Map<string, Promise<LLMOverview>>();

export function emptySummary(): LLMSummary {
  return {
    activeDurationSec: 0,
    sessionCount: 0,
    responseCount: 0,
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalCost: 0,
  };
}

export function emptyOverview(): LLMOverview {
  return {
    hasBuckets: false,
    sources: [],
    summary: emptySummary(),
    topSources: [],
    topModels: [],
    topSessionsByTime: [],
    topProjects: [],
    activityBarDatasets: [],
    activityRhythm: null,
    concurrencySeries: null,
    parallelTimeSec: 0,
    peakConcurrency: 0,
    sessionTimeline: [],
    hiddenSessionCount: 0,
  };
}

export function getCandidateHosts(currentHost: string): string[] {
  if (!currentHost) return [];
  const hosts = [currentHost];
  if (currentHost.startsWith(LLM_WORKSPACE_HOST_PREFIX)) {
    hosts.push(currentHost.slice(LLM_WORKSPACE_HOST_PREFIX.length));
  }
  return Array.from(new Set(hosts.filter(Boolean)));
}

export function getTimeRange(queryOptions): { start: string; end: string } | null {
  if (!queryOptions || !queryOptions.timeperiod) return null;
  const start = queryOptions.timeperiod.start;
  const end = moment(start)
    .add(...queryOptions.timeperiod.length)
    .toISOString();
  return { start, end };
}

export function getLLMBuckets(buckets: any[], currentHost: string) {
  const hosts = getCandidateHosts(currentHost);
  return buckets.filter(
    bucket => bucket.type === LLM_RAW_BUCKET_TYPE && hosts.includes(bucket.hostname || '')
  );
}

export function hasLLMBuckets(buckets: any[], currentHost: string): boolean {
  return getLLMBuckets(buckets, currentHost).length > 0;
}

function compactLabel(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim();
  return normalized || fallback;
}

function optionalLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function sourceKey(value: unknown): string {
  return optionalLabel(value) || UNKNOWN_SOURCE;
}

export function formatSourceLabel(value: unknown): string {
  const key = sourceKey(value);
  if (SOURCE_LABELS[key]) return SOURCE_LABELS[key];
  return key
    .split(/[-_]+/g)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function providerKey(value: unknown): string | null {
  const normalized = optionalLabel(value);
  return normalized ? normalized.toLowerCase() : null;
}

export function formatProviderLabel(value: unknown): string | null {
  const key = providerKey(value);
  if (!key) return null;
  if (PROVIDER_LABELS[key]) return PROVIDER_LABELS[key];
  return key
    .split(/[-_]+/g)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatCompactProviderLabel(value: unknown): string | null {
  const key = providerKey(value);
  if (!key) return null;
  if (COMPACT_PROVIDER_LABELS[key]) return COMPACT_PROVIDER_LABELS[key];
  if (key.length <= 10) return key;
  return formatProviderLabel(key);
}

function formatProviderSummaryLabel(value: unknown): string {
  return formatProviderLabel(value) || 'Unknown provider';
}

export function formatProviderModelLabel(
  provider: unknown,
  model: unknown,
  compact = false
): string | null {
  const modelLabel = optionalLabel(model);
  if (!modelLabel) return null;
  const providerLabel = compact
    ? formatCompactProviderLabel(provider)
    : formatProviderLabel(provider);
  if (!providerLabel) return modelLabel;
  return `${providerLabel}/${modelLabel}`;
}

function pushUniqueLabel(target: string[], value: string | null): void {
  if (!value || target.includes(value)) return;
  target.push(value);
}

function pushSessionModelLabels(
  target: { modelLabels?: string[]; compactModelLabels?: string[] },
  provider: unknown,
  model: unknown
): void {
  const modelLabel = optionalLabel(model);
  if (!modelLabel) return;
  const modelLabels = target.modelLabels || (target.modelLabels = []);
  const compactModelLabels = target.compactModelLabels || (target.compactModelLabels = []);
  pushUniqueLabel(modelLabels, formatProviderModelLabel(provider, modelLabel) || modelLabel);
  pushUniqueLabel(
    compactModelLabels,
    formatProviderModelLabel(provider, modelLabel, true) || modelLabel
  );
}

function accumulateModelBreakdown(
  target: { modelBreakdown?: ModelBreakdown[] },
  provider: unknown,
  model: unknown,
  tokenCount: number,
  responseCount = 1
): void {
  const modelLabel = optionalLabel(model);
  if (!modelLabel) return;
  const key = `${providerKey(provider) || 'unknown-provider'}::${modelLabel}`;
  const breakdown = target.modelBreakdown || (target.modelBreakdown = []);
  let entry = breakdown.find(item => item.key === key);
  if (!entry) {
    entry = {
      key,
      label: formatProviderModelLabel(provider, modelLabel) || modelLabel,
      compactLabel: formatProviderModelLabel(provider, modelLabel, true) || modelLabel,
      totalTokens: 0,
      responseCount: 0,
    };
    breakdown.push(entry);
  }
  entry.totalTokens += tokenCount;
  entry.responseCount += responseCount;
}

function sortModelBreakdown(target: { modelBreakdown?: ModelBreakdown[] }): void {
  if (!target.modelBreakdown?.length) return;
  target.modelBreakdown.sort(
    (left, right) =>
      right.totalTokens - left.totalTokens || right.responseCount - left.responseCount
  );
}

function scopedSessionKey(source: string, sessionId: string | null): string | null {
  if (!sessionId) return null;
  return `${source}::${sessionId}`;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function mergeIntervalList(
  intervals: Array<{ startMs: number; endMs: number }>
): Array<{ startMs: number; endMs: number }> {
  if (!intervals.length) return [];
  const sorted = [...intervals].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const merged = [{ startMs: sorted[0].startMs, endMs: sorted[0].endMs }];
  for (const interval of sorted.slice(1)) {
    const current = merged[merged.length - 1];
    if (interval.startMs <= current.endMs) {
      current.endMs = Math.max(current.endMs, interval.endMs);
      continue;
    }
    merged.push({ startMs: interval.startMs, endMs: interval.endMs });
  }
  return merged;
}

function mergeIntervals(intervals: Array<{ startMs: number; endMs: number }>): number {
  return (
    mergeIntervalList(intervals).reduce(
      (total, interval) => total + interval.endMs - interval.startMs,
      0
    ) / 1000
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatMetricCount(value: number): string {
  return new Intl.NumberFormat(undefined).format(Math.max(Math.round(value || 0), 0));
}

function buildOverviewCacheKey({
  currentHost,
  timeRange,
  buckets,
  timelineLimit,
}: {
  currentHost: string;
  timeRange: { start: string; end: string };
  buckets: any[];
  timelineLimit: number;
}): string {
  const bucketKey = buckets
    .map(bucket => `${bucket.id}:${bucket.metadata?.start || ''}:${bucket.metadata?.end || ''}`)
    .sort()
    .join('|');
  const timelineKey = Number.isFinite(timelineLimit) ? String(timelineLimit) : 'all';
  return [currentHost, timeRange.start, timeRange.end, timelineKey, bucketKey].join('::');
}

export async function loadLLMOverview({
  queryOptions,
  buckets,
  currentHost,
  timelineLimit = DEFAULT_TIMELINE_LIMIT,
}: {
  queryOptions: any;
  buckets: any[];
  currentHost: string;
  timelineLimit?: number;
}): Promise<LLMOverview> {
  const timeRange = getTimeRange(queryOptions);
  if (!timeRange || !currentHost) return emptyOverview();

  const llmBuckets = getLLMBuckets(buckets, currentHost);
  if (!llmBuckets.length) return emptyOverview();

  const cacheKey = buildOverviewCacheKey({
    currentHost,
    timeRange,
    buckets: llmBuckets,
    timelineLimit,
  });

  if (!overviewCache.has(cacheKey)) {
    overviewCache.set(
      cacheKey,
      (async () => {
        const eventsByBucket = await Promise.all(
          llmBuckets.map(bucket =>
            getClient().getEvents(bucket.id, {
              start: moment.parseZone(timeRange.start).toDate(),
              end: moment.parseZone(timeRange.end).toDate(),
              limit: -1,
            })
          )
        );
        return buildOverview(
          eventsByBucket.flat(),
          timeRange,
          timelineLimit,
          queryOptions?.timeperiod?.length || [1, 'day']
        );
      })()
    );
  }

  return overviewCache.get(cacheKey);
}

function buildOverview(
  events: any[],
  timeRange: { start: string; end: string },
  timelineLimit: number,
  timeperiodLength: [number, string] = [1, 'day']
): LLMOverview {
  const sortedEvents = [...events].sort(
    (left, right) =>
      moment.parseZone(left?.timestamp).valueOf() - moment.parseZone(right?.timestamp).valueOf()
  );
  const responseEvents = sortedEvents.filter(event => event?.data?.kind === 'response.completed');
  const allSessionIds = new Set<string>();
  const sourceSet = new Set<string>();
  const sources = new Map<string, SummaryItem>();
  const intervals: Array<{ startMs: number; endMs: number }> = [];
  const models = new Map<string, ModelAccumulator>();
  const sessions = new Map<string, SummaryItem>();
  const projects = new Map<string, ProjectAccumulator>();
  const timelineSessions = new Map<string, SessionAggregate>();
  const summary = emptySummary();

  for (const event of sortedEvents) {
    const data = event?.data || {};
    const timestampMs = moment.parseZone(event.timestamp).valueOf();
    const rawSource = sourceKey(data.source);
    const rawSourceLabel = formatSourceLabel(rawSource);
    const rawProvider = providerKey(data.provider);
    const rawProviderLabel = formatProviderLabel(rawProvider);
    const sessionId = optionalLabel(data.session_id);
    const sessionKey = scopedSessionKey(rawSource, sessionId);
    const rootSessionId = optionalLabel(data.root_session_id) || sessionId;
    const rootSessionKey = scopedSessionKey(rawSource, rootSessionId) || sessionKey;
    const parentSessionKey = scopedSessionKey(rawSource, optionalLabel(data.parent_session_id));

    if (sessionKey) {
      allSessionIds.add(sessionKey);
      if (!timelineSessions.has(sessionKey)) {
        timelineSessions.set(sessionKey, {
          key: sessionKey,
          label: compactLabel(data.title || data.session_title, sessionId),
          project: optionalLabel(data.project),
          rootSessionId: rootSessionKey || sessionKey,
          parentSessionId: parentSessionKey,
          isChild: Boolean(data.is_child),
          source: rawSource,
          sourceLabel: rawSourceLabel,
          provider: rawProvider,
          providerLabel: rawProviderLabel,
          startMs: timestampMs,
          endMs: timestampMs,
          intervals: [],
          responseCount: 0,
          totalTokens: 0,
          activeDurationSec: 0,
          modelLabel: optionalLabel(data.model),
          modelLabels: [],
          compactModelLabels: [],
          modelBreakdown: [],
        });
      }
      const session = timelineSessions.get(sessionKey);
      session.label = compactLabel(data.title || data.session_title, session.label);
      session.project = optionalLabel(data.project) || session.project;
      session.rootSessionId = rootSessionKey || session.rootSessionId;
      session.parentSessionId = parentSessionKey || session.parentSessionId;
      session.isChild = Boolean(data.is_child);
      session.source = rawSource;
      session.sourceLabel = rawSourceLabel;
      session.provider = rawProvider || session.provider;
      session.providerLabel = rawProviderLabel || session.providerLabel;
      session.modelLabel = optionalLabel(data.model) || session.modelLabel;
      pushSessionModelLabels(session, rawProvider, data.model);
      session.startMs = Math.min(session.startMs, timestampMs);
      session.endMs = Math.max(session.endMs, timestampMs);
    }

    sourceSet.add(rawSource);
  }

  for (const event of responseEvents) {
    const data = event.data || {};
    const rawSource = sourceKey(data.source);
    const rawSourceLabel = formatSourceLabel(rawSource);
    const rawProvider = providerKey(data.provider);
    const rawProviderLabel = formatProviderLabel(rawProvider);
    const endMs = moment.parseZone(event.timestamp).valueOf();
    const durationSec = toNumber(event.duration);
    const startMs = endMs - durationSec * 1000;
    if (durationSec > 0) {
      intervals.push({ startMs, endMs });
    }

    const inputTokens = toNumber(data.input_tokens);
    const outputTokens = toNumber(data.output_tokens);
    const reasoningTokens = toNumber(data.reasoning_tokens);
    const cacheReadTokens = toNumber(data.cache_read_tokens);
    const cacheWriteTokens = toNumber(data.cache_write_tokens);
    const totalTokens =
      inputTokens + outputTokens + reasoningTokens + cacheReadTokens + cacheWriteTokens;

    summary.responseCount += 1;
    summary.inputTokens += inputTokens;
    summary.outputTokens += outputTokens;
    summary.reasoningTokens += reasoningTokens;
    summary.cacheReadTokens += cacheReadTokens;
    summary.cacheWriteTokens += cacheWriteTokens;
    summary.totalTokens += totalTokens;
    summary.totalCost += toNumber(data.cost);

    if (!sources.has(rawSource)) {
      sources.set(rawSource, {
        key: rawSource,
        label: rawSourceLabel,
        totalTokens: 0,
        activeDurationSec: 0,
        responseCount: 0,
        source: rawSource,
        sourceLabel: rawSourceLabel,
      });
    }
    const sourceSummary = sources.get(rawSource);
    sourceSummary.totalTokens += totalTokens;
    sourceSummary.activeDurationSec += durationSec;
    sourceSummary.responseCount += 1;

    const modelLabel = compactLabel(data.model, 'unknown model');
    const modelKey = modelLabel;
    if (!models.has(modelKey)) {
      models.set(modelKey, {
        key: modelKey,
        label: modelLabel,
        totalTokens: 0,
        activeDurationSec: 0,
        responseCount: 0,
        provider: rawProvider,
        providerLabel: rawProviderLabel,
        providerLabels: [],
        providerBreakdown: [],
        modelBreakdown: [],
        providerMap: new Map<string, ProviderBreakdown>(),
      });
    }
    const model = models.get(modelKey);
    model.totalTokens += totalTokens;
    model.activeDurationSec += durationSec;
    model.responseCount += 1;
    const providerSummaryKey = rawProvider || 'unknown-provider';
    if (!model.providerMap.has(providerSummaryKey)) {
      model.providerMap.set(providerSummaryKey, {
        key: providerSummaryKey,
        provider: rawProvider,
        label: formatProviderSummaryLabel(rawProvider),
        totalTokens: 0,
        responseCount: 0,
      });
    }
    const providerSummary = model.providerMap.get(providerSummaryKey);
    providerSummary.totalTokens += totalTokens;
    providerSummary.responseCount += 1;
    pushUniqueLabel(model.providerLabels || (model.providerLabels = []), providerSummary.label);

    const rawSessionId = compactLabel(data.session_id, 'unknown-session');
    const sessionKey = scopedSessionKey(rawSource, rawSessionId) || `${rawSource}::unknown-session`;
    const sessionLabel = compactLabel(data.title || data.session_title, rawSessionId);
    if (!sessions.has(sessionKey)) {
      sessions.set(sessionKey, {
        key: sessionKey,
        label: sessionLabel,
        totalTokens: 0,
        activeDurationSec: 0,
        responseCount: 0,
        source: rawSource,
        sourceLabel: rawSourceLabel,
        provider: rawProvider,
        providerLabel: rawProviderLabel,
        modelLabels: [],
        compactModelLabels: [],
        modelBreakdown: [],
      });
    }
    const session = sessions.get(sessionKey);
    session.totalTokens += totalTokens;
    session.activeDurationSec += durationSec;
    session.responseCount += 1;
    session.source = rawSource;
    session.sourceLabel = rawSourceLabel;
    pushSessionModelLabels(session, rawProvider, data.model);
    accumulateModelBreakdown(session, rawProvider, data.model, totalTokens);

    const projectLabel = compactLabel(data.project, 'No project');
    if (!projects.has(projectLabel)) {
      projects.set(projectLabel, {
        key: projectLabel,
        label: projectLabel,
        totalTokens: 0,
        activeDurationSec: 0,
        responseCount: 0,
        sessionCount: 0,
        sessionIds: new Set<string>(),
      });
    }
    const project = projects.get(projectLabel);
    project.totalTokens += totalTokens;
    project.activeDurationSec += durationSec;
    project.responseCount += 1;
    project.sessionIds.add(sessionKey);

    const timelineSession = timelineSessions.get(sessionKey);
    if (timelineSession) {
      timelineSession.startMs = Math.min(timelineSession.startMs, startMs);
      timelineSession.endMs = Math.max(timelineSession.endMs, endMs);
      timelineSession.intervals.push({ startMs, endMs });
      timelineSession.responseCount += 1;
      timelineSession.totalTokens += totalTokens;
      timelineSession.activeDurationSec += durationSec;
      timelineSession.source = rawSource;
      timelineSession.sourceLabel = rawSourceLabel;
      timelineSession.provider = rawProvider || timelineSession.provider;
      timelineSession.providerLabel = rawProviderLabel || timelineSession.providerLabel;
      timelineSession.modelLabel = optionalLabel(data.model) || timelineSession.modelLabel;
      pushSessionModelLabels(timelineSession, rawProvider, data.model);
      accumulateModelBreakdown(timelineSession, rawProvider, data.model, totalTokens);
    }
  }

  summary.activeDurationSec = mergeIntervals(intervals);
  summary.sessionCount = allSessionIds.size;
  Array.from(sessions.values()).forEach(sortModelBreakdown);
  Array.from(timelineSessions.values()).forEach(sortModelBreakdown);

  const { peakConcurrency, hiddenSessionCount, timelineItems } = buildTimeline(
    Array.from(timelineSessions.values()),
    timeRange,
    timelineLimit
  );
  const rootSessions = Array.from(timelineSessions.values()).filter(item => !item.isChild);
  const concurrencySeries = buildConcurrencySeries(rootSessions, timeRange, timeperiodLength);
  const parallelTimeSec = computeParallelTimeSec(rootSessions, timeRange);
  const topProjects = Array.from(projects.values())
    .map(project => ({
      key: project.key,
      label: project.label,
      totalTokens: project.totalTokens,
      activeDurationSec: project.activeDurationSec,
      responseCount: project.responseCount,
      sessionCount: project.sessionIds.size,
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens || b.responseCount - a.responseCount);

  const topModels = Array.from(models.values())
    .map(({ providerMap, ...item }) => {
      const providerBreakdown = Array.from(providerMap.values()).sort(
        (a, b) => b.totalTokens - a.totalTokens || b.responseCount - a.responseCount
      );
      return {
        ...item,
        provider: providerBreakdown.length === 1 ? providerBreakdown[0].provider : null,
        providerLabel: providerBreakdown.length === 1 ? providerBreakdown[0].label : null,
        providerLabels: providerBreakdown.map(provider => provider.label),
        providerBreakdown,
      };
    })
    .sort((a, b) => b.totalTokens - a.totalTokens || b.responseCount - a.responseCount);

  return {
    hasBuckets: true,
    sources: Array.from(sourceSet).sort(),
    summary,
    topSources: Array.from(sources.values()).sort((a, b) => b.totalTokens - a.totalTokens),
    topModels,
    topSessionsByTime: Array.from(sessions.values()).sort(
      (a, b) => b.activeDurationSec - a.activeDurationSec || b.totalTokens - a.totalTokens
    ),
    topProjects,
    activityBarDatasets: buildActivityBarDatasets(intervals, timeRange, timeperiodLength),
    activityRhythm: buildRhythmSeries(intervals, timeRange, timeperiodLength),
    concurrencySeries,
    parallelTimeSec,
    peakConcurrency,
    sessionTimeline: timelineItems,
    hiddenSessionCount,
  };
}

function buildConcurrencySeries(
  rootSessions: SessionAggregate[],
  timeRange: { start: string; end: string },
  timeperiodLength: [number, string]
): ConcurrencySeries | null {
  const { edges, bucketMinutes } = buildConcurrencyBucketEdges(timeRange.start, timeperiodLength);
  if (edges.length < 2) return null;

  const rootIntervals = rootSessions.flatMap(session =>
    mergeIntervalList(
      session.intervals.length
        ? session.intervals
        : [{ startMs: session.startMs, endMs: session.endMs }]
    )
  );

  const values = Array.from({ length: edges.length - 1 }, (_, index) =>
    computeBucketPeakConcurrency(rootIntervals, edges[index], edges[index + 1])
  );

  return {
    labels: buildRhythmLabels(edges, timeperiodLength, false),
    rangeLabels: buildRhythmLabels(edges, timeperiodLength, true),
    values,
    bucketMinutes,
    maxValue: values.length ? Math.max(...values) : 0,
  };
}

function buildConcurrencyBucketEdges(
  startIso: string,
  timeperiodLength: [number, string]
): { edges: number[]; bucketMinutes: number } {
  const start = moment.parseZone(startIso);
  const [countRaw, resolutionRaw] = timeperiodLength || [1, 'day'];
  const count = Number(countRaw) || 1;
  const resolution = String(resolutionRaw || 'day');

  if (resolution.startsWith('day') && count === 1) {
    return buildRhythmBucketEdges(startIso, timeperiodLength);
  }

  let bucketMinutes = 6 * 60;
  if (resolution.startsWith('day')) {
    bucketMinutes = 2 * 60;
  } else if (resolution.startsWith('week')) {
    bucketMinutes = 6 * 60;
  } else if (resolution.startsWith('month')) {
    bucketMinutes = 6 * 60;
  } else if (resolution === 'year') {
    bucketMinutes = 7 * 24 * 60;
  }

  const end = start.clone().add(count, resolution as moment.unitOfTime.DurationConstructor);
  const edges = [start.valueOf()];
  let cursor = start.clone();
  while (cursor.isBefore(end)) {
    const next = cursor.clone().add(bucketMinutes, 'minutes');
    edges.push(Math.min(next.valueOf(), end.valueOf()));
    cursor = next;
  }

  return {
    edges: Array.from(new Set(edges)),
    bucketMinutes,
  };
}

function buildRhythmSeries(
  intervals: Array<{ startMs: number; endMs: number }>,
  timeRange: { start: string; end: string },
  timeperiodLength: [number, string]
): RhythmSeries | null {
  if (!isSingleDayTimeperiod(timeperiodLength)) {
    return buildFoldedDayRhythmSeries(intervals, timeRange, timeperiodLength);
  }

  const { edges, bucketMinutes } = buildRhythmBucketEdges(timeRange.start, timeperiodLength);
  if (edges.length < 2) return null;

  const merged = mergeIntervalList(intervals);
  const rawValues = Array.from({ length: edges.length - 1 }, () => 0);
  for (const interval of merged) {
    for (let index = 0; index < rawValues.length; index += 1) {
      const bucketStart = edges[index];
      const bucketEnd = edges[index + 1];
      const overlapStart = Math.max(interval.startMs, bucketStart);
      const overlapEnd = Math.min(interval.endMs, bucketEnd);
      if (overlapEnd <= overlapStart) continue;
      rawValues[index] += (overlapEnd - overlapStart) / (60 * 60 * 1000);
    }
  }

  const smoothingWindow = getRhythmSmoothingWindow(bucketMinutes, timeperiodLength, false);
  const smoothValues = smoothSeries(rawValues, smoothingWindow);

  return {
    labels: buildRhythmLabels(edges, timeperiodLength, false),
    rangeLabels: buildRhythmLabels(edges, timeperiodLength, true),
    rawValues: rawValues.map(value => Math.round(value * 1000) / 1000),
    smoothValues: smoothValues.map(value => Math.round(value * 1000) / 1000),
    bucketMinutes,
    smoothingWindow,
    foldedToDay: false,
    windowDays: 1,
  };
}

function buildFoldedDayRhythmSeries(
  intervals: Array<{ startMs: number; endMs: number }>,
  timeRange: { start: string; end: string },
  timeperiodLength: [number, string]
): RhythmSeries | null {
  const { edges, bucketMinutes } = buildRhythmBucketEdges(timeRange.start, [1, 'day']);
  if (edges.length < 2) return null;

  const rangeStartMs = moment.parseZone(timeRange.start).valueOf();
  const rangeEndMs = moment.parseZone(timeRange.end).valueOf();
  const windowDays = countTimeRangeDays(timeRange);
  const bucketMs = bucketMinutes * 60 * 1000;
  const totals = Array.from({ length: edges.length - 1 }, () => 0);

  for (const interval of mergeIntervalList(intervals)) {
    let cursor = Math.max(interval.startMs, rangeStartMs);
    const clampedEndMs = Math.min(interval.endMs, rangeEndMs);
    while (cursor < clampedEndMs) {
      const dayStartMs = moment(cursor).startOf('day').valueOf();
      const nextDayStartMs = moment(dayStartMs).add(1, 'day').valueOf();
      const segmentEndMs = Math.min(clampedEndMs, nextDayStartMs);
      const offsetStartMs = cursor - dayStartMs;
      const offsetEndMs = segmentEndMs - dayStartMs;

      let bucketIndex = Math.max(0, Math.floor(offsetStartMs / bucketMs));
      while (bucketIndex < totals.length) {
        const bucketStartMs = bucketIndex * bucketMs;
        if (bucketStartMs >= offsetEndMs) break;
        const bucketEndMs = bucketStartMs + bucketMs;
        const overlapStartMs = Math.max(offsetStartMs, bucketStartMs);
        const overlapEndMs = Math.min(offsetEndMs, bucketEndMs);
        if (overlapEndMs > overlapStartMs) {
          totals[bucketIndex] += (overlapEndMs - overlapStartMs) / (60 * 60 * 1000);
        }
        bucketIndex += 1;
      }

      cursor = segmentEndMs;
    }
  }

  const rawValues = totals.map(value => value / windowDays);
  const smoothingWindow = getRhythmSmoothingWindow(bucketMinutes, timeperiodLength, true);
  const smoothValues = smoothSeries(rawValues, smoothingWindow);

  return {
    labels: buildRhythmLabels(edges, [1, 'day'], false),
    rangeLabels: buildRhythmLabels(edges, [1, 'day'], true),
    rawValues: rawValues.map(value => Math.round(value * 1000) / 1000),
    smoothValues: smoothValues.map(value => Math.round(value * 1000) / 1000),
    bucketMinutes,
    smoothingWindow,
    foldedToDay: true,
    windowDays,
  };
}

function buildActivityBarDatasets(
  intervals: Array<{ startMs: number; endMs: number }>,
  timeRange: { start: string; end: string },
  timeperiodLength: [number, string]
): BarChartDataset[] {
  const bucketEdges = buildBucketEdges(timeRange.start, timeperiodLength);
  if (bucketEdges.length < 2) return [];

  const values = Array.from({ length: bucketEdges.length - 1 }, () => 0);
  const merged = mergeIntervalList(intervals);

  for (const interval of merged) {
    for (let index = 0; index < values.length; index += 1) {
      const bucketStart = bucketEdges[index];
      const bucketEnd = bucketEdges[index + 1];
      const overlapStart = Math.max(interval.startMs, bucketStart);
      const overlapEnd = Math.min(interval.endMs, bucketEnd);
      if (overlapEnd <= overlapStart) continue;
      values[index] += (overlapEnd - overlapStart) / (60 * 60 * 1000);
    }
  }

  return [
    {
      label: 'LLM active time',
      backgroundColor: '#6699ff',
      data: values.map(value => (value > 0 ? Math.round(value * 1000) / 1000 : null)),
    },
  ];
}

function buildBucketEdges(startIso: string, timeperiodLength: [number, string]): number[] {
  const start = moment.parseZone(startIso);
  const [countRaw, resolutionRaw] = timeperiodLength || [1, 'day'];
  const count = Number(countRaw) || 1;
  const resolution = String(resolutionRaw || 'day');

  if (resolution.startsWith('day') && count === 1) {
    return Array.from({ length: 25 }, (_, index) => start.clone().add(index, 'hour').valueOf());
  }
  if (resolution.startsWith('day')) {
    return Array.from({ length: count + 1 }, (_, index) =>
      start.clone().add(index, 'day').valueOf()
    );
  }
  if (resolution.startsWith('week')) {
    return Array.from({ length: 8 }, (_, index) => start.clone().add(index, 'day').valueOf());
  }
  if (resolution.startsWith('month')) {
    const daysInMonth = start.daysInMonth();
    return Array.from({ length: daysInMonth + 1 }, (_, index) =>
      start.clone().add(index, 'day').valueOf()
    );
  }
  if (resolution === 'year') {
    return Array.from({ length: 13 }, (_, index) => start.clone().add(index, 'month').valueOf());
  }
  return Array.from({ length: 25 }, (_, index) => start.clone().add(index, 'hour').valueOf());
}

function buildRhythmBucketEdges(
  startIso: string,
  timeperiodLength: [number, string]
): { edges: number[]; bucketMinutes: number } {
  const start = moment.parseZone(startIso);
  const [countRaw, resolutionRaw] = timeperiodLength || [1, 'day'];
  const count = Number(countRaw) || 1;
  const resolution = String(resolutionRaw || 'day');

  if (resolution.startsWith('day') && count === 1) {
    return {
      edges: Array.from({ length: 97 }, (_, index) =>
        start
          .clone()
          .add(index * 15, 'minutes')
          .valueOf()
      ),
      bucketMinutes: 15,
    };
  }
  if (resolution.startsWith('day')) {
    return {
      edges: Array.from({ length: count + 1 }, (_, index) =>
        start.clone().add(index, 'day').valueOf()
      ),
      bucketMinutes: 24 * 60,
    };
  }
  if (resolution.startsWith('week')) {
    return {
      edges: Array.from({ length: 8 }, (_, index) => start.clone().add(index, 'day').valueOf()),
      bucketMinutes: 24 * 60,
    };
  }
  if (resolution.startsWith('month')) {
    const daysInMonth = start.daysInMonth();
    return {
      edges: Array.from({ length: daysInMonth + 1 }, (_, index) =>
        start.clone().add(index, 'day').valueOf()
      ),
      bucketMinutes: 24 * 60,
    };
  }
  if (resolution === 'year') {
    return {
      edges: Array.from({ length: 13 }, (_, index) => start.clone().add(index, 'month').valueOf()),
      bucketMinutes: 30 * 24 * 60,
    };
  }
  return {
    edges: Array.from({ length: 97 }, (_, index) =>
      start
        .clone()
        .add(index * 15, 'minutes')
        .valueOf()
    ),
    bucketMinutes: 15,
  };
}

function isSingleDayTimeperiod(timeperiodLength: [number, string]): boolean {
  const resolution = String(timeperiodLength?.[1] || 'day');
  const count = Number(timeperiodLength?.[0] || 1);
  return resolution.startsWith('day') && count === 1;
}

function buildRhythmLabels(
  edges: number[],
  timeperiodLength: [number, string],
  detailed: boolean
): string[] {
  const resolution = String(timeperiodLength?.[1] || 'day');
  const count = Number(timeperiodLength?.[0] || 1);
  return edges.slice(0, -1).map((edge, index) => {
    const nextEdge = edges[index + 1];
    if (resolution.startsWith('day') && count === 1) {
      if (detailed) {
        return `${moment(edge).format('HH:mm')} - ${moment(nextEdge).format('HH:mm')}`;
      }
      return moment(edge).format('HH:mm');
    }
    if (resolution.startsWith('day')) {
      return detailed
        ? `${moment(edge).format('M/D')} - ${moment(nextEdge).format('M/D')}`
        : `${moment(edge).format('M/D')}`;
    }
    if (resolution.startsWith('week')) {
      return detailed ? `${moment(edge).format('ddd, M/D')}` : `${moment(edge).format('M/D')}`;
    }
    if (resolution.startsWith('month')) {
      return detailed ? `${moment(edge).format('MMM D')}` : `${moment(edge).format('M/D')}`;
    }
    if (resolution === 'year') {
      return detailed ? `${moment(edge).format('MMM YYYY')}` : `${moment(edge).format('MMM')}`;
    }
    if (detailed) {
      return `${moment(edge).format('MMM D')} - ${moment(nextEdge).format('MMM D')}`;
    }
    return moment(edge).format('MMM D');
  });
}

function getRhythmSmoothingWindow(
  bucketMinutes: number,
  timeperiodLength: [number, string],
  foldedToDay: boolean
): number {
  const resolution = String(timeperiodLength?.[1] || 'day');
  if (foldedToDay || (resolution.startsWith('day') && Number(timeperiodLength?.[0] || 1) === 1)) {
    return Math.max(Math.round(60 / bucketMinutes), 1);
  }
  return 1;
}

function countTimeRangeDays(timeRange: { start: string; end: string }): number {
  const start = moment.parseZone(timeRange.start);
  const end = moment.parseZone(timeRange.end);
  const cursor = start.clone();
  let days = 0;
  while (cursor.isBefore(end)) {
    days += 1;
    cursor.add(1, 'day');
  }
  return Math.max(days, 1);
}

function smoothSeries(values: number[], windowSize: number): number[] {
  if (windowSize <= 1 || values.length <= 2) return [...values];
  const halfWindow = Math.floor(windowSize / 2);
  return values.map((_, index) => {
    const start = Math.max(0, index - halfWindow);
    const end = Math.min(values.length, index + halfWindow + 1);
    const slice = values.slice(start, end);
    if (!slice.length) return 0;
    return slice.reduce((sum, value) => sum + value, 0) / slice.length;
  });
}

function computeBucketPeakConcurrency(
  intervals: Array<{ startMs: number; endMs: number }>,
  bucketStart: number,
  bucketEnd: number
): number {
  let current = 0;
  let peak = 0;
  const points: Array<{ timestampMs: number; delta: number }> = [];

  for (const interval of intervals) {
    if (interval.endMs <= bucketStart || interval.startMs >= bucketEnd) continue;
    if (interval.startMs < bucketStart && interval.endMs > bucketStart) {
      current += 1;
    } else {
      points.push({ timestampMs: Math.max(interval.startMs, bucketStart), delta: 1 });
    }

    if (interval.endMs < bucketEnd) {
      points.push({ timestampMs: interval.endMs, delta: -1 });
    }
  }

  peak = current;
  for (const point of points.sort((left, right) => {
    if (left.timestampMs !== right.timestampMs) return left.timestampMs - right.timestampMs;
    return left.delta - right.delta;
  })) {
    current += point.delta;
    peak = Math.max(peak, current);
  }

  return peak;
}

function computeParallelTimeSec(
  rootSessions: SessionAggregate[],
  timeRange: { start: string; end: string }
): number {
  const rangeStartMs = moment.parseZone(timeRange.start).valueOf();
  const rangeEndMs = moment.parseZone(timeRange.end).valueOf();
  const points: Array<{ timestampMs: number; delta: number }> = [];

  for (const session of rootSessions) {
    const merged = mergeIntervalList(
      session.intervals.length
        ? session.intervals
        : [{ startMs: session.startMs, endMs: session.endMs }]
    );
    for (const interval of merged) {
      const startMs = Math.max(interval.startMs, rangeStartMs);
      const endMs = Math.min(interval.endMs, rangeEndMs);
      if (endMs <= startMs) continue;
      points.push({ timestampMs: startMs, delta: 1 });
      points.push({ timestampMs: endMs, delta: -1 });
    }
  }

  const ordered = points.sort((left, right) => {
    if (left.timestampMs !== right.timestampMs) return left.timestampMs - right.timestampMs;
    return left.delta - right.delta;
  });

  let current = 0;
  let previous = rangeStartMs;
  let parallelMs = 0;
  for (const point of ordered) {
    if (point.timestampMs > previous && current >= 2) {
      parallelMs += point.timestampMs - previous;
    }
    current += point.delta;
    previous = point.timestampMs;
  }

  if (rangeEndMs > previous && current >= 2) {
    parallelMs += rangeEndMs - previous;
  }

  return parallelMs / 1000;
}

function buildTimeline(
  items: SessionAggregate[],
  timeRange: { start: string; end: string },
  timelineLimit: number
) {
  const rangeStartMs = moment.parseZone(timeRange.start).valueOf();
  const rangeEndMs = moment.parseZone(timeRange.end).valueOf();
  const rangeDurationMs = Math.max(rangeEndMs - rangeStartMs, 1);
  const sessionIndex = new Map(items.map(item => [item.key, item]));
  const concurrencyPoints: Array<{ timestampMs: number; delta: number }> = [];

  const ordered = items
    .filter(item => item.endMs >= rangeStartMs && item.startMs <= rangeEndMs)
    .sort((left, right) => {
      const leftRootStart = sessionIndex.get(left.rootSessionId)?.startMs ?? left.startMs;
      const rightRootStart = sessionIndex.get(right.rootSessionId)?.startMs ?? right.startMs;
      if (leftRootStart !== rightRootStart) return leftRootStart - rightRootStart;
      if (left.rootSessionId === right.rootSessionId) {
        const leftIsRoot = left.key === left.rootSessionId;
        const rightIsRoot = right.key === right.rootSessionId;
        if (leftIsRoot !== rightIsRoot) return leftIsRoot ? -1 : 1;
      }
      if (left.startMs !== right.startMs) return left.startMs - right.startMs;
      return right.totalTokens - left.totalTokens;
    });
  const orderedRoots = ordered.filter(item => !item.isChild);
  const visibleRoots = Number.isFinite(timelineLimit)
    ? orderedRoots.slice(0, timelineLimit)
    : orderedRoots;
  const visibleRootIds = new Set(visibleRoots.map(item => item.rootSessionId || item.key));
  const hiddenSessionCount = Number.isFinite(timelineLimit)
    ? Math.max(0, orderedRoots.length - timelineLimit)
    : 0;
  const timelineItems = ordered
    .filter(item => visibleRootIds.has(item.rootSessionId || item.key))
    .map(item => {
      const merged = mergeIntervalList(item.intervals);
      const clampedStartMs = clamp(item.startMs, rangeStartMs, rangeEndMs);
      const clampedEndMs = clamp(
        Math.max(item.endMs, item.startMs + 1000),
        rangeStartMs,
        rangeEndMs
      );
      if (!item.isChild) {
        concurrencyPoints.push({ timestampMs: clampedStartMs, delta: 1 });
        concurrencyPoints.push({ timestampMs: clampedEndMs, delta: -1 });
      }
      const leftPct = ((clampedStartMs - rangeStartMs) / rangeDurationMs) * 100;
      const widthPct = (Math.max(clampedEndMs - clampedStartMs, 1000) / rangeDurationMs) * 100;
      const segments = merged.map((segment, index) => {
        const startMs = clamp(segment.startMs, rangeStartMs, rangeEndMs);
        const endMs = clamp(segment.endMs, rangeStartMs, rangeEndMs);
        return {
          key: `${item.key}-${index}`,
          leftPct: ((startMs - rangeStartMs) / rangeDurationMs) * 100,
          widthPct: (Math.max(endMs - startMs, 1000) / rangeDurationMs) * 100,
        };
      });

      const metaParts = [item.sourceLabel];
      if (item.project) metaParts.push(item.project);
      if (item.modelLabels.length === 1) {
        metaParts.push(item.modelLabels[0]);
      } else if (item.modelLabels.length > 1) {
        metaParts.push(`${item.modelLabels.length} models: ${item.modelLabels.join(', ')}`);
      }
      metaParts.push(`${formatMetricCount(item.totalTokens)} tok`);
      metaParts.push(item.responseCount ? `${item.responseCount} responses` : 'no responses');
      metaParts.push(moment.duration(item.activeDurationSec, 'seconds').humanize());

      return {
        key: item.key,
        rootSessionId: item.rootSessionId,
        label: item.label,
        project: item.project,
        source: item.source,
        sourceLabel: item.sourceLabel,
        provider: item.provider,
        providerLabel: item.providerLabel,
        modelLabel: item.modelLabel,
        modelLabels: item.modelLabels,
        compactModelLabels: item.compactModelLabels,
        modelBreakdown: item.modelBreakdown,
        meta: metaParts.join(' · '),
        isChild: item.isChild,
        responseCount: item.responseCount,
        totalTokens: item.totalTokens,
        activeDurationSec: item.activeDurationSec,
        startLabel: formatTimelinePoint(clampedStartMs, rangeDurationMs),
        endLabel: formatTimelinePoint(clampedEndMs, rangeDurationMs),
        leftPct,
        widthPct,
        segments,
      };
    });

  let concurrency = 0;
  let peakConcurrency = 0;
  for (const point of concurrencyPoints.sort((left, right) => {
    if (left.timestampMs !== right.timestampMs) return left.timestampMs - right.timestampMs;
    return left.delta - right.delta;
  })) {
    concurrency += point.delta;
    peakConcurrency = Math.max(peakConcurrency, concurrency);
  }

  return { peakConcurrency, hiddenSessionCount, timelineItems };
}

export function formatTimelinePoint(timestampMs: number, rangeDurationMs?: number): string {
  const pattern =
    rangeDurationMs && rangeDurationMs > 48 * 60 * 60 * 1000 ? 'MM-DD HH:mm' : 'HH:mm';
  return moment(timestampMs).format(pattern);
}
