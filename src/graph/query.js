import { apply, applySync } from '../query/apply';
import { queriesAndArgs } from './util';

// query the `graph`
// request `Ps` queries, e.g:
//
//   ['samples', 'tests']
//
// with `A` arguments, e.g:
//
//   { token: 'asdafs', sampleId: 1, testId: 2 }
//
export function query(graph, Ps, A) {
  const { queries, args } = queriesAndArgs(graph, Ps, A);
  return apply(queries, args);
}

export function querySync(graph, Ps, A) {
  const { queries, args } = queriesAndArgs(graph, Ps, A);
  return applySync(queries, args);
}