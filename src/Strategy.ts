import { CacheValue } from './CacheValue';
import {
  Setoid,
  contramap as setoidContramap,
  fromEquals,
  strictEqual
} from 'fp-ts/lib/Setoid';
import { Function1, constTrue, constFalse } from 'fp-ts/lib/function';
import { Contravariant3 } from 'fp-ts/lib/Contravariant';

declare module 'fp-ts/lib/HKT' {
  interface URI2HKT3<U, L, A> {
    Strategy: Strategy<A, L, U>;
  }
}

export const URI = 'Strategy';

export type URI = typeof URI;

export class Strategy<A, L, P> {
  readonly _A!: A;
  readonly _L!: L;
  readonly _P!: P;
  readonly _URI!: URI;
  constructor(
    readonly inputSetoid: Setoid<A>,
    readonly filter: Function1<CacheValue<L, P>, boolean>,
    readonly cacheValueSetoid: Setoid<CacheValue<L, P>>
  ) {}

  contramap<B>(f: (b: B) => A): Strategy<B, L, P> {
    return new Strategy(
      setoidContramap(f, this.inputSetoid),
      this.filter,
      this.cacheValueSetoid
    );
  }
}

export function fromSuccessFilter<A, L, P>(
  inputSetoid: Setoid<A>,
  filter: (value: P, updated: Date) => boolean,
  cacheValueSetoid: Setoid<CacheValue<L, P>>
): Strategy<A, L, P> {
  return new Strategy(
    inputSetoid,
    (cacheValue: CacheValue<L, P>) =>
      cacheValue.fold(constTrue, constTrue, constFalse, filter),
    cacheValueSetoid
  );
}

export function available<A, L, P>(
  inputSetoid: Setoid<A>,
  cacheValueSetoid: Setoid<CacheValue<L, P>>
): Strategy<A, L, P> {
  return fromSuccessFilter(inputSetoid, constTrue, cacheValueSetoid);
}

export function refetch<A, L, P>(
  inputSetoid: Setoid<A>,
  cacheValueSetoid: Setoid<CacheValue<L, P>>
): Strategy<A, L, P> {
  return fromSuccessFilter(inputSetoid, constFalse, cacheValueSetoid);
}

export function expire(afterMs: number) {
  return <A, L, P>(
    inputSetoid: Setoid<A>,
    cacheValueSetoid: Setoid<CacheValue<L, P>>
  ): Strategy<A, L, P> => {
    return fromSuccessFilter(
      inputSetoid,
      (_, updated) => updated.getTime() >= Date.now() - afterMs,
      cacheValueSetoid
    );
  };
}

export const setoidStrict = fromEquals(strictEqual);

export function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a !== typeof b) {
    return false;
  }
  if (typeof a === 'number' && typeof b === 'number' && isNaN(a) && isNaN(b)) {
    return true;
  }
  if ((a == null && b != null) || (a != null && b == null)) {
    return false;
  }
  if (typeof a === 'object' && typeof b === 'object') {
    for (let k in a) {
      if ((a as any)[k] !== (b as any)[k]) {
        return false;
      }
    }
    for (let k in b) {
      if ((a as any)[k] !== (b as any)[k]) {
        return false;
      }
    }
    return true;
  }
  return false;
}

export const setoidShallow = fromEquals(shallowEqual);

export type JSONObject = { [key: string]: JSONT };
export interface JSONArray extends Array<JSONT> {}
export type JSONT = null | string | number | boolean | JSONArray | JSONObject;

export function JSONEqual<A extends JSONT>(a: A, b: A): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export const setoidJSON = fromEquals<JSONT>(JSONEqual);

function contramap<A, L, P, B>(
  fa: Strategy<A, L, P>,
  f: (b: B) => A
): Strategy<B, L, P> {
  return fa.contramap(f);
}

export const strategy: Contravariant3<URI> = {
  URI,
  contramap
};
