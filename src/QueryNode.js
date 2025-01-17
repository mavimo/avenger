import difference from 'lodash/difference';
import uniq from 'lodash/uniq';
import identity from 'lodash/identity';
import { refetch } from './cache/strategies';
import { compose, product } from './fetch/operators';
import { cacheFetch } from './query/operators';
import { ObservableCache } from './query/ObservableCache';

export const Query = ({ fetch: _fetch, cacheStrategy = refetch, debugId = 'anonymous', params = {}, dependencies = {} }) => {
  const upsetParams = {
    ...Object.keys(dependencies).reduce((ac, k) => ({
      ...ac, ...dependencies[k].upsetParams
    }), {}),
    ...(params)
  };

  const noDeps = Object.keys(dependencies).length === 0
  if (noDeps) {
    // atom / no dependencies (can have params)
    //
    // becomes just `cacheFetch(finalFetch)`
    //
    const A = Object.keys(params);
    const cache = new ObservableCache({ name: debugId });
    const fetch = cacheFetch(_fetch, cacheStrategy, cache);
    const depth = 0;
    return {
      fetch, A, depth, upsetParams
    };
  } else {
    const paramKeys = Object.keys(params);
    const depsKeys = Object.keys(dependencies);
    const fromAKeys = difference(paramKeys, depsKeys);
    const depsOnly = fromAKeys.length === 0;

    const cache = new ObservableCache({ name: `${debugId}_finalFetch` });
    const fetch = cacheFetch(_fetch, cacheStrategy, cache);
    const depth = Math.max(...depsKeys.map(k => dependencies[k].depth)) + 1;

    if (depsOnly) {
      // a query with dependencies only (no params)
      // is translated to:
      //
      //         compose
      //       /    |   \
      //   product  map  finalFetch
      //   /      \
      // dep1  [... depN]
      //
      // where just `finalFetch` should be cached
      //

      const depsProduct = {
        A: depsKeys.map(k => dependencies[k].A),
        fetch: product(depsKeys.map(k => dependencies[k].fetch))
      };

      const finalFetch = {
        A: depsKeys,
        fetch
      };

      const map = ps => depsKeys.reduce((ac, k, i) => ({
        ...ac,
        [k]: (dependencies[k].map || identity)(ps[i])
      }), {});

      return {
        A: depsProduct.A,
        upsetParams,
        fetch: compose(depsProduct.fetch, map, finalFetch.fetch),
        depth,
        childNodes: { depsProduct, finalFetch }
      };
    } else {
      // a query with both dependencies
      // and params is translated to:
      //
      //            ___compose_
      //           /      |    \
      //    _product____  map  finalFetch
      //   /   |        \
      // dep1 [...depN] syncFetchA
      //
      // again, only `finalFetch` should be cached,
      // but being `syncFetchA` a "leaf" itself, we have to cache it as well,
      // otherwise it would not be "observable" (no subject available)
      //

      const cache = new ObservableCache({ name: `${debugId}_syncFetchA` });
      const syncFetchAFetch = cacheFetch(aas => Promise.resolve(fromAKeys.map(pk => aas[pk])), refetch, cache);
      const syncFetchA = {
        A: fromAKeys,
        fetch: syncFetchAFetch
      };

      const depsAndA = {
        A: [syncFetchA.A].concat(depsKeys.map(k => dependencies[k].A)),
        fetch: product([syncFetchA.fetch].concat(depsKeys.map(k => dependencies[k].fetch)))
      };

      const finalFetch = {
        A: uniq(paramKeys.concat(depsKeys)),
        fetch
      };

      return {
        A: depsAndA.A,
        upsetParams,
        fetch: compose(
          depsAndA.fetch,
          ([syncFetchAPs, ...prodPs]) => ({
            ...prodPs.reduce((ac, p, i) => ({
              ...ac, [depsKeys[i]]: (dependencies[depsKeys[i]].map || identity)(p)
            }), {}),
            ...syncFetchAPs.reduce((ac, p, i) => ({
              ...ac, [fromAKeys[i]]: p
            }), {})
          }),
          finalFetch.fetch
        ),
        depth,
        childNodes: { syncFetchA, depsAndA, finalFetch }
      };
    }
  }
};
