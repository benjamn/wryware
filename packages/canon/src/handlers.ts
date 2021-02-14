import { Trie } from "@wry/trie";

type Handlers = Parameters<PrototypeHandlerMap["enable"]>[1];

type SortedKeysInfo = {
  sorted: string[];
  json: string;
};

export class PrototypeHandlerMap {
  private map = new Map<object | null, Handlers>();
  private keyTrie = new Trie<{
    keys?: SortedKeysInfo;
  }>(false);

  constructor() {
    this.enable(Array.prototype, {
      toArray: array => array,
      empty: () => [],
      refill(array) {
        this.push.apply(this, array);
      },
    });

    const self = this;
    const objectProtos = [null, Object.prototype];
    objectProtos.forEach(proto => this.enable(proto, {
      toArray(obj) {
        const keys = self.sortedKeys(obj);
        const array = [keys.json];
        keys.sorted.forEach(key => array.push((obj as any)[key]));
        return array;
      },
      empty: () => Object.create(proto),
      refill(array) {
        self.keysByJSON.get(array[0])!.sorted.forEach((key, i) => {
          (this as any)[key] = array[i + 1];
        });
      },
    }));
  }

  public enable<P extends object, C extends any[]>(
    prototype: P | null,
    handlers: {
      toArray: (instance: P) => C;
      empty?: () => P,
      refill: (this: P, array: C) => P | void;
    },
  ) {
    // TODO Disallow this if anything has already been admitted?
    this.map.set(prototype, Object.freeze(handlers) as any);
  }

  public lookup(instance: object) {
    return this.map.get(Object.getPrototypeOf(instance));
  }

  // It's worthwhile to cache the sorting of arrays of strings, since the
  // same initial unsorted arrays tend to be encountered many times.
  // Fortunately, we can reuse the Trie machinery to look up the sorted
  // arrays in linear time (which is faster than sorting large arrays).
  private sortedKeys(obj: object) {
    const keys = Object.keys(obj);
    const node = this.keyTrie.lookupArray(keys);
    if (!node.keys) {
      keys.sort();
      const json = JSON.stringify(keys);
      if (!(node.keys = this.keysByJSON.get(json))) {
        this.keysByJSON.set(json, node.keys = { sorted: keys, json });
      }
    }
    return node.keys;
  }
  // Arrays that contain the same elements in a different order can share
  // the same SortedKeysInfo object, to save memory.
  private keysByJSON = new Map<string, SortedKeysInfo>();
}
