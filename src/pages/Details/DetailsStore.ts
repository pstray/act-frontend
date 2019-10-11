import { action, computed, observable, reaction } from 'mobx';
import * as _ from 'lodash/fp';

import MainPageStore from '../MainPageStore';
import { ActFact, ActObject, Search } from '../types';
import CreateFactForDialog from '../../components/CreateFactFor/DialogStore';
import { byTypeThenName, pluralize } from '../../util/util';

export type PredefinedObjectQuery = {
  name: string;
  description: string;
  query: string;
  objects: Array<string>;
};

export type ContextAction = {
  name: string;
  description: string;
  href?: string;
  onClick?: () => void;
};

export type ContextActionTemplate = {
  objects?: Array<string>;
  action: {
    name: string;
    type: 'link' | 'postAndForget';
    description: string;
    urlPattern?: string;
    pathPattern?: string;
    confirmation?: string;
    jsonBody?: { [key: string]: any };
  };
};

export type ObjectDetails = {
  contextActions: Array<ContextAction>;
  predefinedObjectQueries: Array<PredefinedObjectQuery>;
};

const byName = (a: { name: string }, b: { name: string }) => (a.name > b.name ? 1 : -1);

const replaceAll = (s: string, replacements: { [key: string]: string }) => {
  return Object.entries(replacements).reduce((acc: string, [searchFor, replaceWith]: [string, string]) => {
    return acc.replace(searchFor, replaceWith);
  }, s);
};

export const replaceAllInObject = (
  obj: { [key: string]: any } | undefined,
  replacements: { [key: string]: string }
) => {
  if (!obj) {
    return obj;
  }

  return _.mapValues(v => (typeof v === 'string' ? replaceAll(v, replacements) : v))(obj);
};

class DetailsStore {
  root: MainPageStore;

  contextActionTemplates: Array<ContextActionTemplate>;
  predefinedObjectQueries: Array<PredefinedObjectQuery>;

  @observable createFactDialog: CreateFactForDialog | null = null;
  @observable _isOpen = false;
  @observable fadeUnselected = false;

  constructor(root: MainPageStore, config: any) {
    this.root = root;
    this.contextActionTemplates = config.contextActions || [];
    this.predefinedObjectQueries = config.predefinedObjectQueries || [];

    reaction(
      () => this.root.selectionStore.currentlySelected,
      currentlySelected => {
        if (Object.keys(currentlySelected).length > 0) {
          this.open();
        }
      }
    );
  }

  @action.bound
  onSearchSubmit(search: Search) {
    this.root.backendStore.executeSearch(search);
  }

  @computed get endTimestamp() {
    return this.root.refineryStore.endTimestamp;
  }

  @computed get selectedObject(): ActObject | null {
    const selected = Object.values(this.root.selectionStore.currentlySelected)[0];

    if (selected && selected.kind === 'object') {
      return this.root.workingHistory.result.objects[selected.id];
    } else {
      return null;
    }
  }

  @action.bound
  onPredefinedObjectQueryClick(q: PredefinedObjectQuery): void {
    const obj = this.selectedObject;
    if (obj) {
      this.root.backendStore.executeSearch({ objectType: obj.type.name, objectValue: obj.value, query: q.query });
    }
  }

  @action.bound
  close(): void {
    this._isOpen = false;
  }

  @action.bound
  open(): void {
    this._isOpen = true;
  }

  @action.bound
  toggle(): void {
    this._isOpen = !this._isOpen;
  }

  @computed
  get isOpen() {
    return this._isOpen && Boolean(this.selectedObjectDetails || this.selectedFactDetails);
  }

  @action.bound
  toggleFadeUnselected(): void {
    this.fadeUnselected = !this.fadeUnselected;
  }

  static toContextAction(
    template: ContextActionTemplate,
    selected: ActObject,
    postAndForgetFn: (url: string, jsonBody: any, successString: string) => void
  ): ContextAction {
    const replacements: { [key: string]: string } = {
      ':objectValue': selected.value,
      ':objectType': selected.type.name
    };

    switch (template.action.type) {
      case 'link':
        return {
          name: template.action.name,
          description: template.action.description,
          href: replaceAll(template.action.urlPattern || '', replacements)
        };
      case 'postAndForget':
        return {
          name: template.action.name,
          description: template.action.description,
          onClick: () => {
            if (
              template.action.confirmation === undefined ||
              (template.action.confirmation && window.confirm(template.action.confirmation))
            ) {
              const url = replaceAll(template.action.pathPattern || '', replacements);
              const jsonBody = replaceAllInObject(template.action.jsonBody, replacements);
              postAndForgetFn(url, jsonBody, 'Success: ' + template.action.name);
            }
          }
        };

      default:
        throw Error('Unhandled case ' + template.action);
    }
  }

