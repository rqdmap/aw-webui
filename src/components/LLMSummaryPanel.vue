<template lang="pug">
div(v-if="visible").llm-panel
  div.text-center.py-3(v-if="loading")
    b-spinner(small type="grow" label="Loading")
    span.ml-2 Loading LLM activity...
  b-alert.mb-0(v-else-if="error" show variant="danger") {{ error }}
  b-alert.mb-0(v-else-if="overview.hasBuckets && !hasData" show variant="info")
    | No LLM activity found for this time range.
  div(v-else-if="hasData")
    div(v-if="mode === 'tokens'")
      div.text-muted.small.mb-3
        | {{ overview.summary.responseCount }} responses across {{ overview.summary.sessionCount }} sessions
      div.token-matrix(v-if="tokenRows.length")
        div.token-cell(v-for="row in tokenRows" :key="row.label")
          div.metric-label.metric-label-inline {{ row.label }}
          div.metric-value.metric-value-compact {{ row.value }}

    div(v-else-if="mode === 'sources'")
      aw-summary(
        v-if="sourceSummaryFields.length"
        :fields="sourceSummaryFields"
        :namefunc="e => e.data.label"
        :hoverfunc="e => e.data.hover"
        :colorfunc="e => e.data.colorKey"
        :valuefunc="e => e.data.value"
        with_limit
      )
      div.text-muted.small(v-else) No source data

    div(v-else-if="mode === 'models'")
      aw-summary(
        v-if="modelSummaryFields.length"
        :fields="modelSummaryFields"
        :namefunc="e => e.data.label"
        :hoverfunc="e => e.data.hover"
        :colorfunc="e => e.data.colorKey"
        :valuefunc="e => e.data.value"
        with_limit
      )
      div.text-muted.small(v-else) No model data

    div(v-else-if="mode === 'sessions'")
      aw-summary(
        v-if="sessionSummaryFields.length"
        :fields="sessionSummaryFields"
        :namefunc="e => e.data.label"
        :hoverfunc="e => e.data.hover"
        :colorfunc="() => 'llm-session'"
        :valuefunc="e => e.data.value"
        with_limit
      )
      div.text-muted.small(v-else) No session data

    div(v-else-if="mode === 'projects'")
      aw-summary(
        v-if="projectSummaryFields.length"
        :fields="projectSummaryFields"
        :namefunc="e => e.data.label"
        :hoverfunc="e => e.data.hover"
        :colorfunc="() => 'llm-project'"
        :valuefunc="e => e.data.value"
        with_limit
      )
      div.text-muted.small(v-else) No project data

    div(v-else-if="mode === 'barchart'")
      div(v-if="overview.activityRhythm")
        div.text-muted.small.mb-2
          | {{ rhythmCaption }}
        aw-llm-rhythm-chart(:series="overview.activityRhythm")
      div.text-muted.small(v-else) No rhythm data

    div(v-else-if="mode === 'concurrency'")
      div(v-if="overview.concurrencySeries")
        div.text-muted.small.mb-2
          | {{ concurrencyCaption }}
        aw-llm-concurrency-chart(:series="overview.concurrencySeries")
      div.text-muted.small(v-else) No concurrency data

    div(v-else-if="mode === 'timeline'")
      div.timeline-meta.text-muted
        ul.list-group.list-group-horizontal-md.timeline-meta-list
          li.list-group-item.pl-0.pr-3.py-0.border-0
            | #[b Roots:] {{ sessionGroups.length }}
          li.list-group-item.pl-0.pr-3.py-0.border-0
            | #[b Peak:] {{ overview.peakConcurrency }} threads
          li.list-group-item.pl-0.pr-3.py-0.border-0
            | #[b Window:] {{ timelineWindowLabel }}
        ul.list-group.list-group-horizontal-md.timeline-meta-list(v-if="timelineSourceSummary || costVisible")
          li.list-group-item.pl-0.pr-3.py-0.border-0(v-if="timelineSourceSummary")
            | #[b Sources:] {{ timelineSourceSummary }}
          li.list-group-item.pl-0.pr-3.py-0.border-0(v-if="costVisible")
            | #[b Cost:] {{ formatCost(overview.summary.totalCost) }}
      div.timeline-shell
        div.timeline-ruler
            div.timeline-ruler-track
              div.timeline-ruler-tick(
                v-for="tick in timelineTicks"
                :key="tick.key"
                :class="`is-${tick.align}`"
                :style="timelineTickStyle(tick)"
              )
                span.timeline-ruler-label {{ tick.label }}
                span.timeline-ruler-mark
        div.session-timeline
          div.thread-group(v-for="group in sessionGroups" :key="group.key")
            div.session-row.session-row-root(v-if="group.root")
              div.session-meta
                div.session-heading
                  div.session-heading-main
                    div.session-title-row
                      span.session-context-chip(
                        v-if="group.root.sourceLabel || group.root.project"
                        :title="''"
                        v-b-tooltip.hover.noninteractive="formatSessionContextTooltip(group)"
                      )
                        span.session-context-project-pill(v-if="group.root.project")
                          span.session-context-project {{ group.root.project }}
                        span.session-context-source-tag(v-if="group.root.sourceLabel")
                          span.session-context-source {{ group.root.sourceLabel }}
                      span.session-title(
                        :title="''"
                        v-b-tooltip.hover.noninteractive="formatSessionTitleTooltip(group.root.label)"
                      ) {{ formatSessionTitle(group.root.label) }}
                  div.session-summary.session-summary-inline
                    template(v-for="part in sessionSummaryParts(group.root)" :key="`${group.root.key}-${part.kind}`")
                      span.session-summary-chip(
                        :class="`is-${part.kind}`"
                        :title="part.tooltip ? '' : null"
                        v-b-tooltip.hover.noninteractive="part.tooltip || null"
                      )
                        span.session-summary-kicker {{ part.kicker }}
                        span.session-summary-item(:class="`is-${part.kind}`") {{ part.text }}
              div.session-rail-wrap
                div.session-rail(:style="sessionRailStyle()" :title="timelineTooltip(group.root)")
                  div.session-span(:style="sessionSpanStyle(group.root)")
                  div.session-active(
                    v-for="segment in group.root.segments"
                    :key="segment.key"
                    :style="sessionSegmentStyle(segment)"
                  )
