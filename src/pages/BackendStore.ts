import {action, observable, runInAction} from "mobx";
import {
    autoResolveDataLoader,
    checkObjectStats, postJson,
    searchCriteriadataLoader
} from "../core/dataLoaders";
import MainPageStore from "./MainPageStore";
import {isObjectSearch, Query, Search, searchId} from "./types";
import {addMessage} from "../util/SnackbarProvider";

const maxFetchLimit = 2000;

class BackendStore {

    root: MainPageStore;

    @observable isLoading: boolean = false;
    @observable error: Error | null = null;

    constructor(root: MainPageStore) {
        this.root = root;
    }

    arrayToObjectWithIds(inputArray: Array<any>) {
        return inputArray.reduce((acc, curr) => ({
                ...acc,
                [curr.id]: curr
            }),
            {})
    }

    @action
    async executeQuery(search: Search) {

        const id = searchId(search);

        // Skip for existing queries
        if (this.root.queryHistory.queries.some((q) => q.id === id)) {
            return;
        }

        if (isObjectSearch(search)) {
            try {
                this.isLoading = true;
                const approvedAmountOfData = await checkObjectStats(search, maxFetchLimit);

                if (!approvedAmountOfData) return;

                // @ts-ignore
                const result = await searchCriteriadataLoader(search).then(autoResolveDataLoader);
                const q: Query = {
                    id: id,
                    search: search,
                    result: {
                        facts: this.arrayToObjectWithIds(result.data.factsData),
                        objects: this.arrayToObjectWithIds(result.data.objectsData)
                    }
                };
                this.root.queryHistory.addQuery(q);

            } catch (err) {
                runInAction(() => {
                    this.error = err;
                });
            } finally {
                runInAction(() => {
                    this.isLoading = false;
                })
            }

        } else {
            throw Error("Search of this type is not supported " + search)
        }
    }

    @action
    async postAndForget(url : string, request : {[key: string] : any}, successMessage: string) {
        try {
            this.isLoading = true;
            await postJson(url, request);
            addMessage(successMessage);

        } catch(err) {
            runInAction(() => {
                this.error = err;
            })
        } finally {
            runInAction(() => {
                this.isLoading = false;
            })
        }
    }
}

export default BackendStore;