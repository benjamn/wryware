// A trie data structure that holds object keys weakly, yet can also hold
// non-object keys, unlike the native `WeakMap`.

// If no makeData function is supplied, the looked-up data will be an empty,
// no-prototype Object.
const defaultMakeData = () => Object.create(null);

export class WeakTrie<K> {
  // Since a `WeakMap` cannot hold primitive values as keys, we need a
  // backup `Map` instance to hold primitive keys. Both `this._weakMap`
  // and `this._strongMap` are lazily initialized.
  private weak?: WeakMap<any, WeakTrie<K>>;
  private strong?: Map<any, WeakTrie<K>>;
  private data?: K;

  constructor(
    private weakness = typeof WeakMap === "function",
    private makeData: (array: any[]) => K = defaultMakeData,
  ) {}

  public lookup<T extends any[]>(...array: T): K {
    return this.lookupArray(array);
  }

  public lookupArray<T extends any[]>(array: T): K {
    let node: WeakTrie<K> = this;
    array.forEach(key => node = node.getChildTrie(key));
    return node.data || (node.data = this.makeData(array.slice(0)));
  }

  private getChildTrie(key: any) {
    const map = this.weakness && safeForWeakMap(key)
      ? this.weak || (this.weak = new WeakMap<any, WeakTrie<K>>())
      : this.strong || (this.strong = new Map<any, WeakTrie<K>>());
    let child = map.get(key);
    if (!child) map.set(key, child = new WeakTrie<K>(this.weakness, this.makeData));
    return child;
  }
}

// Equivalent to checking Object(value) === value, but without creating so
// many throwaway objects for primitive values.
function safeForWeakMap(value: any) {
  switch (typeof value) {
  case "object": if (!value) break;
  case "function": return true;
  }
  return false;
}
