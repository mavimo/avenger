# avenger

[![](https://travis-ci.org/buildo/avenger.svg)](https://travis-ci.org/buildo/avenger)
[![](https://img.shields.io/npm/v/avenger.svg?sytle=flat-square)](https://www.npmjs.com/package/avenger)
[![npm downloads](https://img.shields.io/npm/dm/avenger.svg?style=flat-square)](https://www.npmjs.com/package/avenger)
[![](https://david-dm.org/buildo/avenger.svg)](https://david-dm.org/buildo/avenger#info=dependencies&view=list)
[![](https://david-dm.org/buildo/avenger/dev-status.svg)](https://david-dm.org/buildo/avenger#info=devDependencies&view=list)

### TLDR

A CQRS-flavoured data fetching and caching layer in JavaScript.

Batching, caching, data-dependecies and manual invalidations in a declarative fashion for node and the browser.

### API layers

Avenger provides different levels of api:

- **layer 0** `fetch`: provides an abstraction over asyncronous data retrieval (`fetch`) and operators to compose different fetches together (`composition` and `product`). Includes data-dependencies and promise pipelining, and a prescription for api categorization. Read more in [Fetch](https://github.com/buildo/avenger#fetch).
- **layer 1** `fcache`: caching layer on top of `fetch`. Caching and batching happens here. This layer can be considered similar to [DataLoader](https://github.com/facebook/dataloader), adding more powerful caching strategies. You'd use this layer directly in a stateless (server-side) environment, where no long-living cache is involved. Read more in [Cache](https://github.com/buildo/avenger#cache).
- **layer 2** `query`: extends `fcache` with observable queries. You'd use this layer in a stateful (client) environment, where the app interacts with a long-living cache of remote/async data.
- **layer 3** `graph`: provides a higher level interface to `query`. You'd use this layer in a stateful (client) environment, where the app interacts with a long-living cache of remote/async data. Read more in [Graph](https://github.com/buildo/avenger#graph).
- **layer +** [react-avenger](https://github.com/buildo/react-avenger): provides helpers to connect a `graph` avenger instance to React components in a declarative fashion. You'd use this layer in a generic React client


# Fetch

A `fetch` is a function with the following signature:

```
fetch: A -> Promise[P]
```

whenever we write `~>` instead of `->` we're implying `Promise[]`

ex: we can write `fetch: A ~> P` for short.

## Classification

Given a fetch `fetch: A ~> P`:

- an *index* for `fetch` is defined as `A ~> List[Id]` where
  - `A` is a generic "filter" argument (e.g: `ageMin=25`)
  - `Id` is an identifier for the `P` (it returns a list of Ids)
  - ex: `getThingIdsBySearchQuery -> Promise[List[ThingId]]`
- a *catalog* for `fetch` is defined as `A ~> List[P]` where
  - `A` is again a generic "filter" argument
  - `P` is the type of each item returned (it returns a list of payloads)
  - ex: `getThingsBySearchQuery -> Promise[List[Thing]]`

## Operators

### Product

Let:

```
f1: A1 ~> P1
f2: A2 ~> P2
...
fn: An ~> Pn
```

then:

```
product([f1, ... , fn]): [A1, ... , An] ~> [P1, ... , Pn]
```

in short:

We use the operator *product* whenever we have a set of queries that DO NOT depend on one another: with *product* these queries are run in **parallel**.

### Composition

Let:

```
master: A2 ~> P2
ptoa: (P2, A2) -> A1
slave: A1 ~> P1
```

then:

```
compose(master, ptoa, slave): A2 ~> P1
```

in short:

We use the operator *compose* whenever we need to run a fetch (`slave`) **after** a previous one (`master`).

`ptoa` (that you should read "P to A") is a function that allows you to transform the output of `master` before passing it as input to `slave`.

The reason it accepts the input of `master` as second argument is to allow you to easily pass a shared context (ex: token, other params taken from state) both to `master` and to `slave`.


### Star

Let:

```
f: A ~> P
```

then:

```
star(f): List[A] ~> List[P]
```

in short:

We use the operator *star* to transform a fetch into a new one that accepts an array of A as input and returns and array of P as output.

Internally it will use *product* to run multiple fetches for every A in parallel.

# Cache

## CacheValue
A `CacheValue` is a data structure defined as
```
CacheValue = Maybe[P] x Maybe[Promise[P]]
```

in practice:
```
const CacheValue = Struct[{
  done: Maybe[Struct[{
    value: Any,
    timestamp: Number,
    promise: Promise
  }]],
  blocked: Maybe[Promise[P]]
}]
```

`blocked` is used to store an on-going fetch.

`done` is used to store the final value and other useful infos once the fetch completes.

## Strategies

Let `CacheValue = Maybe[P] x Maybe[Promise[P]]`, then a *caching strategy* is a function with the following signature:

```
strategy: CacheValue -> boolean
```

in short:

A *caching strategy* is a function that accepts a `CacheValue` in input and, using its information (is it done? when was it completed?),
returns `true` if the value can be used as-is and `false` if the value needs to be-refetched


### Provided strategies

- `Expire(delay: integer)`
- `available = Expire(Infinity)`
- `refetch = Expire(-1)`

## `f`-cache

A `f`-cache is a function with the following signature:

```
cache: A -> CacheValue
```

in practice:

The actual implementation is a class with the following methods:

- `constructor({ name?: string, map?: Map, atok: (a: A) => string })`
- `get(a): A -> CacheValue`
- `set(a: A, value: CacheValue)`
- `remove(a: A): void`
- `clear(): void`
- `getAvailablePromise(a: A, strategy: Strategy): Maybe[Promise[P]]`
- `getPromise(a: A, strategy: Strategy, fetch: Fetch[A, P]): Promise[P]`
- `storePayload(a: A, p: P, promise: Promise[P])`
- `storePromise(a: A, promise: Promise[P])`

`atok` (that you should read "A to key") is used to get a unique key starting from an input A

## Optimisations

**fetch**

`fetch: A ~> P`

use

`cacheFetch(fetch, strategy, cache)`

under the hood:

`cacheFetch` calls `fetch` to return a fresh value only if the value is not present in `cache` or `strategy` returns `false` (value is expired).

Whenever `fetch` is called:
- `CacheValue` in `cache` is replaced with a new one with `done: undefined` and `blocked: on-going-promise`

Whenever `fetch` completes:
- `CacheValue` in `cache` is replaced with a new one with `blocked: undefined` and `done: { value: final-value, timestamp: current-timestamp, promise: resolved-promise }`

**catalog**

`catalog: S ~> List[P]`

use

`cacheCatalog(catalog, cache, strategy, pcache, ptoa)`

where

```
ptoa: (p: P, s: S, i: Integer) -> A
```

under the hood:

things we need to know/remember before proceeding:
- A catalog returns Promise[List[P]] starting from a single input S.
- `pcache` ("cache of P") is the cache of P entities which may benefits of the new information returned from `catalog`
- `ptoa` (that you should read "P to A") is a function that transforms P in a valid A that, if passed to `atok`, would generate a "key" taht can be used to upsert P in `pcache`.

`cacheCatalog` calls `catalog` to return a fresh value only if the value is not present in `cache` or `strategy` returns `false` (value is expired).

Whenever `catalog` is called:
- `CacheValue` in `cache` is replaced with a new one with `done: undefined` and `blocked: on-going-promise`

Whenever `catalog` completes:
- `CacheValue` in `cache` is replaced with a new one with `blocked: undefined` and `done: { value: final-value, timestamp: current-timestamp, promise: resolved-promise }`
- every single P of the returned List[P] is used to upsert a fresh CacheValue in `pcache`. This is possible thanks to `ptoa` which, together with the `atok` stored inside `pcache`, generates the correct key that will be used upsert the new value in `pcache`
  - ex
    - catalog: `searchUsersByName` (returns List[User])
    - single fetch associated to `pcache`: function `getUserById` defined as `userId ~> User`
    - pcache: cache for User. It stores a function `atok` defined as `userId => userId`
    - ptoa: function defined as `user => user.id`
    - whenever catalog completes we can store the returned users in `pcache` so a future `getUserById` may return a cached value


**star**

`star: List[A] ~> List[P]`

use

`cacheStar(star, strategy, cache, pcache)`

under the hood:

As it happens in `cacheCatalog` `pcache` is the cache the stores the P entities returned by a fetch `A ~> P`.

`cacheStar` calls `star` to return a value only if the value is not present in `cache` or `strategy` returns `false` (value is expired).

Whenever `star` is called:
- calls `cacheFetch` for every single A (see `cacheFetch` definition to understand what happens next)

Whenever `catalog` completes:
- `CacheValue` in `cache` is replaced with a new one with `blocked: undefined` and `done: { value: final-value, timestamp: current-timestamp, promise: resolved-promise }`

The cache owns an additional method `removeBySingleton(a: A)` which is useful to invalidate every `CacheValue` originated by a List[A] that contains A.

**fstar**

`f*: List[A] ~> List[P]`

use

```
cacheStar(star(f), strategy, cache, pcache)
// or
f = cacheFetch(f, strategy, pcache)
cacheFetch(star(f), strategy, cache))
```

**product**

`p: (A1, ..., An) ~> (P1, ..., Pn)`

use

```
product(
  cacheFetch(f1, strategy1, cache1),
  ...
  cacheFetch(fn, strategyn, cachen)
)
```

**composition**

```
master: A2 ~> P2
slave: A1 ~> P1
ptoa: (P2, A2) -> A1

c: A2 ~> P1
```

use

```
compose(
  cacheFetch(master, strategy1, cache1),
  ptoa,
  cacheFetch(slave, strategy2, cache2)
)
```

# Graph

## query

signature: `query(queryNodes: Dict[string,Query], flatParams: Dict[string,any]): Observable<>`

`query` accepts the nodes to query and the `flatParams`s to use as arguments:

- `queryNodes` is a dictionary of query nodes

- `flatParams` is an object in the form `{ a1: v1, ... }`, and it should contain all the possible params any fetch we are requesting could need to run

## invalidate

signature: `invalidate(invalidateQueryNodes: Dict[string,Query], flatParams: Dict[string,any])`

`invalidate` accepts all the nodes that should be invalidated, for the given `flatParams`:


- `invalidateQueryNodes` is a dictionary of query nodes

- `flatParams` is an object in the form `{ a1: v1, ... }`, and it should contain all the possible params any fetch we are invalidating could need to run

Given a node to be invalidate, given as a property `{ [P]: Query }` in `invalidateQueryNodes` above, we define the terms:

  - *dependencies* of `P`: every other (if any) nodes for which a value is needed before evaluating `P`. `P` has a dependency on `n >= 0` other nodes
  - *dependents* of `P`:
  - if `P` has no dependencies, we can refer to it as a "root" node
  - if `P` has no dependents, we can refer to it as a "leaf" node

When invoking `invalidate`, we should provide explicitly everything that needs to be force-refetched. There's no automatic deletion of dependencies when invalidating a node, while there's automatic invalidation of all dependents:

  - invalidation of all dependents is automatic (recursively, all the dependents of any invalidated node are invalidated as well)

  - refetch of some dependencies may be transparent/automatic (if needed given the cache policies)

To explain this better, let's be more precise about what "invalidating" means

We can identify 2 phases:

### invalidate

which caches (cached fetches), e.g. upon executing a certain "command", should be invalidated?

**It's explicit**: the invalidate phase, starting from a potentially (half) filled cache, should invalidate (aka delete) specific cached values that we know could now be obsolete. This overrides any caching policy, it just *deletes*.

It is recursive: invalidating a node, all cached values (matching current input `A`) of *dependents* of that node are considered obsolete and thus deleted.

### refetch

Which fetches should be re-run (`fetch()`ed) after the invalidation phase?

**It's implicit**: the system knows exactly which are the `fetch` functions we want to re-run at any point in time, given it knows if someone is observing each cached fetch or not. Only observed fetches are re-`fetch()`ed; non-currently-observed ones will be `fetch()`ed when someone asks for them.

To clarify these two phases and the `invalidate` api, here's an example:

### Example

Assume our set of queries is composed of three nodes: `A`, `B` and `C`.

The graph is arranged in this way in terms of dependencies:

```
    A
   / \
  B   C
```

In other words:

- `A` is a *root* node, it has no dependencies (except of course for the input `Aa`)
- `B` has one dependency (`A`) plus some input `Ab`, but no dependents, and thus is a "leaf" node
- `C` has one dependency (`B`) plus some input `Ac`, but no dependents, and thus is a "leaf" node

To simplify things, let's assume every node holds a fetch cached as `refetch` (that is: multiple semi-concurrent requests will reuse a single async request, but requesting the fetch again later on will cause a new refetch).

We'll describe what happens in terms of calls to `query` and `invalidate`.

We'll also assume that every fetch is performing an async authenticated request to a web server, and thus it needs a `token`.
`B` and `C` also need something more (they have a dependency on `A` after all): we can imagine this to be whatever, for example:

- `A` fetches the current authenticated user given a `token`
- `B` fetches current user's "posts". In order to work it needs a `token` and the `id` of the current user, obtained by `A`.
- `C` fetches current user's "friends". In order to work it needs a `token` and the `id` of the current user, obtained by `A`.

Our story goes as follows:

1. `subscription1 = query({ A, B }, { token: 'foo' })`

  - `A` and `B` are run, respecting the `B -> A` dependency, and the `subscription1` observer is notified accordingly

2. `invalidate({ A }, { token: 'foo' })`

  - "invalidate" phase: `A` and all its dependents (`B`, `C`) are invalidated. Since `C` was never fetched (and thus never fetched for `token='foo'`), there's nothing to delete there. `A(token='foo')` and its dependent `B` have been fetched instead, so both `A` and `B` instances for `token='foo'` are removed from cache.

  - "refetch" phase: `A` and all its dependents are evaluated as "refetchable" candidates. `B` is thus fetched, but since `C` has no observers, its `fetch` is not run. Since `A` and `B` both have `strategy=refetch`, they will both run "for real".

3. `subscription2 = query({ C }, { token: 'foo' })`

  - `C` is run, and the `subscription2` observer is notified accordingly

  - since every node has `strategy=refetch`, and `C` needs `A` to complete, `A` is re-fetched as well, and the `subscription1` listener notified accordingly

4. `invalidate({ A }, { token: 'foo' })`

  - "invalidate" phase: `A` and all its dependents (`B`, `C`) are invalidated. `A(token='foo')` and all its dependents (`B` and `C`) have been fetched this time, so all three instances for `token='foo'` are deleted from cache.

  - "refetch" phase: `A` and all its dependents are evaluated as "refetchable" candidates. `A`, `B` and `C` are fetched since they are all observed.
