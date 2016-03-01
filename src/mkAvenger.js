import t from 'tcomb';
import { BehaviorSubject } from 'rxjs/subject/BehaviorSubject';
import { Subject } from 'rxjs/Subject';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/scan';
import 'rxjs/add/operator/filter';
import 'rxjs/add/operator/debounceTime';
import 'rxjs/add/operator/distinctUntilChanged';
import 'rxjs/add/operator/mergeMap';
import 'rxjs/add/operator/do';
import 'rxjs/add/operator/catch';
import 'rxjs/add/observable/combineLatest';
import 'rxjs/add/observable/fromPromise';
import 'rxjs/add/observable/empty';
import debug from 'debug';
import map from 'lodash/collection/map';
import every from 'lodash/collection/every';
import pick from 'lodash/object/pick';
import identity from 'lodash/utility/identity';
import _memoize from 'lodash/function/memoize';
import partialRight from 'lodash/function/partialRight';
import { Query, Queries, Command, State } from './types';

const log = debug('Avenger');

const debounceMSec = new BehaviorSubject(1);

const _error = new Subject();

const instanceId = (id: t.String, params: State)/*: t.String*/ => `${id}-${JSON.stringify(params)}`;
const memoize = partialRight(_memoize, (query, _params) => {
  const params = pick(_params, Object.keys(query.upsetActualParams));
  return instanceId(query.id, params);
});

function fetch({ query, params }) {
  if (query.params) {
    t.struct(query.params, `${query.id}:FetchParams`)(params); // assert
  }
  log('fetch', query.id, JSON.stringify(params));
  return Observable.fromPromise(query.fetch(params));
}

const getSource = memoize((query: Query, params: State) => {
  if (!query.dependencies || Object.keys(query.dependencies).length === 0) {
    // query with no deps
    return new BehaviorSubject({ query, params });
  }

  // query with deps
  const observableDeps = map(query.dependencies, ({ query, map }, key) => {
    return getValue(query, params).map(value => ({ // eslint-disable-line no-use-before-define
      value, key, map: map || identity
    }));
  });
  return Observable.combineLatest(...observableDeps)
    .filter(deps => every(deps, d => typeof d.value !== 'undefined'))
    .debounceTime(debounceMSec.value)
    .map(deps => deps.map(({ value, key, map }) => ({ value: map(value), key })))
    .map(deps => ({
      query,
      params: {
        ...params,
        ...deps.reduce((ac, { key, value }) => ({
          ...ac, [key]: value
        }), {})
      }
    }));
});

const getValue = memoize((query: Query, params: State) => {
  const fetcher = getSource(query, params).debounceTime(debounceMSec.value).flatMap(v => {
    const readyState = getReadyState(query, params); // eslint-disable-line no-use-before-define
    readyState.next({ ...readyState.value, waiting: false, fetching: true });
    return fetch(v).do(() => {
      readyState.next({ ...readyState.value, fetching: false, error: undefined });
    }).catch(error => {
      _error.next({ error, source: 'fetch' });
      readyState.next({ ...readyState.value, fetching: false, error });
      return Observable.empty();
    });
  });
  // const isCacheable = ['optimistic', 'manual'].indexOf(query.cacheStrategy) !== -1;
  // if (isCacheable) {
  const value = new BehaviorSubject(undefined);
  fetcher.subscribe(::value.next);
  return value;
  // } else {
  //   // TODO(gio):
  //   // should instead have a subject, but valid in a window/buffer.
  //   // this way (current) every requester even in same frame or close frames
  //   // will throw away previous values ?
  //   return fetcher;
  // }
});

const getReadyState = memoize((query: Query, params: State) => { //eslint-disable-line no-unused-vars
  return new BehaviorSubject({ waiting: true, fetching: false });
});