  static contextActionsFor(
    selected: ActObject | null,
    contextActionTemplates: Array<ContextActionTemplate>,
    postAndForgetFn: (url: string, jsonBody: any, successString: string) => void
  ): Array<ContextAction> {
    if (!selected) return [];

    return contextActionTemplates
      .filter((x: any) => !x.objects || x.objects.find((objectType: string) => objectType === selected.type.name))
      .map((x: any) => this.toContextAction(x, selected, postAndForgetFn))
      .sort(byName);
  }

  static predefinedObjectQueriesFor(selected: ActObject | null, predefinedObjectQueries: Array<PredefinedObjectQuery>) {
    if (!selected) return [];

    return predefinedObjectQueries
      .filter(x => x.objects.find(objectType => objectType === selected.type.name))
      .sort(byName);
  }

  @computed
  get selectedObjectDetails() {
    const selected = this.selectedObject;

    if (!selected) return null;

    return {
      id: selected.id,
      details: {
        contextActions: DetailsStore.contextActionsFor(
          selected,
          this.contextActionTemplates,
          this.root.backendStore.postAndForget.bind(this.root.backendStore)
        ),
        predefinedObjectQueries: DetailsStore.predefinedObjectQueriesFor(selected, this.predefinedObjectQueries)
      },
      createFactDialog: this.createFactDialog,
      onSearchSubmit: this.onSearchSubmit,
      onFactClick: this.setSelectedFact,
      onTitleClick: () => this.onSearchSubmit({ objectType: selected.type.name, objectValue: selected.value }),
      onPredefinedObjectQueryClick: this.onPredefinedObjectQueryClick,
      onCreateFactClick: this.onCreateFactClick,
      onPruneObject: (o: ActObject) => {
        this.root.refineryStore.addToPrunedObjectIds([o.id]);
        this.root.selectionStore.clearSelection();
      }
    };
  }

  @computed
  get selectedFactDetails() {
    const selected = Object.values(this.root.selectionStore.currentlySelected)[0];

    if (!selected || selected.kind !== 'fact') return null;

    return {
      id: selected.id,
      endTimestamp: this.endTimestamp,
      onObjectRowClick: this.setSelectedObject,
      onFactRowClick: this.setSelectedFact,
      onReferenceClick: (fact: ActFact) => {
        if (fact.inReferenceTo) {
          this.root.selectionStore.setCurrentSelection({ kind: 'fact', id: fact.inReferenceTo.id });
        }
      }
    };
  }

  @computed
  get selectedMultipleObjectsDetails() {
    const selectedObjects = Object.values(this.root.selectionStore.currentlySelected).filter(s => s.kind === 'object');
    const selectedFacts = Object.values(this.root.selectionStore.currentlySelected).filter(s => s.kind === 'fact');

    return {
      id: 'testing',
      title: `Selection`,
      fadeUnselected: this.fadeUnselected,
      onToggleFadeUnselected: this.toggleFadeUnselected,
      factTitle: pluralize(selectedFacts.length, 'fact'),
      objectTitle: pluralize(selectedObjects.length, 'object'),
      objects: selectedObjects
        .map(selection => this.root.workingHistory.result.objects[selection.id])
        .filter(x => x !== undefined && x !== null)
        .sort(byTypeThenName),
      onObjectClick: (object: ActObject) => {
        this.root.selectionStore.removeFromSelection({ id: object.id, kind: 'object' });
      },
      onPruneObjectsClick: () => {
        const selectedObjectIds = Object.values(this.root.selectionStore.currentlySelected)
          .filter(x => x.kind === 'object')
          .map(x => x.id);
        this.root.refineryStore.addToPrunedObjectIds(selectedObjectIds);
        this.root.selectionStore.clearSelection();
      },
      onClearSelectionClick: () => {
        this.root.selectionStore.clearSelection();
      }
    };
  }

  @action.bound
  setSelectedObject(actObject: ActObject) {
    this.root.selectionStore.setCurrentSelection({ kind: 'object', id: actObject.id });
  }

  @action.bound
  setSelectedFact(fact: ActFact) {
    this.root.selectionStore.setCurrentSelection({ kind: 'fact', id: fact.id });
  }

  @action.bound
  onCreateFactClick() {
    if (this.selectedObject) {
      this.createFactDialog = new CreateFactForDialog(this.selectedObject, this.root.workingHistory, []);
    }
  }

  @computed
  get contentsKind(): 'empty' | 'objects' | 'object' | 'fact' {
    const selectionCount = Object.keys(this.root.selectionStore.currentlySelected).length;

    if (selectionCount === 0) {
      return 'empty';
    } else if (selectionCount > 1) {
      return 'objects';
    }

    return Object.values(this.root.selectionStore.currentlySelected)[0].kind;
  }
}

export default DetailsStore;
