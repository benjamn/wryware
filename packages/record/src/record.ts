import tuple, { Tuple, WeakTrie } from "@wry/tuple";

const recsByTuple = new WeakMap<Tuple<any[]>, Record<any>>();

export class Record<TObj extends object> {
  private constructor(obj: TObj) {
    return Record.from(obj);
  }

  static from<TObj extends object>(obj: TObj): Record<TObj> {
    if (!obj || typeof obj !== "object") return obj;
    if (obj instanceof Record) return obj;
    const keyValueTuples = sortedKeys(obj).map(
      key => tuple(key, (obj as any)[key]));
    const tupleOfKeyValueTuples = tuple(...keyValueTuples);
    let rec = recsByTuple.get(tupleOfKeyValueTuples);
    if (!rec) {
      rec = Object.create(Record.prototype) as Record<TObj>;
      recsByTuple.set(tupleOfKeyValueTuples, rec);
      keyValueTuples.forEach(([key, value]) => (rec as any)[key] = value);
      Object.freeze(rec);
    }
    return rec;
  }

  static isRecord(value: any): value is Record<any> {
    return value instanceof Record;
  }
}

export default Record.from;

const sortingTrie = new WeakTrie<{
  sorted: string[],
}>();

function sortedKeys(obj: object): readonly string[] {
  const keys = Object.keys(obj);
  const node = sortingTrie.lookupArray(keys);
  return node.sorted || Object.freeze(node.sorted = keys.sort());
}
