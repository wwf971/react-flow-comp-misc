import React, { useCallback, useRef, useEffect, createContext, useContext } from 'react';
import { atom, useSetAtom, useAtomValue } from 'jotai';

const GraphStoreContext = createContext(null);

const nodeIds = new Set();
const edgeIds = new Set();
const nodeAtomsMap = new Map();
const edgeAtomsMap = new Map();
const nodeSettersMap = new Map();
const edgeSettersMap = new Map();
const nodeToEdgesMap = new Map();
const edgeSourceTargetMap = new Map();

let nodesInitialized = false;
let edgesInitialized = false;

const nodeVersionAtom = atom(0);
const edgeVersionAtom = atom(0);

let nodesCache = [];
const nodeIdToIndex = new Map();
const dirtyNodeIds = new Set();
let nodesCacheNeedsRebuild = true;

function createNodeAtom(id, node) {
  const a = atom(node);
  nodeAtomsMap.set(id, a);
  return a;
}

function createEdgeAtom(id, edge) {
  const a = atom(edge);
  edgeAtomsMap.set(id, a);
  edgeSourceTargetMap.set(id, { source: edge.source, target: edge.target });

  const src = edge.source;
  const tgt = edge.target;
  if (!nodeToEdgesMap.has(src)) nodeToEdgesMap.set(src, new Set());
  nodeToEdgesMap.get(src).add(id);
  if (!nodeToEdgesMap.has(tgt)) nodeToEdgesMap.set(tgt, new Set());
  nodeToEdgesMap.get(tgt).add(id);

  return a;
}

function removeEdgeFromIndex(edgeId) {
  const st = edgeSourceTargetMap.get(edgeId);
  if (!st) return;
  const srcSet = nodeToEdgesMap.get(st.source);
  if (srcSet) {
    srcSet.delete(edgeId);
    if (srcSet.size === 0) nodeToEdgesMap.delete(st.source);
  }
  const tgtSet = nodeToEdgesMap.get(st.target);
  if (tgtSet) {
    tgtSet.delete(edgeId);
    if (tgtSet.size === 0) nodeToEdgesMap.delete(st.target);
  }
  edgeSourceTargetMap.delete(edgeId);
}

const nodesAtom = atom((get) => {
  get(nodeVersionAtom);
  if (nodesCacheNeedsRebuild || nodesCache.length !== nodeIds.size) {
    nodesCache = [];
    nodeIdToIndex.clear();
    let i = 0;
    for (const id of nodeIds) {
      const a = nodeAtomsMap.get(id);
      if (a) {
        nodesCache.push(get(a));
        nodeIdToIndex.set(id, i++);
      }
    }
    nodesCacheNeedsRebuild = false;
  } else {
    for (const id of dirtyNodeIds) {
      const idx = nodeIdToIndex.get(id);
      if (idx !== undefined) {
        const a = nodeAtomsMap.get(id);
        if (a) nodesCache[idx] = get(a);
      }
    }
    dirtyNodeIds.clear();
  }
  return nodesCache;
});

const edgesAtom = atom((get) => {
  get(edgeVersionAtom);
  const list = [];
  for (const id of edgeIds) {
    const a = edgeAtomsMap.get(id);
    if (a) list.push(get(a));
  }
  return list;
});

function initNodes(initialNodes) {
  if (nodesInitialized) return;
  nodesInitialized = true;
  for (const node of initialNodes) {
    nodeIds.add(node.id);
    createNodeAtom(node.id, node);
  }
  return true;
}

function initEdges(initialEdges) {
  if (edgesInitialized) return;
  edgesInitialized = true;
  for (const edge of initialEdges) {
    edgeIds.add(edge.id);
    createEdgeAtom(edge.id, edge);
  }
  return true;
}

function applyNodeChanges(changes, setNodeVersion, setEdgeVersion) {
  for (const c of changes) {
    if (c.type === 'remove') {
      nodeIds.delete(c.id);
      nodeAtomsMap.delete(c.id);
      nodeSettersMap.delete(c.id);

      const connected = nodeToEdgesMap.get(c.id);
      if (connected && connected.size > 0) {
        for (const eid of connected) {
          edgeIds.delete(eid);
          removeEdgeFromIndex(eid);
          edgeAtomsMap.delete(eid);
          edgeSettersMap.delete(eid);
        }
        nodeToEdgesMap.delete(c.id);
        if (setEdgeVersion) setEdgeVersion((v) => v + 1);
      }
      nodesCacheNeedsRebuild = true;
      setNodeVersion((v) => v + 1);
    } else if (c.type === 'add') {
      nodeIds.add(c.item.id);
      createNodeAtom(c.item.id, c.item);
      nodesCacheNeedsRebuild = true;
      setNodeVersion((v) => v + 1);
    } else if (c.type === 'reset') {
      const setter = nodeSettersMap.get(c.item.id);
      if (setter) setter(c.item);
      dirtyNodeIds.add(c.item.id);
      setNodeVersion((v) => v + 1);
    } else {
      const setter = nodeSettersMap.get(c.id);
      if (!setter) continue;
      dirtyNodeIds.add(c.id);
      if (c.type === 'position') {
        setter((n) => {
          n.position = c.position ?? n.position;
          n.positionAbsolute = c.positionAbsolute ?? n.positionAbsolute;
          n.dragging = c.dragging ?? n.dragging;
          return n;
        });
      } else if (c.type === 'dimensions') {
        setter((n) => {
          n.width = c.dimensions?.width ?? n.width;
          n.height = c.dimensions?.height ?? n.height;
          n.resizing = c.resizing ?? n.resizing;
          return n;
        });
      } else if (c.type === 'select') {
        setter((n) => {
          n.selected = c.selected;
          return n;
        });
      }
      setNodeVersion((v) => v + 1);
    }
  }
}

