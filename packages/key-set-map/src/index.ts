import {
  isObjRef,
  defaultMakeData,
  hasOwnProperty,
  assertSet,
  makeKnownWeakRef,
  isKnownWeakRef,
} from "./helpers";

import type {
  CanonicalKeys,
  SizeIndexedSetsOfCanonicalKeys
} from "./types";

export class KeySetMap<
  TData = Record<string, unknown>,
  TKey = any
> {
  constructor(
    // For diagnostic purposes, or in cases where usage of WeakMap, WeakRef, and
    // FinalizationRegistry is not desired, this usually-true parameter allows
    // disabling all weak-key-related features of the KeySetMap. The logical
    // behavior of the KeySetMap should be the same with weakness disabled, but
    // performance and memory usage may be worse.
    private weakness = true,

    // The optional makeData function allows customizing the TData entry stored
    // for each canonical set of keys. It receives an iterator over the keys of
    // the set (rather than a reference to the set itself), which it may either
    // ignore or use in its construction of the TData object/value.
    private makeData: (keysIterator: Iterator<TKey>) => TData = defaultMakeData,
  ) {}

  // The lookup and lookupSet methods return the TData associated with the given
  // sequence of keys, interpreted as a set. If no TData has been associated
  // with this set of keys yet, one will be created by this.makeData, allowing
  // lookup always to return TData and never undefined.
  public lookup(keys: Iterable<TKey>): TData {
    return this.lookupSet(new Set(keys));
  }

  public lookupSet(set: Set<TKey>): TData {
    return (this.findCanonicalKeys(set) || this.recordCanonicalKeys(set)).data!;
  }

  // The peek and peekSet methods return the TData associated with the given
  // sequence of keys, interpreted as a set, if any. Unlike lookup and
  // lookupSet, they do not create a new TData if none has been associated with
  // the given set of keys, but instead return undefined.
  public peek(keys: Iterable<TKey>): TData | undefined {
    return this.peekSet(new Set(keys));
  }

  public peekSet(set: Set<TKey>): TData | undefined {
    return this.findCanonicalKeys(set)?.data;
  }

  // The remove and removeSet methods remove the CanonicalKeys entry associated
  // with this set of keys, returning the removed TData, if any.
  public remove(keys: Iterable<TKey>): TData | undefined {
    return this.removeSet(new Set(keys));
  }

  public removeSet(set: Set<TKey>): TData | undefined {
    const cks = this.findCanonicalKeys(set);
    if (cks) {
      this.purgeCanonicalKeys(cks);
      return cks.data;
    }
  }

  ///////////////////////////////////
  // Private API below this point. //
  ///////////////////////////////////

  // To support fast lookup of CanonicalKeys given any sequence of input keys,
  // we index every set that has been added to the KeySetMap by each of its
  // elements (keys) and by the size of the set. This index structure allows
  // findCanonicalKeys to decide quickly whether a given set of keys has been
  // added already.
  private strong = new Map<any, SizeIndexedSetsOfCanonicalKeys<TData, TKey>>();
  private weak: WeakMap<object, SizeIndexedSetsOfCanonicalKeys<TData, TKey>> =
    // If weakness has been disabled, we still maintain a distinction between
    // strong and weak keys, but we use an ordinary Map for this.weak.
    this.weakness ? new WeakMap : new Map;

  private mapFor(key: TKey): KeySetMap<TData, TKey>["weak" | "strong"] {
    return isObjRef(key) ? this.weak : this.strong;
  }

  // Since the empty set does not have any elements to keep it in the
  // weak/strong maps, we have to handle it specially.
  private empty: CanonicalKeys<TData, TKey> | undefined;

  // Using FinalizationRegistry (when available) allows active removal of
  // resources related to sets with elements that have become unreachable, since
  // the TData associated with such sets can never be accessed again.
  private registry = (
    this.weakness &&
    typeof FinalizationRegistry === "function"
  ) ? new FinalizationRegistry<CanonicalKeys<TData, TKey>>(
    cks => this.purgeCanonicalKeys(cks)
  ) : null;

  private findCanonicalKeys(set: Set<TKey>): CanonicalKeys<TData, TKey> | undefined {
    // It's all too easy, in plain JavaScript, to be passed something other than
    // a Set here, with unpredictable consequences. Instead we throw.
    assertSet(set);

    if (set.size === 0) {
      return this.empty;
    }

    const allSetsOfCanonicalKeys: Set<CanonicalKeys<TData>>[] = [];
    let smallestSetOfCanonicalKeys: Set<CanonicalKeys<TData>> | undefined;

    for (const key of set) {
      const setsOfSameSizeContainingKey =
        this.mapFor(key).get(key as any)?.get(set.size);

      // If any key is in zero sets, then the intersection will be empty, so we
      // can return immediately to avoid extra work.
      if (!setsOfSameSizeContainingKey || setsOfSameSizeContainingKey.size === 0) {
        return;
      }

      // We can save some work by iterating over allSetsOfCanonicalKeys later,
      // rather than iterating over the set of keys again.
      allSetsOfCanonicalKeys.push(setsOfSameSizeContainingKey);

      if (
        !smallestSetOfCanonicalKeys ||
        setsOfSameSizeContainingKey.size < smallestSetOfCanonicalKeys.size
      ) {
        smallestSetOfCanonicalKeys = setsOfSameSizeContainingKey;
      }
    }

    // At this point, we know every key is in at least one set, so we intersect
    // the sets of CanonicalKeys to find the canonical entry for these keys, if
    // one has already been created.
    if (smallestSetOfCanonicalKeys) {
      // Although the result should be the same in any order (set intersection
      // being commutative and associative), we begin the intersection of
      // allSetsOfCanonicalKeys with the smallestSetOfCanonicalKeys, so we never
      // have to consider elements not in that set.
      const intersection = new Set(smallestSetOfCanonicalKeys);

      // Now remove from intersection any CanonicalKeys that are not in every
      // other set as well, so the only remaining CanonicalKeys is the one
      // representing the keys of the original set.
      for (
        let i = 0, len = allSetsOfCanonicalKeys.length;
        // Including this intersection.size check in the for-loop condition
        // allows control to break from the loop immediately if/when the
        // intersection becomes empty, indicating there is no CanonicalKeys
        // entry for these keys (yet).
        i < len && intersection.size > 0;
        ++i
      ) {
        const setOfCanonicalKeys = allSetsOfCanonicalKeys[i];

        if (setOfCanonicalKeys !== smallestSetOfCanonicalKeys) {
          // The setOfCanonicalKeys set may be much larger than the current
          // intersection, so it's important for performance to iterate over the
          // shrinking intersection, checking setOfCanonicalKeys.has, instead of
          // the other way around.
          //
          // To avoid allocating any functions during findCanonicalKeys, we pass
          // Set.prototype.forEach a static callback function (with this ===
          // setOfCanonicalKeys) rather than a freshly allocated function.
          intersection.forEach(removeIfThisDoesNotContain, setOfCanonicalKeys);
        }
      }

      // The intersection set will often be empty here, so the return does not
      // execute, leaving findCanonicalKeys to return undefined. When a single
      // CanonicalKeys is found, intersection will contain exactly that one set,
      // and it will be returned here. I leave it as an exercise for the reader
      // to prove that intersection.size can never be greater than 1. Hint:
      // consider what could happen here if we did not index sets by size, but
      // only by their elements.
      for (const lastRemainingCanonicalKeys of intersection) {
        return lastRemainingCanonicalKeys;
      }
    }
  }

  private recordCanonicalKeys(keys: Iterable<TKey>): CanonicalKeys<TData, TKey> {
    const newSet = new Set(keys);
    const cks: CanonicalKeys<TData, TKey> = newSet.size
      ? { size: newSet.size, keysOrRefs: new Set }
      : this.empty || (this.empty = { size: 0, keysOrRefs: new Set });

    for (const key of newSet) {
      // To make looking up canonical sets fast, we index each canonical newSet by
      // each of its keys and also by its size. This loop populates that index.
      const map = this.mapFor(key);
      let sizeIndex = map.get(key as any);
      if (!sizeIndex) map.set(key as any, sizeIndex = new Map);
      let sets = sizeIndex.get(newSet.size);
      if (!sets) sizeIndex.set(newSet.size, sets = new Set);
      sets.add(cks);

      if (map === this.weak) {
        // By storing only a WeakRef wrapping any object keys, we prevent the
        // KeySetMap from retaining references to garbage-collectible keys.
        cks.keysOrRefs.add(
          this.weakness ? makeKnownWeakRef(key as object) : key
        );

        if (this.registry) {
          // Whenever any weakly-held key is garbage collected, this.registry
          // purges the CanonicalKeys entry for this set from the KeySetMap,
          // removing it from each of the SizeIndexedSetsOfSets associated with
          // the keys of the original set (see purgeCanonicalKeys method below).
          this.registry.register(key as object, cks, cks);
        }
      } else if (map === this.strong) {
        cks.keysOrRefs.add(key);
      }
    }

    if (!hasOwnProperty.call(cks, "data")) {
      cks.data = this.makeData(newSet.keys());
    }

    return cks;
  }

  private purgeCanonicalKeys(cks: CanonicalKeys<TData, TKey>): boolean {
    if (cks && this.registry) {
      // Since we register keys with this.registry.register(key, cks, cks), we
      // can unregister all keys at once by calling this.registry.unregister
      // with the same cks reference. Calling purgeCanonicalKeys for every key
      // in the set should be idempotent/safe, but this active unregistration
      // should prevent unnecessary work, in theory.
      this.registry.unregister(cks);
    }

    if (cks.size === 0 && this.empty === cks) {
      this.empty = void 0;
      return true;
    }

    let modified = false;

    function removeCanonicalKeysForKey(
      map: KeySetMap<TData, TKey>["strong" | "weak"],
      key: any
    ) {
      const index = map.get(key);
      if (index && cks) {
        const setOfSets = index.get(cks.size);
        if (setOfSets && setOfSets.delete(cks)) {
          modified = true;
          if (
            setOfSets.size === 0 &&
            index.delete(cks.size) &&
            index.size === 0
          ) {
            map.delete(key);
          }
        }
      }
    }

    cks.keysOrRefs.forEach(keyOrRef => {
      if (isKnownWeakRef(keyOrRef)) {
        const key = keyOrRef.deref();
        if (key) {
          removeCanonicalKeysForKey(this.weak, key);
        }
      } else {
        removeCanonicalKeysForKey(this.mapFor(keyOrRef), keyOrRef);
      }
    });

    // Ensure idempotence by emptying the keysOrRefs Set.
    cks.keysOrRefs.clear();

    return modified;
  }
}

// Helper callback function for use with Set.prototype.forEach, allowing
//
//   intersection.forEach(cks => {
//     if (!setOfCanonicalKeys.has(cks)) {
//       intersection.delete(cks);
//     }
//   });
//
// to be written as
//
//   intersection.forEach(
//     removeIfThisDoesNotContain,
//     setOfCanonicalKeys,
//   );
//
// Though this code is somewhat less idiomatic, it avoids allocating a new
// function for every call to forEach.
function removeIfThisDoesNotContain<T>(
  this: Set<T>,
  key: T,
  _key: T,
  set: Set<T>,
) {
  if (!this.has(key)) {
    set.delete(key);
  }
}