</template>

<script lang="ts">
import moment from 'moment';
import LLMConcurrencyChart from '~/visualizations/LLMConcurrencyChart.vue';
import LLMRhythmChart from '~/visualizations/LLMRhythmChart.vue';
import { useActivityStore } from '~/stores/activity';
import { useBucketsStore } from '~/stores/buckets';
import { seconds_to_duration } from '~/util/time';
import {
  emptyOverview,
  formatSourceLabel,
  formatTimelinePoint,
  getTimeRange,
  loadLLMOverview,
  type LLMOverview,
  type TimelineSegment,
  type TimelineSession,
} from '~/util/llm';

interface TimelineTick {
  key: string;
  label: string;
  leftPct: number;
  align: 'start' | 'center' | 'end';
}

interface SessionGroup {
  key: string;
  root: TimelineSession | null;
  children: TimelineSession[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export default {
  name: 'aw-llm-summary-panel',
  components: {
    'aw-llm-concurrency-chart': LLMConcurrencyChart,
    'aw-llm-rhythm-chart': LLMRhythmChart,
  },
  props: {
    mode: {
      type: String,
      default: 'tokens',
    },
  },
  data() {
    return {
      activityStore: useActivityStore(),
      bucketsStore: useBucketsStore(),
      loading: false,
      error: '',
      overview: emptyOverview() as LLMOverview,
    };
  },
  computed: {
    currentHost(): string {
      return this.activityStore.query_options?.host || '';
    },
    timeRange(): { start: string; end: string } | null {
      return getTimeRange(this.activityStore.query_options);
    },
    visible(): boolean {
      return this.loading || this.overview.hasBuckets || Boolean(this.error);
    },
    hasData(): boolean {
      return (
        this.overview.summary.responseCount > 0 ||
        this.overview.topSources.length > 0 ||
        this.overview.topModels.length > 0 ||
        this.overview.topSessionsByTime.length > 0 ||
        this.overview.sessionTimeline.length > 0
      );
    },
    tokenRows(): Array<{ label: string; value: string }> {
      const rows = [
        { label: 'LLM Time', value: this.formatDuration(this.overview.summary.activeDurationSec) },
        { label: 'Total Tokens', value: this.formatTokenNumber(this.overview.summary.totalTokens) },
        { label: 'Input', value: this.formatTokenNumber(this.overview.summary.inputTokens) },
        { label: 'Output', value: this.formatTokenNumber(this.overview.summary.outputTokens) },
        {
          label: 'Reasoning',
          value: this.formatTokenNumber(this.overview.summary.reasoningTokens),
        },
      ];
      if (this.overview.summary.cacheReadTokens > 0) {
        rows.push({
          label: 'Cache Read',
          value: this.formatTokenNumber(this.overview.summary.cacheReadTokens),
        });
      }
      if (this.overview.summary.cacheWriteTokens > 0) {
        rows.push({
          label: 'Cache Write',
          value: this.formatTokenNumber(this.overview.summary.cacheWriteTokens),
        });
      }
      if (this.overview.summary.totalCost > 0) {
        rows.push({
          label: 'Cost',
          value: this.formatCost(this.overview.summary.totalCost),
        });
      }
      return rows;
    },
    sourceSummaryFields() {
      return this.overview.topSources.map(item => ({
        timestamp: '',
        duration: Math.max(item.totalTokens, 1),
        data: {
          label: item.label,
          value: `${this.formatTokenNumber(item.totalTokens)} tok`,
          hover: [
            item.label,
            `${this.formatTokenNumber(item.totalTokens)} tok`,
            `${item.responseCount} responses`,
            this.formatDuration(item.activeDurationSec),
          ].join('\n'),
          colorKey: item.source || item.key,
          $color: '#d9d9d9',
        },
      }));
    },
    modelSummaryFields() {
      return this.overview.topModels.map(item => {
        const providerBreakdown = item.providerBreakdown || [];
        const providerCount =
          providerBreakdown.length || item.providerLabels?.length || (item.providerLabel ? 1 : 0);
        const topProvider = providerBreakdown[0]?.label || item.providerLabel || null;
        const providerSummary = providerCount > 1 ? `${providerCount} providers` : topProvider;
        const providerLines = providerBreakdown.map(provider => {
          const parts = [
            provider.label,
            `${this.formatTokenNumber(provider.totalTokens)} tok`,
            provider.responseCount === 1 ? '1 response' : `${provider.responseCount} responses`,
          ];
          return parts.join(' · ');
        });

        return {
          timestamp: '',
          duration: Math.max(item.totalTokens, 1),
          data: {
            label: item.label,
            value: providerSummary
              ? `${providerSummary} · ${this.formatTokenNumber(item.totalTokens)} tok`
              : `${this.formatTokenNumber(item.totalTokens)} tok`,
            hover: [
              item.label,
              `${this.formatTokenNumber(item.totalTokens)} tok`,
              `${item.responseCount} responses`,
              this.formatDuration(item.activeDurationSec),
              providerCount > 1 ? `${providerCount} providers` : topProvider,
              providerLines.length ? '' : null,
              ...providerLines,
            ]
              .filter(Boolean)
              .join('\n'),
            colorKey: providerBreakdown[0]?.provider || item.provider || 'llm-model',
            $color: '#d9d9d9',
          },
        };
      });
    },
    sessionSummaryFields() {
      return this.overview.topSessionsByTime.map(item => ({
        timestamp: '',
        duration: Math.max(item.activeDurationSec, 1),
        data: {
          label: item.label,
          value: this.formatDuration(item.activeDurationSec),
          hover: [
            item.label,
            item.sourceLabel || null,
            this.formatSessionModelsMeta(item.modelLabels),
            this.formatDuration(item.activeDurationSec),
            `${this.formatTokenNumber(item.totalTokens)} tok`,
            `${item.responseCount} responses`,
            item.modelBreakdown?.length ? '' : null,
            ...(item.modelBreakdown || []).map(
              model => `${model.label} · ${this.formatTokenNumber(model.totalTokens)} tok`
            ),
          ]
            .filter(Boolean)
            .join('\n'),
          $color: '#d9d9d9',
        },
      }));
    },
    projectSummaryFields() {
      return this.overview.topProjects.map(item => ({
        timestamp: '',
        duration: Math.max(item.totalTokens, 1),
        data: {
          label: item.label,
          value: `${this.formatTokenNumber(item.totalTokens)} tok`,
          hover: [
            item.label,
            `${this.formatTokenNumber(item.totalTokens)} tok`,
            `${item.sessionCount} sessions`,
            `${item.responseCount} responses`,
            this.formatDuration(item.activeDurationSec),
          ].join('\n'),
          $color: '#d9d9d9',
        },
      }));
    },
    sourcesLabel(): string {
      return this.overview.sources.map(source => formatSourceLabel(source)).join(', ');
    },
    timelineSourceSummary(): string {
      if (!this.sourcesLabel) return '';
      if (this.sourcesLabel.length <= 28) return this.sourcesLabel;
      return this.overview.sources.length === 1
        ? this.sourcesLabel
        : `${this.overview.sources.length} sources`;
    },
    costVisible(): boolean {
      return this.overview.summary.totalCost > 0;
    },
    timelineWindowLabel(): string {
      if (!this.timeRange) return '';
      const startMs = moment.parseZone(this.timeRange.start).valueOf();
      const endMs = moment.parseZone(this.timeRange.end).valueOf();
      return moment.duration(endMs - startMs).humanize();
    },
    rhythmCaption(): string {
      const series = this.overview.activityRhythm;
      if (!series) return '';
      const bucketLabel =
        series.bucketMinutes >= 60
          ? `${Math.round(series.bucketMinutes / 60)}h buckets`
          : `${series.bucketMinutes}m buckets`;
      const parts = series.foldedToDay
        ? ['avg 24h', bucketLabel, `${series.windowDays}d window`]
        : [bucketLabel];
      if (series.smoothingWindow <= 1) return parts.join(' · ');
      const smoothingMinutes = series.bucketMinutes * series.smoothingWindow;
      const smoothingLabel =
        smoothingMinutes >= 60
          ? `${Math.round(smoothingMinutes / 60)}h smoothing`
          : `${smoothingMinutes}m smoothing`;
      parts.push(smoothingLabel);
      return parts.join(' · ');
    },
    concurrencyCaption(): string {
      const series = this.overview.concurrencySeries;
      if (!series) return '';
      const bucketLabel =
        series.bucketMinutes >= 24 * 60
          ? 'daily buckets'
          : series.bucketMinutes >= 60
          ? `${Math.round(series.bucketMinutes / 60)}h buckets`
          : `${series.bucketMinutes}m buckets`;
      return `${bucketLabel} · ${this.formatDuration(this.overview.parallelTimeSec)} parallel time`;
    },
    timelineTicks(): TimelineTick[] {
      if (!this.timeRange) return [];
      const startMs = moment.parseZone(this.timeRange.start).valueOf();
      const endMs = moment.parseZone(this.timeRange.end).valueOf();
      const rangeDurationMs = Math.max(endMs - startMs, 1);
      const steps =
        rangeDurationMs > 21 * 24 * 60 * 60 * 1000
          ? 4
          : rangeDurationMs > 7 * 24 * 60 * 60 * 1000
          ? 5
          : rangeDurationMs > 18 * 60 * 60 * 1000
          ? 6
          : 4;
      return Array.from({ length: steps + 1 }, (_, index) => {
        const ratio = index / steps;
        const timestampMs = startMs + rangeDurationMs * ratio;
        return {
          key: `tick-${index}`,
          label:
            rangeDurationMs > 7 * 24 * 60 * 60 * 1000
              ? moment(timestampMs).format('M/D')
              : formatTimelinePoint(timestampMs, rangeDurationMs),
          leftPct: ratio * 100,
          align: index === 0 ? 'start' : index === steps ? 'end' : 'center',
        };
      });
    },
    sessionGroups(): SessionGroup[] {
      const groups = new Map<string, SessionGroup>();
      for (const item of this.overview.sessionTimeline) {
        const key = item.rootSessionId || item.key;
        if (!groups.has(key)) {
          groups.set(key, { key, root: null, children: [] });
        }
        const group = groups.get(key);
        if (!item.isChild && !group.root) {
          group.root = item;
        } else {
          group.children.push(item);
        }
      }
      return Array.from(groups.values()).map(group => {
        if (!group.root && group.children.length > 0) {
          const [first, ...rest] = group.children;
          return { key: group.key, root: first, children: rest };
        }
        return group;
      });
    },
  },
  watch: {
    timeRange: {
      deep: true,
      handler() {
        this.refresh();
      },
    },
    currentHost() {
      this.refresh();
    },
    'bucketsStore.buckets.length'() {
      this.refresh();
    },
  },
  async mounted() {
    await this.bucketsStore.ensureLoaded();
    await this.refresh();
  },
  methods: {
    async refresh() {
      if (!this.timeRange || !this.currentHost) return;
      this.loading = true;
      this.error = '';
      this.overview = emptyOverview();
      try {
        await this.bucketsStore.ensureLoaded();
        this.overview = await loadLLMOverview({
          queryOptions: this.activityStore.query_options,
          buckets: this.bucketsStore.buckets,
          currentHost: this.currentHost,
        });
      } catch (err) {
        console.error(err);
        this.error = err?.message || 'Failed to load LLM events.';
      } finally {
        this.loading = false;
      }
    },
    sessionSummaryParts(item: TimelineSession) {
      const parts = [
        {
          kind: 'time',
          kicker: 'Window',
          text: this.formatSessionRange(item.startLabel, item.endLabel),
          tooltip: null,
        },
      ];

      const modelText = this.formatTimelineModel(item);
      if (modelText) {
        parts.push({
          kind: 'model',
          kicker: item.compactModelLabels.length > 1 ? 'Models' : 'Model',
          text: modelText,
          tooltip: this.formatTimelineModelTooltip(item),
        });
      }

      return parts;
    },
    formatDuration(seconds: number): string {
      return seconds_to_duration(seconds || 0);
    },
    formatTokenNumber(value: number): string {
      const numeric = Number(value || 0);
      const abs = Math.abs(numeric);
      if (abs >= 1_000_000) {
        const scaled = numeric / 1_000_000;
        const digits = Math.abs(scaled) >= 100 ? 0 : 1;
        return `${scaled.toFixed(digits).replace(/\.0$/, '')}M`;
      }
      if (abs >= 1_000) {
        const scaled = numeric / 1_000;
        const digits = Math.abs(scaled) >= 100 ? 0 : 1;
        return `${scaled.toFixed(digits).replace(/\.0$/, '')}K`;
      }
      return `${Math.round(numeric)}`;
    },
    formatCost(value: number): string {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 2,
      }).format(value || 0);
    },
    formatSessionContextTooltip(
      group: SessionGroup
    ): { title: string; html: boolean; customClass: string; boundary: string } | null {
      if (!group.root) return null;
      const meta = [
        this.buildTooltipMetaPill(
          group.root.responseCount === 1 ? '1 response' : `${group.root.responseCount} responses`
        ),
        group.children.length
          ? this.buildTooltipMetaPill(
              group.children.length === 1 ? '1 child' : `${group.children.length} children`
            )
          : null,
      ]
        .filter(Boolean)
        .join('');
      const rows = [
        group.root.project ? this.buildTooltipStatRow('Project', group.root.project) : null,
        group.root.sourceLabel ? this.buildTooltipStatRow('Source', group.root.sourceLabel) : null,
      ]
        .filter(Boolean)
        .join('');

      return {
        title: this.buildTooltipCard('Context', rows, meta),
        html: true,
        customClass: 'llm-chip-tooltip',
        boundary: 'viewport',
      };
    },
    formatSessionModelsMeta(modelLabels?: string[]): string | null {
      if (!modelLabels?.length) return null;
      if (modelLabels.length === 1) return modelLabels[0];
      return `Models: ${modelLabels.join(', ')}`;
    },
    sessionTitleCharWidth(char: string): number {
      return (char.codePointAt(0) || 0) <= 0x7f ? 1 : 2;
    },
    formatSessionTitle(label: string, maxUnits = 60): string {
      const chars = Array.from(label || '');
      let usedUnits = 0;
      let visible = '';
      for (const char of chars) {
        const charUnits = this.sessionTitleCharWidth(char);
        if (usedUnits + charUnits + 3 > maxUnits) {
          return `${visible.trimEnd()}...`;
        }
        visible += char;
        usedUnits += charUnits;
      }
      return label;
    },
    formatSessionTitleTooltip(
      label: string
    ): { title: string; html: boolean; customClass: string; boundary: string } | null {
      if (!label) return null;
      return {
        title: this.buildTooltipCard(
          'Title',
          `<div class="llm-chip-tooltip-row">${this.escapeTooltipHtml(label)}</div>`
        ),
        html: true,
        customClass: 'llm-chip-tooltip',
        boundary: 'viewport',
      };
    },
    formatTimelineModel(item: TimelineSession): string | null {
      if (!item.compactModelLabels.length) return null;
      if (item.compactModelLabels.length === 1) return item.compactModelLabels[0];
      return `${item.compactModelLabels[0]} +${item.compactModelLabels.length - 1}`;
    },
    formatTimelineModelTooltip(
      item: TimelineSession
    ): string | { title: string; html: boolean; customClass: string; boundary: string } | null {
      if (!item.modelLabels.length) return null;
      const meta = [
        this.buildTooltipMetaPill(
          item.modelLabels.length === 1 ? '1 model' : `${item.modelLabels.length} models`
        ),
        this.buildTooltipMetaPill(`${this.formatTokenNumber(item.totalTokens)} tok`),
        this.buildTooltipMetaPill(this.formatDuration(item.activeDurationSec)),
      ].join('');
      const rowsHtml = item.modelBreakdown?.length
        ? item.modelBreakdown
            .map(model =>
              this.buildTooltipModelRow(
                model.label,
                [
                  `${this.formatTokenNumber(model.totalTokens)} tok`,
                  model.responseCount === 1 ? '1 response' : `${model.responseCount} responses`,
                ].join(' · ')
              )
            )
            .join('')
        : item.modelLabels
            .map(
              label => `<div class="llm-chip-tooltip-row">${this.escapeTooltipHtml(label)}</div>`
            )
            .join('');
      return {
        title: this.buildTooltipCard(
          item.modelLabels.length === 1 ? 'Model' : 'Models',
          rowsHtml,
          meta
        ),
        html: true,
        customClass: 'llm-chip-tooltip',
        boundary: 'viewport',
      };
    },
    buildTooltipCard(title: string | null, body: string, meta = ''): string {
      return [
        '<div class="llm-chip-tooltip-card">',
        title || meta
          ? [
              '<div class="llm-chip-tooltip-head">',
              title
                ? `<div class="llm-chip-tooltip-title">${this.escapeTooltipHtml(title)}</div>`
                : '',
              meta ? `<div class="llm-chip-tooltip-meta">${meta}</div>` : '',
              '</div>',
            ].join('')
          : '',
        body ? `<div class="llm-chip-tooltip-body">${body}</div>` : '',
        '</div>',
      ].join('');
    },
    buildTooltipMetaPill(value: string): string {
      return `<span class="llm-chip-tooltip-pill">${this.escapeTooltipHtml(value)}</span>`;
    },
    buildTooltipModelRow(label: string, meta: string): string {
      return [
        '<div class="llm-chip-tooltip-model-row">',
        `<div class="llm-chip-tooltip-model-label">${this.escapeTooltipHtml(label)}</div>`,
        `<div class="llm-chip-tooltip-model-meta">${this.escapeTooltipHtml(meta)}</div>`,
        '</div>',
      ].join('');
    },
    buildTooltipStatRow(label: string, value: string): string {
      return [
        '<div class="llm-chip-tooltip-stat">',
        `<span class="llm-chip-tooltip-key">${this.escapeTooltipHtml(label)}</span>`,
        `<span class="llm-chip-tooltip-value">${this.escapeTooltipHtml(value)}</span>`,
        '</div>',
      ].join('');
    },
    escapeTooltipHtml(value: string): string {
      return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },
    formatSessionRange(startLabel: string, endLabel: string): string {
      const sameDayMatch =
        /^(\d{2}-\d{2}) (\d{2}:\d{2})$/.exec(startLabel) &&
        /^(\d{2}-\d{2}) (\d{2}:\d{2})$/.exec(endLabel);
      if (sameDayMatch) {
        const startMatch = /^(\d{2}-\d{2}) (\d{2}:\d{2})$/.exec(startLabel);
        const endMatch = /^(\d{2}-\d{2}) (\d{2}:\d{2})$/.exec(endLabel);
        if (startMatch && endMatch && startMatch[1] === endMatch[1]) {
          return `${startMatch[1]} ${startMatch[2]}-${endMatch[2]}`;
        }
      }
      return `${startLabel} - ${endLabel}`;
    },
    timelineTooltip(item: TimelineSession) {
      return [item.label, `${item.startLabel} - ${item.endLabel}`, item.meta].join('\n');
    },
    sessionSpanStyle(item: TimelineSession) {
      return {
        left: `${clamp(item.leftPct, 0, 100)}%`,
        width: `${Math.min(item.widthPct, 100 - clamp(item.leftPct, 0, 100))}%`,
      };
    },
    sessionSegmentStyle(segment: TimelineSegment) {
      return {
        left: `${clamp(segment.leftPct, 0, 100)}%`,
        width: `${Math.min(segment.widthPct, 100 - clamp(segment.leftPct, 0, 100))}%`,
      };
    },
    timelineTickStyle(tick: TimelineTick) {
      return {
        left: `${clamp(tick.leftPct, 0, 100)}%`,
      };
    },
    sessionRailStyle() {
      const stepPct =
        this.timelineTicks.length > 1
          ? Math.max(this.timelineTicks[1].leftPct - this.timelineTicks[0].leftPct, 1)
          : 20;
      return {
        '--timeline-step': `${stepPct}%`,
      };
    },
  },
};
</script>