function applyEdgeChanges(changes, setEdgeVersion) {
  for (const c of changes) {
    if (c.type === 'remove') {
      removeEdgeFromIndex(c.id);
      edgeIds.delete(c.id);
      edgeAtomsMap.delete(c.id);
      edgeSettersMap.delete(c.id);
    } else if (c.type === 'add') {
      edgeIds.add(c.item.id);
      createEdgeAtom(c.item.id, c.item);
    } else if (c.type === 'reset') {
      const setter = edgeSettersMap.get(c.item.id);
      if (setter) setter(c.item);
    } else if (c.type === 'select') {
      const setter = edgeSettersMap.get(c.id);
      if (setter) setter((e) => ({ ...e, selected: c.selected }));
    }
  }
}

export function GraphStoreProvider({ initialNodes, initialEdges, children }) {
  const value = useRef({ initialNodes, initialEdges }).current;
  value.initialNodes = initialNodes;
  value.initialEdges = initialEdges;
  return React.createElement(
    GraphStoreContext.Provider,
    { value },
    React.createElement(GraphStoreSetters, null),
    children,
  );
}

export function useNodesState(initialNodes) {
  const ctx = useContext(GraphStoreContext);
  const toInit = initialNodes ?? ctx?.initialNodes;
  if (toInit) initNodes(toInit);
  const nodes = useAtomValue(nodesAtom);
  const nodeVersion = useAtomValue(nodeVersionAtom);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const setNodeVersion = useSetAtom(nodeVersionAtom);

  const setNodes = useCallback(
    (updater) => {
      const next = typeof updater === 'function' ? updater(nodesRef.current) : updater;
      const prevIds = Array.from(nodeAtomsMap.keys());
      for (const id of prevIds) {
        nodeIds.delete(id);
        nodeAtomsMap.delete(id);
        nodeSettersMap.delete(id);
      }
      for (const node of next) {
        nodeIds.add(node.id);
        createNodeAtom(node.id, node);
      }
      nodesCacheNeedsRebuild = true;
      setNodeVersion((v) => v + 1);
    },
    [setNodeVersion],
  );

  const setEdgeVersion = useSetAtom(edgeVersionAtom);

  const onNodesChange = useCallback(
    (changes) => {
      applyNodeChanges(changes, setNodeVersion, setEdgeVersion);
    },
    [setNodeVersion, setEdgeVersion],
  );

  return [nodes, setNodes, onNodesChange, nodeVersion];
}

export function useEdgesState(initialEdges) {
  const ctx = useContext(GraphStoreContext);
  const toInit = initialEdges ?? ctx?.initialEdges;
  if (toInit) initEdges(toInit);
  const edges = useAtomValue(edgesAtom);
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const setEdgeVersion = useSetAtom(edgeVersionAtom);

  const setEdges = useCallback(
    (updater) => {
      const next = typeof updater === 'function' ? updater(edgesRef.current) : updater;
      const prevIds = Array.from(edgeIds);
      for (const id of prevIds) {
        removeEdgeFromIndex(id);
        edgeIds.delete(id);
        edgeAtomsMap.delete(id);
        edgeSettersMap.delete(id);
      }
      for (const edge of next) {
        edgeIds.add(edge.id);
        createEdgeAtom(edge.id, edge);
      }
      setEdgeVersion((v) => v + 1);
    },
    [setEdgeVersion],
  );

  const onEdgesChange = useCallback(
    (changes) => {
      applyEdgeChanges(changes, setEdgeVersion);
      setEdgeVersion((v) => v + 1);
    },
    [setEdgeVersion],
  );

  return [edges, setEdges, onEdgesChange];
}

export function useOnConnect() {
  const setEdgeVersion = useSetAtom(edgeVersionAtom);

  return useCallback(
    (params) => {
      const edgeId =
        params.sourceHandle && params.targetHandle
          ? `${params.source}-${params.sourceHandle}-${params.target}-${params.targetHandle}`
          : `${params.source}-${params.target}`;
      const newEdge = {
        id: edgeId,
        source: params.source,
        target: params.target,
        sourceHandle: params.sourceHandle,
        targetHandle: params.targetHandle,
      };
      edgeIds.add(edgeId);
      createEdgeAtom(edgeId, newEdge);
      setEdgeVersion((v) => v + 1);
    },
    [setEdgeVersion],
  );
}

function NodeSetter({ nodeId }) {
  const a = nodeAtomsMap.get(nodeId);
  const setNode = useSetAtom(a);
  useEffect(() => {
    nodeSettersMap.set(nodeId, setNode);
    return () => nodeSettersMap.delete(nodeId);
  }, [nodeId, setNode]);
  return null;
}

function EdgeSetter({ edgeId }) {
  const a = edgeAtomsMap.get(edgeId);
  const setEdge = useSetAtom(a);
  useEffect(() => {
    edgeSettersMap.set(edgeId, setEdge);
    return () => edgeSettersMap.delete(edgeId);
  }, [edgeId, setEdge]);
  return null;
}

export function GraphStoreSetters() {
  useAtomValue(nodeVersionAtom);
  useAtomValue(edgeVersionAtom);
  const nodeIdList = Array.from(nodeIds);
  const edgeIdList = Array.from(edgeIds);

  return (
    <>
      {nodeIdList.map((id) => (
        <NodeSetter key={id} nodeId={id} />
      ))}
      {edgeIdList.map((id) => (
        <EdgeSetter key={id} edgeId={id} />
      ))}
    </>
  );
}
