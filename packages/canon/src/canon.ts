import { Trie } from "@wry/trie";
import { buildComponentInfoMap, ComponentInfoMap } from "./components";
import { isObjectOrArray, numRef } from "./helpers";
import { PrototypeHandlerMap } from "./handlers";

export class Canon {
  public readonly handlers = new PrototypeHandlerMap;

  private known = new Set<object>();
  private pool = new Trie<{
    trace?: any[];
    known?: object;
  }>(true);

  public isCanonical(value: any): boolean {
    return !isObjectOrArray(value) ||
      this.known.has(value) ||
      !this.handlers.lookup(value);
  }

  public admit<T>(value: T): T;
  public admit(value: any) {
    if (this.isCanonical(value)) {
      return value;
    }
    return this.scanComponents(
      buildComponentInfoMap(value, this),
    )(value);
  }

  private scanComponents(map: ComponentInfoMap) {
    const newlyAdmitted: Record<string, unknown>[] = [];

    // TODO Make sure this array is actually sorted in topological order.
    map.components.forEach(component => {
      // Although we might like to use component.forEach here, there's no
      // way to terminate a Set.prototype.forEach loop early without
      // throwing an exception, so we use component.asArray.every instead.
      component.asArray.every(inputObject => {
        if (this.isCanonical(this.scan(inputObject, map.infoMap))) {
          // This implies the entire component has already been canonized,
          // so we can terminate the component.asArray.every loop early.
          return false;
        }
        // This object still needs to be repaired and frozen before it can
        // be admitted into this.known.
        newlyAdmitted.push(inputObject as any);
        // Continue the component.asArray.every loop.
        return true;
      });
    });

    const gotten = new Set<object>();
    const getKnown = (input: object): object => {
      if (this.isCanonical(input)) return input;
      const info = map.infoMap.get(input);
      const known = info && info.known;
      if (known) {
        if (gotten.has(known)) return known;
        gotten.add(known);
        if (!this.isCanonical(known)) {
          // Finish reconstructing the empty known object by translating any
          // unknown object children to their known canonical forms.
          this.handlers.lookup(input)!.refill.call(
            known,
            info!.children.map(getKnown),
          );
          // Freeze the repaired known object and officially admit it into
          // the canon of known canonical objects.
          this.known.add(Object.freeze(known));
        }
        return known;
      }
      return input;
    };

    newlyAdmitted.forEach(getKnown);

    return getKnown;
  }

  private scan<Root extends object>(
    root: Root,
    infoMap: ComponentInfoMap["infoMap"],
  ): Root {
    if (this.isCanonical(root)) return root;
    const rootInfo = infoMap.get(root);
    if (!rootInfo) return root;
    if (rootInfo.known) return rootInfo.known as Root;

    // The capital N in Number is not a typo (see numRef comments below).
    const seen = new Map<object, Number>();
    const traces: object[] = [];

    const scan = (input: object) => {
      if (this.known.has(input)) return input;

      const info = infoMap.get(input);
      if (!info) return input;

      if (seen.has(input)) return seen.get(input)!;
      const nextTraceIndex = traces.length;
      seen.set(input, numRef(nextTraceIndex));

      const handlers = this.handlers.lookup(input);
      if (!handlers) return input;

      const trace = [Object.getPrototypeOf(input)];
      info.children.forEach(child => {
        if (this.isCanonical(child)) {
          trace.push(child);
        } else if (rootInfo.component.has(child)) {
          trace.push(scan(child));
        } else {
          trace.push(this.scan(child, infoMap));
        }
      });

      const node = this.pool.lookupArray(trace);
      return traces[nextTraceIndex] = node.trace || (node.trace = trace);
    };

    if (scan(root) === root) return root;

    const node = this.pool.lookupArray(traces);
    if (!node.known) {
      node.known = this.handlers.lookup(root)!.empty();
    }
    return rootInfo.known = node.known as Root;
  }
}