<style scoped lang="scss">
@import '../style/globals';

.llm-panel ::v-deep .card {
  border-color: $lightBorderColor;
}

.metric-label {
  color: #6b7280;
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.metric-label-inline {
  font-size: 0.72rem;
}

.metric-value {
  margin-top: 0.35rem;
  color: $textColor;
  font-size: 1.02rem;
  font-weight: 600;
}

.metric-value-compact {
  margin-top: 0.14rem;
  font-size: 1.08rem;
}

.metric-inline {
  white-space: nowrap;
  color: $textColor;
  font-size: 0.92rem;
  font-weight: 600;
}

.token-matrix {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 1.25rem;
}

.token-cell {
  padding: 0.4rem 0 0.45rem;
  border-top: 1px solid $lightBorderColor;
}

.timeline-meta {
  margin-bottom: 0.45rem;
  font-size: 0.9em;
  opacity: 0.72;
}

.timeline-meta-list + .timeline-meta-list {
  margin-top: 0.12rem;
}

.timeline-shell {
  border-top: 1px solid $lightBorderColor;
}

.timeline-ruler {
  padding: 0.18rem 0 0.45rem;
}

.timeline-ruler-track {
  position: relative;
  height: 1.7rem;
  border-bottom: 1px solid #e5e7eb;
}

.timeline-ruler-tick {
  position: absolute;
  top: 0;
}

.timeline-ruler-tick.is-center .timeline-ruler-label,
.timeline-ruler-tick.is-center .timeline-ruler-mark {
  transform: translateX(-50%);
}

.timeline-ruler-tick.is-end .timeline-ruler-label,
.timeline-ruler-tick.is-end .timeline-ruler-mark {
  transform: translateX(-100%);
}

.timeline-ruler-label {
  position: absolute;
  top: 0;
  left: 0;
  white-space: nowrap;
  color: #758396;
  font-size: 0.7rem;
  font-weight: 400;
}

.timeline-ruler-mark {
  position: absolute;
  top: 1.25rem;
  left: 0;
  width: 1px;
  height: 0.45rem;
  background: #e2e8f0;
}

.session-timeline {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.thread-group {
  border-bottom: 1px solid $lightBorderColor;
}

.thread-group:last-child {
  border-bottom: 0;
}

.session-row {
  display: block;
  padding: 0.46rem 0;
  background: transparent;
}

.session-meta {
  min-width: 0;
}

.session-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.session-heading-main {
  min-width: 0;
  flex: 1 1 auto;
}

.session-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  width: 100%;
  gap: 0.26rem 0.36rem;
}

.session-title {
  min-width: 0;
  flex: 1 1 14rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: $textColor;
  font-weight: 600;
  font-size: 0.9rem;
  line-height: 1.2;
}

.session-context-chip {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  max-width: 20rem;
  gap: 0.3rem;
  padding: 0.14rem 0.22rem 0.14rem 0.18rem;
  overflow: hidden;
  border: 1px solid #d9e3ef;
  border-radius: 999px;
  color: #526172;
  background: linear-gradient(180deg, #fdfefe, #f6f9fc);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.92), 0 1px 2px rgba(15, 23, 42, 0.04);
  font-size: 0.68rem;
  font-weight: 600;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-context-project-pill {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  max-width: 100%;
  padding: 0.12rem 0.42rem;
  overflow: hidden;
  border: 1px solid #d6e3f3;
  border-radius: 999px;
  background: #eaf3ff;
}

.session-context-source-tag {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  max-width: 100%;
  padding: 0.1rem 0.34rem;
  overflow: hidden;
  border: 1px solid #e3e8ef;
  border-radius: 999px;
  background: #ffffff;
}

.session-context-source {
  overflow: hidden;
  color: #5b6978;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-context-project {
  overflow: hidden;
  text-overflow: ellipsis;
  color: #2d4b6f;
  font-weight: 700;
  white-space: nowrap;
}

.session-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 0.32rem 0.4rem;
  font-size: 0.72rem;
  line-height: 1.25;
}

.session-summary-inline {
  margin-top: 0;
  justify-content: flex-end;
  flex: 0 0 auto;
}

.session-summary-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  min-width: 0;
  padding: 0.14rem 0.46rem;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  background: #ffffff;
}

.session-summary-kicker {
  max-width: 100%;
  overflow: hidden;
  color: #8a95a5;
  font-size: 0.53rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-summary-item {
  max-width: 100%;
  overflow: hidden;
  color: #556273;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-summary-chip.is-time {
  background: #fbfcfd;
}

.session-summary-item.is-time {
  color: #334155;
}

.session-summary-chip.is-model {
  border-color: #dde6f1;
  background: #fafcff;
}

.session-summary-item.is-model {
  color: #39557b;
}

.session-summary-chip.is-tokens,
.session-summary-chip.is-responses {
  background: #ffffff;
}

.session-summary-chip.is-tokens {
  border-color: #efe3d3;
  background: #fffdfa;
}

.session-summary-item.is-tokens,
.session-summary-item.is-responses {
  color: #334155;
}

.session-summary-item.is-tokens {
  color: #8b6b3f;
}

.session-summary-chip.is-responses {
  border-color: #dbe6ec;
  background: #fbfdff;
}

.session-summary-item.is-responses {
  color: #4f7184;
}

.session-rail-wrap {
  position: relative;
  min-height: 1.05rem;
  display: flex;
  align-items: center;
  margin-top: 0.3rem;
}

.session-rail {
  position: relative;
  width: 100%;
  height: 0.58rem;
  border-radius: 999px;
  background: linear-gradient(to right, rgba(148, 163, 184, 0.08) 1px, transparent 1px) left top /
      var(--timeline-step, 20%) 100% repeat-x,
    #f9fbfd;
  overflow: hidden;
  border: 1px solid #e7edf5;
}

.session-span,
.session-active {
  position: absolute;
  top: 0;
  bottom: 0;
  min-width: 2px;
  border-radius: 999px;
}

.session-span {
  background: #dbe4f0;
}

.session-active {
  background: #6f8ec0;
}

.list-group-item {
  border-color: $lightBorderColor;
}

.llm-panel ::v-deep .llm-chip-tooltip .tooltip-inner {
  width: max-content;
  max-width: min(36rem, calc(100vw - 1.5rem));
  white-space: normal;
  text-align: left;
  color: #263445;
  background: #ffffff;
  border: 1px solid #dbe4ef;
  border-radius: 0.8rem;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.16);
  padding: 0.56rem 0.62rem;
}

.llm-panel ::v-deep .llm-chip-tooltip.bs-tooltip-top .arrow::before,
.llm-panel ::v-deep .llm-chip-tooltip.bs-tooltip-auto[x-placement^='top'] .arrow::before {
  border-top-color: #dbe4ef;
}

.llm-panel ::v-deep .llm-chip-tooltip.bs-tooltip-bottom .arrow::before,
.llm-panel ::v-deep .llm-chip-tooltip.bs-tooltip-auto[x-placement^='bottom'] .arrow::before {
  border-bottom-color: #dbe4ef;
}

.llm-panel ::v-deep .llm-chip-tooltip.bs-tooltip-left .arrow::before,
.llm-panel ::v-deep .llm-chip-tooltip.bs-tooltip-auto[x-placement^='left'] .arrow::before {
  border-left-color: #dbe4ef;
}

.llm-panel ::v-deep .llm-chip-tooltip.bs-tooltip-right .arrow::before,
.llm-panel ::v-deep .llm-chip-tooltip.bs-tooltip-auto[x-placement^='right'] .arrow::before {
  border-right-color: #dbe4ef;
}

.llm-panel ::v-deep .llm-chip-tooltip-card {
  display: flex;
  flex-direction: column;
  gap: 0.46rem;
}

.llm-panel ::v-deep .llm-chip-tooltip-head {
  display: flex;
  flex-direction: column;
  gap: 0.38rem;
}

.llm-panel ::v-deep .llm-chip-tooltip-title {
  color: #708195;
  font-size: 0.67rem;
  font-weight: 700;
  line-height: 1;
}

.llm-panel ::v-deep .llm-chip-tooltip-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.28rem;
}

