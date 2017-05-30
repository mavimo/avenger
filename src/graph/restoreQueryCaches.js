import t from 'tcomb';
import { ExtractedQueryCaches } from './extractQueryCaches';
import debug from 'debug';

const log = debug('avenger:restoreQueryCaches');

export function restoreQueryCaches(graph, data) {
  t.assert(ExtractedQueryCaches.is(data));
  Object.keys(data).forEach(queryName => {
    data[queryName].forEach(({ a, value }) => {
      log('restoring %s(%o)=%o', queryName, a, value);
      graph[queryName].fetch.cache.storePayload(a, value, Promise.resolve(value));
    });
  });
}