function invalidateUpset(query, params, force = false) {
  const deps = query.dependencies;
  // should invalidate only the leaves here. in fact, non-leaves are
  // just observables not subjects -> cannot .next() (and it makes sense)
  if (deps && Object.keys(deps).length > 0) {
    // sync-wait a possibly non-free query
    const rs = getReadyState(query, params);
    if (!rs.value.waiting) {
      rs.next({ ...rs.value, waiting: true });
    }

    map(deps, ({ query }) => invalidateUpset(query, params));
  } else if (force || query.cacheStrategy !== 'manual') {
    const value = getValue(query, params);
    if (typeof value.value !== 'undefined') {
      // be sure to allow for a sync value if there's one
      setTimeout(() => {
        const source = getSource(query, params);
        // invalidate
        log('invalidateUpset:invalidate', query.id, JSON.stringify(params));
        source.next(source.value);
      });
    }
  }
}

function getValueAndMaybeInvalidateUpset(query, params) {
  log('getValueAndMaybeInvalidateUpset', query.id, JSON.stringify(params));
  invalidateUpset(query, params, false);
  return getValue(query, params);
}

export default function mkAvenger(universe: Queries, setDebounceMSec: ?t.Number) {
  if (setDebounceMSec) {
    // TODO(gio): every other setDebounceMSec after this one are useless
    // it should be combineLatest'd where it's needed, not used statically
    debounceMSec.next(setDebounceMSec);
  }

  const QueriesDict = t.dict(t.String, State);

  const arrayEqual = eq => (vsa, vsb) => {
    return every(vsa, (a, i) => eq(a, vsb[i]));
  };
  const notValueEqual = (a, b) => a !== b;
  const notReadyStateEqual = (a, b) => a.waiting !== b.waiting || a.fetching !== b.fetching;

  const queries = (queries: QueriesDict) => {
    const qs = map(queries, (params, id) => ({ id, params }));
    const value = Observable.combineLatest(
      qs.map(({ params, id }) => getValueAndMaybeInvalidateUpset(universe[id], params))
    )
      .distinctUntilChanged(arrayEqual(notValueEqual))
      .map(values => values.reduce((ac, v, i) => ({
        ...ac, [qs[i].id]: v
      }), {}));
    const readyState = Observable.combineLatest(
      qs.map(({ params, id }) => getReadyState(universe[id], params))
    )
      .distinctUntilChanged(arrayEqual(notReadyStateEqual))
      .map(rses => rses.reduce((ac, rs, i) => ({
        ...ac, [qs[i].id]: {
          ...rs, loading: !!(rs.waiting || rs.fetching)
        }
      }), {}));
    return Observable.combineLatest([value, readyState])
      .debounceTime(debounceMSec.value)
      .map(([val, rs]) => ({
        ...val,
        readyState: rs
      }));
  };

  const invalidateQueries = (queries: QueriesDict) => {
    const qs = map(queries, (params, id) => ({ id, params }));
    qs.forEach(({ id, params }) => {
      invalidateUpset(universe[id], params, true);
    });
  };

  return {
    queries,
    query(id: t.String, params: ?State) {
      return queries({ [id]: params || {} });
    },
    invalidateQueries,
    invalidateQuery(id: t.String, params: ?State) {
      return invalidateQueries({ [id]: params || {} });
    },
    runCommand(cmd: Command, params: ?State) {
      const { run } = cmd;
      if (cmd.params) {
        // assert: all run() params must be there
        t.struct(cmd.params, `${cmd.id}:RunParams`)(params || {});
      }
      const invalidates = (t.Function.is(cmd.invalidates) ? cmd.invalidates(params) : cmd.invalidates) || {};
      return run(params || {}).then((moreParams = {}) => {
        const allParams = { ...params, ...moreParams };
        // assert: all invalidate query params must be there
        t.struct(cmd.invalidateParams, `${cmd.id}:InvalidateParams`)(allParams);
        invalidateQueries(Object.keys(invalidates).reduce((ac, k) => ({
          ...ac, [k]: allParams
        }), {}));
        return moreParams;
      }).catch(error => {
        _error.next({ error, source: 'runCommand' });
        throw error;
      });
    },
    // setDebounceMSec(ms: t.Number) {
    //   debounceMSec.next(ms);
    // },
    get cache() {
      const cache = getValue.cache.__data__;
      return Object.keys(cache).reduce((ac, k) => ({
        ...ac, [k]: cache[k].value
      }), {});
    },
    error: _error.map(identity),
    errors: _error.scan((ac, e) => ac.concat(e), [])
  };
}
