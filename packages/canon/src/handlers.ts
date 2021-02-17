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
      deconstruct(array) {
        return array;
      },
      reconstruct(empty, children) {
        if (children) {
          empty.length = children.length;
          children.forEach((child, i) => empty[i] = child);
        } else {
          return [];
        }
      }
    });

    const self = this;
    const objectProtos = [null, Object.prototype];
    objectProtos.forEach(proto => this.enable(proto, {
      deconstruct(obj: Record<string, any>) {
        const keys = self.sortedKeys(obj);
        const children = [keys.json];
        keys.sorted.forEach(key => children.push(obj[key]));
        return children;
      },
      reconstruct(empty: Record<string, any>, children) {
        if (children) {
          self.keysByJSON.get(children[0])!.sorted.forEach((key, i) => {
            empty[key] = children[i + 1];
          });
        } else {
          return Object.create(proto);
        }
      },
    }));
  }

  public enable<P extends object, C extends any[]>(
    prototype: P | null,
    handlers: {
      deconstruct(instance: P): C;
      reconstruct(instance: P, array?: C): P | void;
    },
  ) {
    if (this.usedPrototypes.has(prototype)) {
      throw new Error("Cannot enable prototype that has already been looked up");
    }
    this.map.set(prototype, Object.freeze(handlers) as any);
  }

  private usedPrototypes = new Set<object | null>();
  public lookup(instance: object) {
    const proto = Object.getPrototypeOf(instance);
    this.usedPrototypes.add(proto);
    return this.map.get(proto);
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
