import assert from 'assert'
import sinon from 'sinon'

import {
  cacheFetch,
  cacheCatalog,
  cacheStar
} from '../../src/cache/operators'

import {
  Cache
} from '../../src/cache/Cache'

import {
  available
} from '../../src/cache/strategies'

describe('cache', () => {

  describe('operators', () => {

    describe('cacheFetch', () => {

      it('should return a fetch', () => {
        const fetch = a => Promise.resolve(2 * a)
        const c = new Cache()
        const cf = cacheFetch(fetch, available, c)
        assert.strictEqual(typeof cf, 'function')
      })

    })

    describe('cacheCatalog', () => {

      it('should return a fetch', () => {
        const catalog = () => Promise.resolve([1, 2, 3].map(a => 2 * a))
        const c = new Cache()
        const pcache = new Cache()
        const cc = cacheCatalog(catalog, available, c, pcache, (p) => p / 2)
        assert.strictEqual(typeof cc, 'function')
      })

      it('should fill the cache', () => {
        const catalog = () => Promise.resolve([1, 2, 3].map(a => 2 * a))
        const c = new Cache()
        const pcache = new Cache()
        const cc = cacheCatalog(catalog, available, c, pcache, (p) => p / 2)
        return cc([1, 2, 3]).then(ps => {
          // controllo il payload
          assert.deepEqual(ps, [2, 4, 6])
          // controllo la cache
          assert.strictEqual(pcache.get(1).done.value, 2)
          assert.strictEqual(pcache.get(2).done.value, 4)
          assert.strictEqual(pcache.get(3).done.value, 6)
        })
      })

    })

    describe('cacheStar', () => {

      it('should return a fetch', () => {
        const star = (as) => Promise.resolve(as.map(a => 2 * a))
        const cache = new Cache()
        const pcache = new Cache()
        const cs = cacheStar(star, available, cache, pcache)
        assert.strictEqual(typeof cs, 'function')
      })

      it('should fill the cache', () => {
        const star = jest.fn((as) => Promise.resolve(as.map(a => 2 * a)))
        const cache = new Cache()
        const pcache = new Cache()
        const cs = cacheStar(star, available, cache, pcache)
        return cs([1, 2, 3]).then(ps => {
          // controllo il payload
          assert.deepEqual(ps, [2, 4, 6])
          // controllo che la star sia stata chiamata
          assert.strictEqual(star.mock.calls.length, 1)
          // controllo le cache
          assert.deepEqual(cache.get([1, 2, 3]).done.value, [2, 4, 6])
          assert.strictEqual(pcache.get(1).done.value, 2)
          assert.strictEqual(pcache.get(2).done.value, 4)
          assert.strictEqual(pcache.get(3).done.value, 6)
        })
      })

      it('should optimise the input', () => {
        const star = sinon.spy((as) => Promise.resolve(as.map(a => 2 * a)))
        const cache = new Cache()
        const pcache = new Cache()
        const cs = cacheStar(star, available, cache, pcache)
        pcache.set(1, { done: { value: 2, timestamp: 0, promise: Promise.resolve(2) } })
        return cs([1, 2, 3]).then(ps => {
          assert.deepEqual(ps, [2, 4, 6])
          // controllo che la star sia stata chiamata con l'input ottimizzato
          assert.strictEqual(star.callCount, 1)
          assert.deepEqual(star.firstCall.args, [[2, 3]])
          // controllo le cache
          assert.deepEqual(cache.get([1, 2, 3]).done.value, [2, 4, 6])
          assert.strictEqual(pcache.get(1).done.value, 2)
          assert.strictEqual(pcache.get(2).done.value, 4)
          assert.strictEqual(pcache.get(3).done.value, 6)
        })
      })

      it('should not call the star if the input is fully optimised', () => {
        const star = sinon.spy((as) => Promise.resolve(as.map(a => 2 * a)))
        const cache = new Cache()
        const pcache = new Cache()
        const cs = cacheStar(star, available, cache, pcache)
        pcache.set(1, { done: { value: 2, timestamp: 0, promise: Promise.resolve(2) } })
        pcache.set(2, { done: { value: 4, timestamp: 0, promise: Promise.resolve(4) } })
        pcache.set(3, { done: { value: 6, timestamp: 0, promise: Promise.resolve(6) } })
        return cs([1, 2, 3]).then(ps => {
          // controllo il payload
          assert.deepEqual(ps, [2, 4, 6])
          // controllo che la star sia stata chiamata con l'input ottimizzato
          assert.strictEqual(star.callCount, 0)
          // controllo le cache
          assert.deepEqual(cache.get([1, 2, 3]).done.value, [2, 4, 6])
          assert.strictEqual(pcache.get(1).done.value, 2)
          assert.strictEqual(pcache.get(2).done.value, 4)
          assert.strictEqual(pcache.get(3).done.value, 6)
        })
      })

      it('should not call the star after a double fetch', () => {
        const star = sinon.spy((as) => Promise.resolve(as.map(a => 2 * a)))
        const cache = new Cache()
        const pcache = new Cache()
        const cs = cacheStar(star, available, cache, pcache)
        cs([1, 2, 3])
        return cs([1, 2, 3]).then(() => {
          assert.strictEqual(star.callCount, 1)
        })
      })

    })

  })

})
