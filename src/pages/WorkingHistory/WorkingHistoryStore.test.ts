import { parseStateExport, stateExport } from './WorkingHistoryStore';
import { SearchItem } from '../types';

const searchItem = (args: { [key: string]: any }): SearchItem => {
  return {
    ...{
      id: '123',
      result: { facts: {}, objects: {} },
      search: { id: 'Axiom', factTypeName: 'alias' }
    },
    ...args
  };
};

it('can export query history', () => {
  expect(stateExport([searchItem({ id: 'Axiom', factTypeName: 'alias' })], new Set())).toEqual({
    version: '1.0.0',
    queries: [],
    prunedObjectIds: []
  });

  const objectTypeSearch = { objectType: 'threatActor', objectValue: 'Axiom' };
  const graphSearch = {
    objectType: 'threatActor',
    objectValue: 'Sofacy',
    query:
      "g.optional(emit().repeat(outE('alias').otherV()).until(cyclicPath())).repeat(inE('attributedTo').otherV()).times(2).inE('observedIn').otherV().hasLabel('content').outE('classifiedAs').otherV().where(outE().has('value','malware')).where(inE('classifiedAs').otherV().outE('observedIn').otherV().repeat(outE('attributedTo').otherV()).times(2).count().is(eq(1L))).optional(emit().repeat(outE('alias').otherV()).until(cyclicPath())).inE('classifiedAs').otherV().outE().hasLabel(within('at','connectsTo')).otherV().inE('componentOf').otherV().hasLabel(within('fqdn','ipv4','ipv6')).not(where(outE().has('value','sinkhole'))).path().unfold()"
  };
  const filteredSearch = {
    objectType: 'report',
    objectValue: 'abcdef',
    factTypes: ['mentions']
  };

  expect(
    stateExport(
      [
        searchItem({ search: objectTypeSearch }),
        searchItem({ search: graphSearch }),
        searchItem({ search: filteredSearch })
      ],
      new Set(['abcd', 'efgh'])
    )
  ).toEqual({
    version: '1.0.0',
    queries: [objectTypeSearch, graphSearch, filteredSearch],
    prunedObjectIds: ['abcd', 'efgh']
  });
});

it('can import working history', () => {
  expect(() => parseStateExport(JSON.stringify({ version: '1.0.0', queries: [] }))).toThrow(
    "Validation failed: history export has no 'queries'"
  );

  expect(() => parseStateExport(JSON.stringify({ version: '1.0.0', queries: [{ bad: 'data' }] }))).toThrow(
    'Queries must have objectType and objectValue: {"bad":"data"}'
  );

  expect(
    parseStateExport(
      JSON.stringify({
        version: '1.0.0',
        queries: [{ objectType: 'threatActor', objectValue: 'Axiom' }]
      })
    )
  ).toEqual({ version: '1.0.0', queries: [{ objectType: 'threatActor', objectValue: 'Axiom' }] });
});