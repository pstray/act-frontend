import config from '../config';
import actWretch from '../util/actWretch';
import { factsToObjects } from './transformers';
import {ActObject, NamedId, Search} from "../pages/QueryHistory";

const handleError = (error : any) => {
  if (error instanceof TypeError) {
    console.error(error);
  }

  // If not WretcherError, throw it back
  if (!error.json) {
    throw error;
  }

  const originalMessage = error.json.messages && error.json.messages[0].message;
  let title = `${error.status}`;
  let message = originalMessage;

  // Display the error in the title on small messages
  if (originalMessage.length < 16) {
    title = `${error.status}: ${originalMessage}`;
    message = ``;
  }

  const newError = new Error(message);
  // @ts-ignore
  newError.title = title;
  newError.message = message;
  throw newError;
};

const handleForbiddenQueryResults = (error : any) => {
  const originalMessage = error.json.messages && error.json.messages[0].message;

  // TODO: Better error text
  const title = `${error.status}: ${originalMessage}`;
  const message = `You either don't have access to any facts relating to the requested object, or it does not exist in the database`;

  const newError = new Error(message);
  // @ts-ignore
  newError.title = title;
  newError.message = message;

  throw newError;
};

const DEFAULT_LIMIT = 10000;

/**
 * Fetch facts from an object specifed by type and value
 */
export const objectFactsDataLoader = ({objectType, objectValue, factTypes}: Search) => {

    const requestBody = {
        ...(factTypes && factTypes.length > 0 && {factType: factTypes}),
        limit: DEFAULT_LIMIT,
        includeRetracted: true
    };

    return actWretch
        .url(
            `/v1/object/${encodeURIComponent(objectType)}/${encodeURIComponent(
                objectValue
            )}/facts`
        )
        .json(requestBody)
        .post()
        .forbidden(handleForbiddenQueryResults)
        .json(({data}: any) => {
            const factsData = data;
            const objectsData = factsToObjects(data);
            return {
                data: {
                    factsData,
                    objectsData,
                    factsSet: new Set(factsData.map((fact: any) => fact.id)),
                    objectsSet: new Set(objectsData.map((fact: any) => fact.id))
                }
            };
        })
        .catch(handleError);
};

/**
 * Fetch facts and objects from a traversal query from a specifed object
 */
export const objectFactsTraverseDataLoader = ({
  objectType,
  objectValue,
  query
} : Search) =>
  actWretch
    .url(
      `/v1/object/${encodeURIComponent(objectType)}/${encodeURIComponent(
        objectValue
      )}/traverse`
    )
    .json({
      query
    })
    .post()
    .forbidden(handleForbiddenQueryResults)
    .json(({ data  } : any) => {
      const isFact = (maybeFact:any) =>
        maybeFact.hasOwnProperty('bidirectionalBinding');

      const factsSet = new Set();
      const objectsSet = new Set();
      const factsData : Array<any> = [];
      const objectsData : Array<any> = [];

      data.forEach((x : any) => {
        if (isFact(x) && !factsSet.has(x.id)) {
          factsSet.add(x.id);
          factsData.push(x);
        } else if (!isFact(x) && !objectsSet.has(x.id)) {
          objectsSet.add(x.id);
          objectsData.push(x);
        }
      });

      // Add objects from facts
      factsToObjects(factsData).forEach((x:any) => {
        if (objectsSet.has(x.id)) return false;
        objectsSet.add(x.id);
        objectsData.push(x);
      });

      return {
        data: {
          factsData,
          objectsData,
          factsSet,
          objectsSet
        }
      };
    })
    .catch(handleError);

export const searchCriteriadataLoader = ({
  searchCriteria: { objectType, objectValue, query, factTypes }
} : {
    searchCriteria: Search
}) => {
  if (objectType && objectValue && query) {
    return objectFactsTraverseDataLoader({ objectType, objectValue, query });
  } else if (objectType && objectValue) {
    return objectFactsDataLoader({ objectType, objectValue, factTypes });
  } else {
    throw new Error('TODO');
  }
};

/**
 * Resolve preconfigured facts for objects based on list of facts (with connected objects)
 */
export const autoResolveDataLoader = ({ data } : any) => {
  const { factsData, objectsData = [], factsSet, objectsSet } = data;

  const autoResolveFactsKeys = Object.keys(config.autoResolveFacts);

    const promises = objectsData
    .filter((object : any) => autoResolveFactsKeys.includes(object.type.name))
    .map((object : any) =>
      actWretch
        .url(`/v1/object/uuid/${object.id}/facts`)
        .json({
          // @ts-ignore
          factType: config.autoResolveFacts[object.type.name],
          includeRetracted: true
        })
        .post()
        .json(({ data } : any) => data)
    );

  if (promises.length === 0) {
    return Promise.resolve({ data });
  }

    return (
    Promise.all(promises)
      // @ts-ignore
      .then(data => data.reduce((acc, x) => acc.concat(x), [])) // flatten
      .then(data => ({
        resolvedFacts: data,
        resolvedObjects: factsToObjects(data)
      }))
      // Merge
      .then(({ resolvedFacts, resolvedObjects }) => {
        const newFactsSet = new Set(factsSet);
        const newObjectsSet = new Set(objectsSet);

        // Distinct and poplate sets
        const mergedFacts = factsData.concat(
          // @ts-ignore
          resolvedFacts.filter((fact : any) => {
            if (newFactsSet.has(fact.id)) return false;
            newFactsSet.add(fact.id);
            return true;
          })
        );
        const mergedObjects = objectsData.concat(
          resolvedObjects.filter((object : any) => {
            if (newObjectsSet.has(object.id)) return false;
            newObjectsSet.add(object.id);
            return true;
          })
        );

        return {
          factsData: mergedFacts,
          objectsData: mergedObjects,
          objectsSet: newObjectsSet,
          factsSet: newFactsSet
        };
      })
      .then(data => ({ data }))
      .catch(handleError)
  );
};

// Resolve facts between a list of objects
// TODO: Should fetch retractions for facts, as they might not be part of the result by default
export const resolveFactsDataLoader = ({ objectTypes, objectValues } : {
    objectTypes: Array<NamedId>,
    objectValues: Array<ActObject>
}) =>
  actWretch
    .url(`/v1/object/traverse`)
    .json({
      objectType: objectTypes.map((x : NamedId) => x.name),
      objectValue: objectValues.map((x : ActObject) => x.value),
      query: `g.outE().dedup()`
    })
    .post()
    .json(({ data } : any) => data)
    .then((data : any) => {
      const ids = new Set(objectValues.map((x:any) => x.id));
      return data.filter((x:any) => x.objects.every((y:any) => ids.has(y.object.id)));
    });