.llm-panel ::v-deep .llm-chip-tooltip-pill {
  display: inline-flex;
  align-items: center;
  padding: 0.14rem 0.42rem;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  background: #f8fafc;
  color: #516173;
  font-size: 0.69rem;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
}

.llm-panel ::v-deep .llm-chip-tooltip-body {
  display: flex;
  flex-direction: column;
  gap: 0.26rem;
}

.llm-panel ::v-deep .llm-chip-tooltip-row {
  display: block;
  padding: 0.34rem 0.46rem;
  border: 1px solid #e7edf5;
  border-radius: 0.6rem;
  background: #f8fafc;
  color: #233142;
  font-size: 0.74rem;
  font-weight: 600;
  white-space: nowrap;
}

.llm-panel ::v-deep .llm-chip-tooltip-stat {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  min-width: 12rem;
  white-space: nowrap;
}

.llm-panel ::v-deep .llm-chip-tooltip-stat + .llm-chip-tooltip-stat {
  margin-top: 0.22rem;
}

.llm-panel ::v-deep .llm-chip-tooltip-key {
  color: #718096;
  font-size: 0.68rem;
  font-weight: 600;
}

.llm-panel ::v-deep .llm-chip-tooltip-value {
  color: #233142;
  font-size: 0.72rem;
  font-weight: 700;
}

