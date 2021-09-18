// A [trie](https://en.wikipedia.org/wiki/Trie) data structure that holds
// object keys weakly, yet can also hold non-object keys, unlike the
// native `WeakMap`.

// If no makeData function is supplied, the looked-up data will be an empty,
// null-prototype Object.
const defaultMakeData = () => Object.create(null);

// Useful for processing arguments objects as well as arrays.
const { slice } = Array.prototype;

// Allocating a whole Trie + Map/WeakMap for every element of every long
// unshared suffix in the Trie can use a lot of memory, so we represent unshared
// suffixes using arrays of keys with Data attached.
type Tail<Data> = any[] & { data: Data; };

function isTail(value: any): value is Tail<any> {
  return Array.isArray(value) && "data" in value;
}

export class Trie<Data> {
  // Since a `WeakMap` cannot hold primitive values as keys, we need a
  // backup `Map` instance to hold primitive keys. Both `this._weakMap`
  // and `this._strongMap` are lazily initialized.
  private weak?: WeakMap<any, Trie<Data> | Tail<Data>>;
  private strong?: Map<any, Trie<Data> | Tail<Data>>;
  private data?: Data;

  constructor(
    private weakness = true,
    private makeData: (array: any[]) => Data = defaultMakeData,
  ) {}

  public lookup<T extends any[]>(...array: T): Data;
  public lookup(): Data {
    return this.lookupArray(arguments);
  }

  public lookupArray<T extends IArguments | any[]>(array: T): Data {
    const length = array.length;
    let node: Trie<Data> = this;

    for (let i = 0; i < length; ++i) {
      const key = array[i];
      const map = node.getMapFor(key);
      const child = map.get(key);

      if (!child) {
        // If no Trie or Tail has been set for this key already (in this map),
        // we can save memory by storing array.slice(i + 1) as a Tail<Data> and
        // returning its data immediately, rather than allocating a full
        // Trie<Data> node for every remaining element of the array.
        const tail = slice.call(array, i + 1) as Tail<Data>;
        map.set(key, tail);
        return tail.data = this.makeData(slice.call(array));
      }

      if (isTail(child)) {
        const tailLength = child.length;
        if (i + tailLength + 1 === length) {
          for (let j = 0; j < tailLength; ++j) {
            // If any key does not match, break out of this for-loop to replace
            // the child Tail with an actual Trie node.
            if (!Object.is(child[j], array[i + 1 + j])) break;
          }
          // If the child Tail matches the remaining array elements, leave the
          // Tail untouched and return child.data.
          return child.data;
        }

        // Keep the array lookup going by allocating a new Trie node to replace
        // the child Tail. The for-loop will continue with this new Trie node,
        // inserting array[i + 1] in the next iteration, so we don't need to
        // worry about that here.
        node = new Trie<Data>(this.weakness, this.makeData);
        map.set(key, node);

        // Slice off the first element of the child Tail, and use it to key a
        // new shorter Tail created from child.slice(1) and child.data.
        const headOfTail = child[0];
        const tailOfTail = slice.call(child, 1) as Tail<Data>;
        tailOfTail.data = child.data;
        // Note: node is the new node we just allocated.
        node.getMapFor(headOfTail).set(headOfTail, tailOfTail);

      } else {
        // If child is a Trie<Data>, continue the for-loop with that node.
        node = child;
      }
    }

    return node.data || (node.data = this.makeData(slice.call(array)));
  }

  private getMapFor(key: any): WeakMap<any, Trie<Data> | Tail<Data>> {
    return this.weakness && isObjRef(key)
      ? this.weak || (this.weak = new WeakMap)
      : this.strong || (this.strong = new Map);
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
