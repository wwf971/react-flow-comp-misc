import { createContext, createElement, useCallback, useContext, useEffect, useState } from 'react';
import { makeAutoObservable } from 'mobx';
import { useObserver } from 'mobx-react-lite';
import { applyNodeChanges, applyEdgeChanges } from 'reactflow';

const GraphStoreContext = createContext(null);

class GraphStore {
  nodes = [];
  edges = [];
  nodeVersion = 0;
  edgeVersion = 0;
  isNodesInitialized = false;
  isEdgesInitialized = false;

  constructor(initialNodes = [], initialEdges = []) {
    this.nodes = initialNodes;
    this.edges = initialEdges;
    this.isNodesInitialized = initialNodes.length > 0;
    this.isEdgesInitialized = initialEdges.length > 0;

    makeAutoObservable(this, {}, { autoBind: true });
  }

  ensureNodesInitialized(initialNodes) {
    if (this.isNodesInitialized || !initialNodes) return;
    this.nodes = initialNodes;
    this.isNodesInitialized = true;
    this.nodeVersion += 1;
  }

  ensureEdgesInitialized(initialEdges) {
    if (this.isEdgesInitialized || !initialEdges) return;
    this.edges = initialEdges;
    this.isEdgesInitialized = true;
    this.edgeVersion += 1;
  }

  setNodes(updater) {
    const nextNodes = typeof updater === 'function' ? updater(this.nodes) : updater;
    this.nodes = nextNodes;
    this.nodeVersion += 1;
  }

  setEdges(updater) {
    const nextEdges = typeof updater === 'function' ? updater(this.edges) : updater;
    this.edges = nextEdges;
    this.edgeVersion += 1;
  }

  onNodesChange(changes) {
    if (!changes?.length) return;

    const removedNodeIds = new Set();
    for (const change of changes) {
      if (change.type === 'remove') {
        removedNodeIds.add(change.id);
      }
    }

    this.nodes = applyNodeChanges(changes, this.nodes);
    this.nodeVersion += 1;

    if (removedNodeIds.size > 0) {
      const nextEdges = this.edges.filter(
        (edge) => !removedNodeIds.has(edge.source) && !removedNodeIds.has(edge.target)
      );
      if (nextEdges.length !== this.edges.length) {
        this.edges = nextEdges;
        this.edgeVersion += 1;
      }
    }
  }

  onEdgesChange(changes) {
    if (!changes?.length) return;
    this.edges = applyEdgeChanges(changes, this.edges);
    this.edgeVersion += 1;
  }

  onConnect(params) {
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
    this.edges = [...this.edges, newEdge];
    this.edgeVersion += 1;
  }
}

function useGraphStore() {
  const store = useContext(GraphStoreContext);
  if (!store) {
    throw new Error('useGraphStore must be used inside GraphStoreProvider');
  }
  return store;
}

export function GraphStoreProvider({ initialNodes = [], initialEdges = [], children }) {
  const [store] = useState(() => new GraphStore(initialNodes, initialEdges));
  return createElement(GraphStoreContext.Provider, { value: store }, children);
}

export function useNodesState(initialNodes) {
  const store = useGraphStore();

  useEffect(() => {
    store.ensureNodesInitialized(initialNodes);
  }, [store, initialNodes]);

  const nodes = useObserver(() => store.nodes);
  const nodeVersion = useObserver(() => store.nodeVersion);

  const setNodes = useCallback((updater) => {
    store.setNodes(updater);
  }, [store]);

  const onNodesChange = useCallback((changes) => {
    store.onNodesChange(changes);
  }, [store]);

  return [nodes, setNodes, onNodesChange, nodeVersion];
}

export function useEdgesState(initialEdges) {
  const store = useGraphStore();

  useEffect(() => {
    store.ensureEdgesInitialized(initialEdges);
  }, [store, initialEdges]);

  const edges = useObserver(() => store.edges);

  const setEdges = useCallback((updater) => {
    store.setEdges(updater);
  }, [store]);

  const onEdgesChange = useCallback((changes) => {
    store.onEdgesChange(changes);
  }, [store]);

  return [edges, setEdges, onEdgesChange];
}

export function useOnConnect() {
  const store = useGraphStore();

  return useCallback((params) => {
    store.onConnect(params);
  }, [store]);
}