@media (max-width: 991.98px) {
  .token-matrix {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }

  .timeline-meta {
    margin-bottom: 0.38rem;
  }

  .timeline-ruler {
    padding: 0.14rem 0 0.42rem;
  }

  .session-heading {
    display: block;
  }

  .session-title-row {
    gap: 0.28rem 0.34rem;
  }

  .session-title {
    flex-basis: 100%;
    white-space: normal;
  }

  .session-summary-inline {
    margin-top: 0.22rem;
    justify-content: flex-start;
  }
}
</style>

<style lang="scss">
.llm-chip-tooltip .tooltip-inner {
  width: max-content;
  max-width: min(56rem, calc(100vw - 1rem));
  padding: 0.56rem 0.62rem;
  text-align: left;
  white-space: normal;
  color: #263445;
  background: #ffffff;
  border: 1px solid #dbe4ef;
  border-radius: 0.8rem;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.16);
}

.llm-chip-tooltip.bs-tooltip-top .arrow::before,
.llm-chip-tooltip.bs-tooltip-auto[x-placement^='top'] .arrow::before {
  border-top-color: #dbe4ef;
}

.llm-chip-tooltip.bs-tooltip-bottom .arrow::before,
.llm-chip-tooltip.bs-tooltip-auto[x-placement^='bottom'] .arrow::before {
  border-bottom-color: #dbe4ef;
}

