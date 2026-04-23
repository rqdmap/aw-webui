<template lang="pug">
div(v-if="series")
  chart-line(:chart-data="chartData" :chart-options="chartOptions" :height="220")
div.small(v-else, style="font-size: 16pt; color: #aaa;")
  | No data
</template>

<script lang="ts">
import { ChartOptions } from 'chart.js';
import 'chart.js/auto';
import { Line } from 'vue-chartjs/legacy';

function smoothSeries(values: number[], windowSize: number): number[] {
  if (windowSize <= 1 || values.length <= 2) return [...values];
  const halfWindow = Math.floor(windowSize / 2);
  return values.map((_, index) => {
    const start = Math.max(0, index - halfWindow);
    const end = Math.min(values.length, index + halfWindow + 1);
    const slice = values.slice(start, end);
    if (!slice.length) return 0;
    const average = slice.reduce((sum, value) => sum + value, 0) / slice.length;
    return Math.round(average * 100) / 100;
  });
}

function smoothingWindowSize(bucketMinutes: number): number {
  if (bucketMinutes <= 15) return 5;
  if (bucketMinutes < 24 * 60) return 3;
  return 3;
}

export default {
  name: 'aw-llm-concurrency-chart',
  components: { 'chart-line': Line },
  props: {
    series: {
      type: Object,
      default: null,
    },
  },
  computed: {
    smoothedValues() {
      const rawValues = this.series?.values || [];
      const bucketMinutes = this.series?.bucketMinutes || 60;
      const windowSize = smoothingWindowSize(bucketMinutes);
      return smoothSeries(rawValues, windowSize);
    },
    chartData() {
      if (!this.series) {
        return { labels: [], datasets: [] };
      }
      return {
        labels: this.series.labels,
        datasets: [
          {
            label: 'Concurrency',
            data: this.smoothedValues,
            borderColor: '#4b7bec',
            backgroundColor: 'rgba(75, 123, 236, 0.18)',
            fill: 'origin',
            tension: 0.35,
            cubicInterpolationMode: 'monotone',
            pointRadius: 0,
            pointHoverRadius: 3,
            pointHitRadius: 12,
            borderWidth: 2,
            borderJoinStyle: 'round',
            borderCapStyle: 'round',
          },
        ],
      };
    },
    chartOptions(): ChartOptions {
      const pointCount = this.series?.labels?.length || 0;
      const maxValue = this.series?.maxValue || 1;
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
                const rawValue = this.series?.values?.[index] || 0;
                return `Peak concurrency: ${Math.round(rawValue)} roots`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: {
              color: 'rgba(148, 163, 184, 0.08)',
              tickLength: 0,
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
            suggestedMax: Math.max(maxValue + 0.5, 1),
            grid: {
              color: 'rgba(148, 163, 184, 0.08)',
            },
            ticks: {
              stepSize: 1,
              precision: 0,
            },
          },
        },
      };
    },
  },
};
</script>
