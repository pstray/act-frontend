import { action, computed, observable } from 'mobx';
import * as _ from 'lodash/fp';

import config from '../../config';
import getStyle from '../../core/cytoscapeStyle';
import { objectFactsToElements } from '../../core/cytoscapeTransformers';
import { ActFact, ActObject, ActSelection, isFactSearch, isObjectSearch, SearchResult, Search } from '../types';
import MainPageStore from '../MainPageStore';

const cytoscapeNodeToSelection = (node: any): ActSelection => {
  return {
    id: node.data('isFact') ? node.data('factId') : node.id(),
    kind: node.data('isFact') ? 'fact' : 'object'
  };
};

const selectionToCytoscapeNodeId = (selection: ActSelection) => {
  return selection.kind === 'fact' ? 'edge-' + selection.id : selection.id;
};

export const highlights = (factIds: Array<string>, facts: { [factId: string]: ActFact }) => {
  if (factIds.length !== 1 || !facts[factIds[0]]) {
    return [];
  }

  const selectedFact = facts[factIds[0]];

  if (selectedFact.timestamp === selectedFact.lastSeenTimestamp) {
    return [{ value: new Date(selectedFact.timestamp) }];
  }
  return [{ value: new Date(selectedFact.timestamp) }, { value: new Date(selectedFact.lastSeenTimestamp) }];
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

    return {
      canRender: canRender,
      resizeEvent: this.resizeEvent,
      selectedNodeIds: new Set(
        Object.values(this.root.selectionStore.currentlySelected).map(selectionToCytoscapeNodeId)
      ),
      elements: this.cytoscapeElements,
      layout: this.root.ui.cytoscapeLayoutStore.layout.layoutObject,
      layoutConfig: this.root.ui.cytoscapeLayoutStore.layout.layoutObject,
      cytoscapeLayoutStore: this.root.ui.cytoscapeLayoutStore,

      style: getStyle({ showEdgeLabels: this.root.ui.cytoscapeLayoutStore.showFactEdgeLabels }),
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

  @computed
  get timeline() {
    const timeData = _.map((f: ActFact) => ({ value: new Date(f.timestamp) }))(
      Object.values(this.root.refineryStore.refined.facts)
    );

    return {
      resizeEvent: this.resizeEvent,
      timeRange: this.root.refineryStore.timeRange,
      highlights: highlights(this.root.selectionStore.currentlySelectedFactIds, this.root.workingHistory.result.facts),
      data: timeData
    };
  }
}

export default GraphViewStore;
