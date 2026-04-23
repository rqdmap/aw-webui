<template lang="pug">
div(v-if="series")
  chart-line(:chart-data="chartData" :chart-options="chartOptions" :height="250")
div.small(v-else, style="font-size: 16pt; color: #aaa;")
  | No data
</template>

<script lang="ts">
import { ChartOptions } from 'chart.js';
import 'chart.js/auto';
import { Line } from 'vue-chartjs/legacy';

function hourToTick(hours: number): string {
  if (hours > 1) {
    return `${hours}h`;
  } else {
    if (hours == 1) {
      return '1h';
    } else if (hours == 0) {
      return '0';
    } else {
      return Math.round(hours * 60) + 'm';
    }
  }
}

function durationLabel(hours: number): string {
  let wholeHours = Math.floor(hours);
  let minutes = Math.round((hours - wholeHours) * 60);
  if (minutes == 60) {
    minutes = 0;
    wholeHours += 1;
  }
  const minutesStr = minutes.toString().padStart(2, '0');
  return `${wholeHours}:${minutesStr}`;
}

function roundUp(value: number, step: number): number {
  if (!Number.isFinite(value) || value <= 0) return step;
  return Math.ceil(value / step) * step;
}

function pickTightStep(maxValue: number): number {
  if (maxValue <= 0.4) return 0.05;
  if (maxValue <= 1.2) return 0.1;
  if (maxValue <= 3) return 0.25;
  if (maxValue <= 6) return 0.5;
  return 1;
}

export default {
  name: 'aw-llm-rhythm-chart',
  components: { 'chart-line': Line },
  props: {
    series: {
      type: Object,
      default: null,
    },
  },
  computed: {
    yStepSize() {
      const rawValues = this.series?.rawValues || [];
      const smoothValues = this.series?.smoothValues || [];
      const maxValue = Math.max(0, ...rawValues, ...smoothValues);
      if (this.series?.foldedToDay || this.series?.bucketMinutes < 60) {
        return pickTightStep(maxValue);
      }
      return 1;
    },
    ySuggestedMax() {
      const rawValues = this.series?.rawValues || [];
      const smoothValues = this.series?.smoothValues || [];
      const maxValue = Math.max(0, ...rawValues, ...smoothValues);
      if (this.series?.foldedToDay || this.series?.bucketMinutes < 60) {
        return Math.max(this.yStepSize, roundUp(maxValue * 1.08, this.yStepSize));
      }
      return undefined;
    },
    chartData() {
      if (!this.series) {
        return { labels: [], datasets: [] };
      }
      return {
        labels: this.series.labels,
        datasets: [
          {
            label: 'Rhythm',
            data: this.series.smoothValues,
            borderColor: '#4b7bec',
            backgroundColor: 'rgba(75, 123, 236, 0.18)',
            fill: 'origin',
            tension: 0.35,
            cubicInterpolationMode: 'monotone',
            pointRadius: 0,
            pointHoverRadius: 3,
            pointHitRadius: 12,
            borderWidth: 2,
          },
        ],
      };
    },
    chartOptions(): ChartOptions {
      const pointCount = this.series?.labels?.length || 0;
      return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              title: items => {
                const index = items?.[0]?.dataIndex ?? 0;
                return this.series?.rangeLabels?.[index] || this.series?.labels?.[index] || '';
              },
              label: context => {
                const index = context.dataIndex ?? 0;
                const rawValue = this.series?.rawValues?.[index] || 0;
                return `${this.series?.foldedToDay ? 'Avg active' : 'Active'}: ${durationLabel(
                  rawValue
                )}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: {
              display: false,
            },
            ticks: {
              autoSkip: true,
              maxTicksLimit: pointCount > 60 ? 8 : pointCount > 20 ? 10 : 12,
              maxRotation: 0,
              minRotation: 0,
            },
          },
          y: {
            min: 0,
            suggestedMax: this.ySuggestedMax,
            ticks: {
              callback: hourToTick,
              stepSize: this.yStepSize,
              maxTicksLimit: 6,
            },
          },
        },
      };
    },
  },
};
</script>