.llm-chip-tooltip.bs-tooltip-left .arrow::before,
.llm-chip-tooltip.bs-tooltip-auto[x-placement^='left'] .arrow::before {
  border-left-color: #dbe4ef;
}

.llm-chip-tooltip.bs-tooltip-right .arrow::before,
.llm-chip-tooltip.bs-tooltip-auto[x-placement^='right'] .arrow::before {
  border-right-color: #dbe4ef;
}

.llm-chip-tooltip .llm-chip-tooltip-card {
  display: flex;
  flex-direction: column;
  gap: 0.46rem;
}

.llm-chip-tooltip .llm-chip-tooltip-head {
  display: flex;
  flex-direction: column;
  gap: 0.38rem;
}

.llm-chip-tooltip .llm-chip-tooltip-title {
  color: #708195;
  font-size: 0.67rem;
  font-weight: 700;
  line-height: 1;
}

.llm-chip-tooltip .llm-chip-tooltip-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.28rem;
}

.llm-chip-tooltip .llm-chip-tooltip-pill {
  display: inline-flex;
  align-items: center;
  padding: 0.14rem 0.42rem;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  background: #f8fafc;
  color: #516173;
  font-size: 0.69rem;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
}

.llm-chip-tooltip .llm-chip-tooltip-body {
  display: flex;
  flex-direction: column;
  gap: 0.26rem;
}

