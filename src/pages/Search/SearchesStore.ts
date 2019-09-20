import MainPageStore from '../MainPageStore';
import { action, computed, observable } from 'mobx';
import { ActObject } from '../types';
import { sortRowsBy } from '../Table/PrunedObjectsTableStore';
import { ColumnKind, IObjectRow, SortOrder } from '../../components/ObjectTable';

class SearchesStore {
  root: MainPageStore;

  @observable sortOrder: SortOrder = { order: 'asc', orderBy: 'objectType' };
  @observable selectedObjectIds: Set<string> = new Set();

  constructor(root: MainPageStore) {
    this.root = root;
  }

  @action.bound
  onSortChange(newOrderBy: ColumnKind) {
    this.sortOrder = {
      orderBy: newOrderBy,
      order: this.sortOrder.orderBy === newOrderBy && this.sortOrder.order === 'asc' ? 'desc' : 'asc'
    };
  }

  @action.bound
  toggleSelection(objectId: string) {
    if (this.selectedObjectIds.has(objectId)) {
      this.selectedObjectIds.delete(objectId);
    } else {
      this.selectedObjectIds.add(objectId);
    }
  }

  @action.bound
  onAddSelectedObjects() {
    const activeSimpleSearch = this.root.backendStore.simpleSearchBackendStore.selectedSimpleSearch;
    if (!activeSimpleSearch || !activeSimpleSearch.result) {
      return;
    }

    const selectedObjects = activeSimpleSearch.result.filter((obj: ActObject) => this.selectedObjectIds.has(obj.id));
    this.root.backendStore.executeSearches({
      searches: selectedObjects.map((obj: ActObject) => ({ objectType: obj.type.name, objectValue: obj.value })),
      replace: false
    });

    // Clear selection and show graph
    this.selectedObjectIds = new Set();
    this.root.ui.contentStore.onTabSelected('graph');
  }

  @computed
  get prepared() {
    const activeSimpleSearch = this.root.backendStore.simpleSearchBackendStore.selectedSimpleSearch;

    const rows: Array<IObjectRow> =
      activeSimpleSearch && activeSimpleSearch.status === 'done'
        ? activeSimpleSearch.result.map((x: ActObject) => ({
            actObject: x,
            isSelected: this.selectedObjectIds.has(x.id)
          }))
        : [];
    return {
      title: activeSimpleSearch ? 'Results for: ' + activeSimpleSearch.searchString : 'n/a',
      subTitle: activeSimpleSearch && activeSimpleSearch.result ? activeSimpleSearch.result.length + ' objects' : '',
      isLoading: activeSimpleSearch ? activeSimpleSearch.status === 'pending' : false,
      onAddSelectedObjects: this.onAddSelectedObjects,
      resultTable: {
        sortOrder: this.sortOrder,
        onSortChange: this.onSortChange,
        rows: sortRowsBy(this.sortOrder, rows),
        onRowClick: (actObject: ActObject) => {
          this.toggleSelection(actObject.id);
        }
      }
    };
  }
}

export default SearchesStore;