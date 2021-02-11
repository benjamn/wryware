import { Trie } from "@wry/trie";
import { buildComponentInfoMap, ComponentInfoMap } from "./components";
import { Node, isObjectOrArray, objToStr, numRef, shallowClone } from "./helpers";

export class Canon {
  private known = new Set<object>();
  private pool = new Trie<Node>(true);

  public admit<T>(value: T): T;
  public admit(value: any) {
    if (!isObjectOrArray(value) || this.known.has(value)) {
      return value;
    }
    return this.scanComponents(
      // TODO Need to let buildComponentInfoMap know about this.known.
      buildComponentInfoMap(value),
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
        const info = map.infoMap.get(inputObject)!;
        const knownObject = this.scan(inputObject, map.infoMap);

        if (this.known.has(knownObject)) {
          // This implies the entire component has already been canonized,
          // so we can immediately populate inputInfo.known properties for
          // every object in info.component, and terminate the loop early.
          (function align(input: object, known: object) {
            const inputInfo = map.infoMap.get(input)!;
            if (!inputInfo.known) {
              inputInfo.known = known;
              Object.keys(input).forEach(key => {
                const child = (input as any)[key];
                if (isObjectOrArray(child) && info.component.has(child)) {
                  align(child, (known as any)[key]);
                }
              });
            }
          })(inputObject, knownObject);

          // Terminate the component.asArray.every loop.
          return false;
        }

        // This object still needs to be repaired and frozen before it can
        // be admitted into this.known.
        info.known = knownObject;
        newlyAdmitted.push(inputObject as any);

        // Continue the component.asArray.every loop.
        return true;
      });
    });

    // A function that quickly translates any input object into its (now)
    // known canonical form.
    const getKnown = (input: object) => map.infoMap.get(input)!.known!;

    if (newlyAdmitted.length) {
      newlyAdmitted.forEach(inputObject => {
        const knownObject = getKnown(inputObject) as typeof inputObject;

        // Repair knownObject by translating any unknown object children
        // to their known canonical forms.
        Object.keys(knownObject).forEach(key => {
          const child = knownObject[key];
          if (isObjectOrArray(child) && !this.known.has(child)) {
            knownObject[key] = getKnown(child);
          }
        });

        // Freeze the repaired knownObject and officially admit it into
        // the canon of known canonical objects.
        this.known.add(Object.freeze(knownObject));
      });
    }

    return getKnown;
  }

  private scan<Root extends object>(
    inputRoot: Root,
    infoMap: ComponentInfoMap["infoMap"],
  ): Root {
    const rootInfo = infoMap.get(inputRoot)!;
    // The capital N in Number is not a typo (see numRef comments below).
    const seen = new Map<object, Number>();
    const trace: object[] = [];

    const scan = (input: object) => {
      if (this.known.has(input)) return input;
      if (seen.has(input)) return seen.get(input)!;
      const nextTraceIndex = trace.length;
      seen.set(input, numRef(nextTraceIndex));

      switch (objToStr.call(input)) {
        case "[object Array]": {
          const traceArray: any[] = (input as any[]).map(child => {
            if (isObjectOrArray(child)) {
              if (rootInfo.component.has(child)) {
                return scan(child);
              }
              // TODO Make sure this always succeeds.
              return infoMap.get(child)!.known;
            }
            return child;
          });
          const node = this.pool.lookupArray(traceArray);
          return trace[nextTraceIndex] =
            node.traceArray || (node.traceArray = traceArray);
        }
        case "[object Object]": {
          // TODO
        }
      }
      return input;
    };
    scan(inputRoot);

    const node = this.pool.lookupArray(trace);
    if (!node.known) {
      node.known = shallowClone(inputRoot);
    }
    return node.known as Root;
  }
}
