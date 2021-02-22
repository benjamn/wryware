import { Canon } from "./canon";
import { isObjectOrArray, last } from "./helpers";

export type Component = Set<object> & {
  asArray: object[];
};

export interface Info {
  order: number;
  handlers: import("./handlers").Handlers;
  children: any[];
  // Set of all objects the same strongly connected component.
  component: Component;
  known?: object;
}

export interface ComponentInfoMap {
  infoMap: Map<object, Info>;
  components: Array<Component>;
}

// Use Dijkstra's stack-based algorithm for finding strongly connected
// components in a graph, returning a ComponentInfoMap that associates
// an Info object with every object in the input graph (map.infoMap),
// along with a list of all components (map.components) in topological
// order, leaves first.
export function buildComponentInfoMap(
  value: any,
  canon: Canon,
): ComponentInfoMap {
  const map: ComponentInfoMap = {
    infoMap: new Map,
    components: [],
  };

  if (isObjectOrArray(value)) {
    let nextOrder = 1;

    // The last/top element of this stack is our best guess which node
    // will be the root node of the next strongly connected component we
    // find. The root of a component is the node in that component that we
    // visited earliest in the depth-first search, which means it has the
    // least info.order of any node in info.component.
    const rootStack: object[] = [];

    // Whenever the recursion unwinds to a point where the root node at
    // the top of rootStack is the node we just finished traversing, we
    // pop off the suffix of compStack that starts with that root node and
    // record those nodes as a strongly-connected component.
    const compStack: object[] = [];

    (function depthFirstScan(input: object) {
      if (canon.isCanonical(input)) return;

      const info = map.infoMap.get(input);
      if (info) {
        // We've seen this node before, either because we just found a
        // cycle, or just because there are multiple paths to this node.
        // Either way, we want to terminate the recursion here, to avoid
        // visiting any node more than once, keeping the traversal linear
        // time (in the number of edges).
        if (!info.component) {
          // If we have not yet assigned info.component, that means we are
          // still exploring the component that contains input, and it must be
          // in the same component as any nodes visited after it along our
          // current path. Since those later nodes cannot be the root of the
          // current component, we discard them from rootStack, which removes
          // them from consideration as possible root nodes of this component.
          // Note that input may not necessarily end up as last(rootStack),
          // since it may already have been removed in favor of an even
          // earlier root node.  When we remove nodes from rootStack, they
          // remain "stranded" in compStack, so we can collect them later into
          // a component, once the recursion finally unwinds back to the root
          // node of the component.
          while (
            rootStack.length > 0 &&
            map.infoMap.get(last(rootStack))!.order > info.order
          ) {
            rootStack.pop();
          }
        }
      } else {
        const handlers = canon.handlers.lookup(input);
        if (!handlers) return;

        // We are encountering this node for the first time, so we assign
        // its info.order number and push it onto both stacks.
        const info = {
          order: nextOrder++,
          handlers,
          children: handlers.deconstruct(input),
        } as Info;

        map.infoMap.set(input, info);
        rootStack.push(input);
        compStack.push(input);

        // Recursively traverse the object children of input.
        info.children.forEach(depthFirstScan);

        // If input is part of a strongly connected component that contains
        // no references to nodes visited previously, that component will be
        // finalized by the time we finish traversing input, so rootStack and
        // compStack will be left in the same state as before the recursion.
        // In other words, last(rootStack) and last(compStack) will both be
        // === input at this point. In this common case, we pop input from
        // both rootStack and compStack, undoing the stack.push(input) calls
        // above. If input is part of the component we are currently
        // exploring, input may have been removed from rootStack, so this
        // condition may fail, which means we will not capture the current
        // component until later, when the recursion unwinds back to the root
        // node of the component.
        if (last(rootStack) === input) {
          rootStack.pop();
          const array = compStack.splice(compStack.lastIndexOf(input));
          const component = new Set(array) as Component;
          component.asArray = array;
          // Now that we have finalized this component, assign it to every
          // node participating in the component.
          component.forEach(elem => {
            map.infoMap.get(elem)!.component = component;
          });
          map.components.push(component);
        }
      }
    })(value);
  }

  return map;
}