.llm-chip-tooltip .llm-chip-tooltip-row {
  display: block;
  padding: 0.34rem 0.46rem;
  border: 1px solid #e7edf5;
  border-radius: 0.6rem;
  background: #f8fafc;
  color: #233142;
  font-size: 0.74rem;
  font-weight: 600;
  white-space: break-spaces;
  overflow-wrap: anywhere;
}

.llm-chip-tooltip .llm-chip-tooltip-model-row {
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
  padding: 0.36rem 0.48rem;
  border: 1px solid #e7edf5;
  border-radius: 0.62rem;
  background: #f8fafc;
}

.llm-chip-tooltip .llm-chip-tooltip-model-label {
  color: #233142;
  font-size: 0.74rem;
  font-weight: 600;
  line-height: 1.25;
  white-space: break-spaces;
  overflow-wrap: anywhere;
}

.llm-chip-tooltip .llm-chip-tooltip-model-meta {
  color: #6b7b8d;
  font-size: 0.67rem;
  font-weight: 600;
  line-height: 1.2;
}

.llm-chip-tooltip .llm-chip-tooltip-stat {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  min-width: 14rem;
}

.llm-chip-tooltip .llm-chip-tooltip-stat + .llm-chip-tooltip-stat {
  margin-top: 0.22rem;
}

.llm-chip-tooltip .llm-chip-tooltip-key {
  color: #718096;
  font-size: 0.68rem;
  font-weight: 600;
  white-space: nowrap;
}

.llm-chip-tooltip .llm-chip-tooltip-value {
  color: #233142;
  font-size: 0.72rem;
  font-weight: 700;
  white-space: break-spaces;
  text-align: right;
}
</style>
