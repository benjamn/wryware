// A [trie](https://en.wikipedia.org/wiki/Trie) data structure that holds
// object keys weakly, yet can also hold non-object keys, unlike the
// native `WeakMap`.

// If no makeData function is supplied, the looked-up data will be an empty,
// null-prototype Object.
const defaultMakeData = () => Object.create(null);

const { slice } = Array.prototype;

export class Trie<Data> {
  // Since a `WeakMap` cannot hold primitive values as keys, we need a
  // backup `Map` instance to hold primitive keys. Both `this._weakMap`
  // and `this._strongMap` are lazily initialized.
  private weak?: WeakMap<any, Trie<Data>>;
  private strong?: Map<any, Trie<Data>>;
  private data?: Data;

  constructor(
    private weakness = true,
    private makeData: (array: any[]) => Data = defaultMakeData,
  ) {}

  public lookup<T extends any[]>(...array: T): Data {
    return this.lookupArray(array);
  }

  public lookupArray<T extends IArguments | any[]>(array: T): Data {
    const { length } = array;
    let node: Trie<Data> = this;
    for (let i = 0; i < length; ++i) {
      node = node.getChildTrie(array[i]);
    }
    return node.data || (node.data = this.makeData(slice.call(array)));
  }

  private getChildTrie(key: any) {
    const map = this.weakness && isObjRef(key)
      ? this.weak || (this.weak = new WeakMap<any, Trie<Data>>())
      : this.strong || (this.strong = new Map<any, Trie<Data>>());
    let child = map.get(key);
    if (!child) map.set(key, child = new Trie<Data>(this.weakness, this.makeData));
    return child;
  }
}

function isObjRef(value: any) {
  switch (typeof value) {
  case "object":
    if (value === null) break;
    // Fall through to return true...
  case "function":
    return true;
  }
  return false;
}
