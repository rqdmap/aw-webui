import { defineStore } from 'pinia';
import { useSettingsStore } from './settings';

interface IElement {
  type: string;
  size?: number;
  props?: Record<string, unknown>;
}

export interface View {
  id: string;
  name: string;
  elements: IElement[];
}

const LLM_SUMMARY_ELEMENTS: IElement[] = [
  { type: 'llm_tokens', size: 3 },
  { type: 'llm_sources', size: 3 },
  { type: 'llm_models', size: 3 },
  { type: 'llm_sessions', size: 3 },
  { type: 'llm_projects', size: 3 },
  { type: 'llm_barchart', size: 3 },
  { type: 'llm_concurrency', size: 3 },
  { type: 'llm_timeline', size: 3 },
];
const LLM_ELEMENT_TYPES = new Set([
  ...LLM_SUMMARY_ELEMENTS.map(element => element.type),
  'llm_activity',
]);

function ensureSummaryHasLLM(views: View[] = []): View[] {
  return views.map(view => {
    let elements = [...view.elements];

    if (elements.some(element => element.type === 'llm_activity')) {
      elements = elements.flatMap(element => {
        if (element.type !== 'llm_activity') return [{ ...element }];
        if (view.id === 'summary') {
          return LLM_SUMMARY_ELEMENTS.map(llmElement => ({ ...llmElement }));
        }
        return [{ type: 'llm_timeline', size: element.size, props: element.props }];
      });
    } else {
      elements = elements.map(element => ({ ...element }));
    }

    if (view.id !== 'summary') {
      return { ...view, elements };
    }

    const presentTypes = new Set(elements.map(element => element.type));
    const missingElements = LLM_SUMMARY_ELEMENTS.filter(element => !presentTypes.has(element.type));

    if (!missingElements.length) {
      return { ...view, elements };
    }

    let insertIndex = elements.reduce(
      (index, element, currentIndex) =>
        LLM_ELEMENT_TYPES.has(element.type) ? currentIndex + 1 : index,
      -1
    );
    if (insertIndex < 0) {
      const timelineIndex = elements.findIndex(element => element.type === 'timeline_barchart');
      insertIndex = timelineIndex >= 0 ? timelineIndex + 1 : elements.length;
    }
    elements.splice(insertIndex, 0, ...missingElements.map(element => ({ ...element })));
    return { ...view, elements };
  });
}

const desktopViews: View[] = [
  {
    id: 'summary',
    name: 'Summary',
    elements: [
      { type: 'top_apps', size: 3 },
      { type: 'top_titles', size: 3 },
      { type: 'timeline_barchart', size: 3 },
      { type: 'llm_tokens', size: 3 },
      { type: 'llm_sources', size: 3 },
      { type: 'llm_models', size: 3 },
      { type: 'llm_sessions', size: 3 },
      { type: 'llm_projects', size: 3 },
      { type: 'llm_barchart', size: 3 },
      { type: 'llm_concurrency', size: 3 },
      { type: 'llm_timeline', size: 3 },
      { type: 'top_categories', size: 3 },
      { type: 'category_tree', size: 3 },
      { type: 'category_sunburst', size: 3 },
    ],
  },
  {
    id: 'window',
    name: 'Window',
    elements: [
      { type: 'top_apps', size: 3 },
      { type: 'top_titles', size: 3 },
    ],
  },
  {
    id: 'browser',
    name: 'Browser',
    elements: [
      { type: 'top_domains', size: 3 },
      { type: 'top_urls', size: 3 },
      { type: 'top_browser_titles', size: 3 },
    ],
  },
  {
    id: 'editor',
    name: 'Editor',
    elements: [
      { type: 'top_editor_files', size: 3 },
      { type: 'top_editor_projects', size: 3 },
      { type: 'top_editor_languages', size: 3 },
    ],
  },
];

const androidViews = [
  {
    id: 'summary',
    name: 'Summary',
    elements: [
      { type: 'top_apps', size: 3 },
      { type: 'top_categories', size: 3 },
      { type: 'timeline_barchart', size: 3 },
      { type: 'llm_tokens', size: 3 },
      { type: 'llm_sources', size: 3 },
      { type: 'llm_models', size: 3 },
      { type: 'llm_sessions', size: 3 },
      { type: 'llm_projects', size: 3 },
      { type: 'llm_barchart', size: 3 },
      { type: 'llm_concurrency', size: 3 },
      { type: 'llm_timeline', size: 3 },
      { type: 'category_tree', size: 3 },
      { type: 'category_sunburst', size: 3 },
    ],
  },
];

// FIXME: Decide depending on what kind of device is being viewed, not from which device it is being viewed from.
export const defaultViews = !process.env.VUE_APP_ON_ANDROID ? desktopViews : androidViews;

interface State {
  views: View[];
}

export const useViewsStore = defineStore('views', {
  state: (): State => ({
    views: [],
  }),
  getters: {
    getViewById: state => (id: string) => state.views.find(view => view.id === id),
  },
  actions: {
    async load() {
      const settingsStore = useSettingsStore();
      await settingsStore.ensureLoaded();
      const views =
        settingsStore.views && settingsStore.views.length ? settingsStore.views : defaultViews;
      this.loadViews(views);
    },
    async save() {
      const settingsStore = useSettingsStore();
      settingsStore.update({ views: this.views });
      await this.load();
    },
    loadViews(views: View[]) {
      this.$patch({ views: ensureSummaryHasLLM(views) });
      console.log('Loaded views:', this.views);
    },
    clearViews(this: State) {
      this.views = [];
    },
    setElements(this: State, { view_id, elements }: { view_id: string; elements: IElement[] }) {
      this.views.find(v => v.id == view_id).elements = elements;
    },
    restoreDefaults(this: State) {
      this.views = ensureSummaryHasLLM(defaultViews);
    },
    addView(this: State, view: View) {
      this.views.push({ ...view, elements: [] });
    },
    removeView(this: State, { view_id }) {
      const idx = this.views.map(v => v.id).indexOf(view_id);
      this.views.splice(idx, 1);
    },
    editView(
      this: State,
      {
        view_id,
        el_id,
        type,
        props,
      }: { view_id: string; el_id: string; type: string; props: Record<string, unknown> }
    ) {
      console.log(view_id, el_id, type, props);
      console.log(this.views);
      const element = this.views.find(v => v.id == view_id).elements[el_id];
      element.type = type;
      element.props = props;
    },
    addVisualization(this: State, { view_id, type }) {
      this.views.find(v => v.id == view_id).elements.push({ type: type });
    },
    removeVisualization(this: State, { view_id, el_id }) {
      this.views.find(v => v.id == view_id).elements.splice(el_id, 1);
    },
  },
});
