import { action, computed, observable } from 'mobx';

import config from '../../config';
import getStyle from '../../core/cytoscapeStyle';
import { objectFactsToElements } from '../../core/cytoscapeTransformers';
import { ActFact, ActObject, ActSelection, isFactSearch, isObjectSearch, SearchResult, Search } from '../types';
import MainPageStore from '../MainPageStore';
import { notUndefined } from '../../util/util';
import { isOneLegged } from '../../core/transformers';

const cytoscapeNodeToSelection = (node: any): ActSelection => {
  return {
    id: node.data('isFact') ? node.data('factId') : node.id(),
    kind: node.data('isFact') ? 'fact' : 'object'
  };
};

export const selectionToCytoscapeNodeId = (selection: ActSelection) => {
  return selection.kind === 'fact' ? 'edge-' + selection.id : selection.id;
};

export const selectedNodeIds = (selection: Array<ActSelection>, searchResult: SearchResult) => {
  const selected = selection.map(selectionToCytoscapeNodeId);

  // Include any objects that one-legged-facts are referring to
  const objectIdsWithOneLeggedFacts = selection
    .filter(x => x.kind === 'fact')
    .map(f => searchResult.facts[f.id])
    .filter(notUndefined)
    .filter(isOneLegged)
    .map(f => f.sourceObject && f.sourceObject.id)
    .filter(notUndefined);

  return new Set([...selected, ...objectIdsWithOneLeggedFacts]);
};

class GraphViewStore {
  root: MainPageStore;

  renderThreshold: number = 2000;
  @observable resizeEvent = 0; // Used to trigger rerendering of the cytoscape element when it changes
  @observable acceptRenderWarning = false;
  @observable showTimeline = true;

  constructor(root: MainPageStore) {
    this.root = root;
  }

  @action
  acceptRenderWarningOnClick() {
    this.acceptRenderWarning = true;
  }

  @action.bound rerender() {
    this.resizeEvent = new Date().getTime();
  }

  @computed get cytoscapeElements() {
    const res: SearchResult = this.root.refineryStore.refined;

    return objectFactsToElements({
      facts: Object.values(res.facts),
      objects: Object.values(res.objects),
      objectLabelFromFactType: config.objectLabelFromFactType
    });
  }

  @action.bound
  toggleShowTimeline() {
    this.showTimeline = !this.showTimeline;
  }

  @computed
  get prepared() {
    const canRender = this.acceptRenderWarning || this.cytoscapeElements.length < this.renderThreshold;

    const selected = selectedNodeIds(
      Object.values(this.root.selectionStore.currentlySelected),
      this.root.refineryStore.refined
    );

    return {
      canRender: canRender,
      resizeEvent: this.resizeEvent,
      selectedNodeIds: selected,
      elements: this.cytoscapeElements,
      layout: this.root.ui.cytoscapeLayoutStore.layout.layoutObject,
      layoutConfig: this.root.ui.cytoscapeLayoutStore.layout.layoutObject,
      cytoscapeLayoutStore: this.root.ui.cytoscapeLayoutStore,

      style: getStyle({
        showEdgeLabels: this.root.ui.cytoscapeLayoutStore.showFactEdgeLabels,
        fadeUnselected: selected.size > 1 && this.root.ui.detailsStore.fadeUnselected
      }),
      onNodeClick: (node: any) => {
        node.select();
      },
      onNodeCtxClick: (node: any) => {
        node.select();
      },
      onNodeDoubleClick: (node: any) => {
        if (node.data('isFact')) return;
        this.root.backendStore.executeSearch({ objectType: node.data('type'), objectValue: node.data('value') });
      },
      onSelect: (selection: Array<any>) => {
        this.root.selectionStore.setCurrentlySelected(
          selection.map(cytoscapeNodeToSelection).reduce((acc: any, x: ActSelection) => ({ ...acc, [x.id]: x }), {})
        );
      },
      onUnselect: (selection: Array<any>) => {
        this.root.selectionStore.removeAllFromSelection(selection.map(cytoscapeNodeToSelection));
      }
    };
  }

  @action
  setSelectedNodeBasedOnSearch(search: Search) {
    if (isObjectSearch(search)) {
      const searchedNode = Object.values(this.root.refineryStore.refined.objects).find(
        (object: ActObject) => object.type.name === search.objectType && object.value === search.objectValue
      );
      if (searchedNode && !search.query) {
        this.root.selectionStore.setCurrentSelection({ id: searchedNode.id, kind: 'object' });
      }
    } else if (isFactSearch(search)) {
      const searchedNode = Object.values(this.root.refineryStore.refined.facts).find(
        (fact: ActFact) => fact.id === search.id
      );
      if (searchedNode) {
        this.root.selectionStore.setCurrentSelection({ id: searchedNode.id, kind: 'fact' });
      }
    } else {
      // eslint-disable-next-line
      const _exhaustiveCheck: never = search;
    }
  }

  @action.bound
  onBinClick(bin: Array<{ id: string }>) {
    const selection = bin.reduce((acc: any, { id }: { id: string }) => {
      acc[id] = { kind: 'fact', id: id };
      return acc;
    }, {});
    this.root.selectionStore.setCurrentlySelected(selection);
  }

  @computed
  get timeline() {
    const selected = new Set(this.root.selectionStore.currentlySelectedFactIds);
    const timeData = Object.values(this.root.refineryStore.refined.facts).map((f: ActFact) => ({
      value: new Date(f.timestamp),
      id: f.id,
      kind: f.type.name,
      isHighlighted: selected.has(f.id)
    }));

    return {
      resizeEvent: this.resizeEvent,
      timeRange: this.root.refineryStore.timeRange,
      scatterPlot: { groups: [...new Set(timeData.map(x => x.kind))].sort().reverse(), data: timeData },
      histogram: timeData,
      onBinClick: this.onBinClick
    };
  }
}

export default GraphViewStore;
