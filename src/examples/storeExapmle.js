import { createContext, createElement, useCallback, useContext, useEffect, useState } from 'react';
import { makeAutoObservable } from 'mobx';
import { useObserver } from 'mobx-react-lite';
import { applyNodeChanges, applyEdgeChanges } from 'reactflow';

const GraphStoreContext = createContext(null);

class GraphStore {
  graphById = {};

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  ensureGraphData(graphId) {
    if (!this.graphById[graphId]) {
      this.graphById[graphId] = {
        nodes: [],
        edges: [],
        nodeVersion: 0,
        edgeVersion: 0,
        isNodesInitialized: false,
        isEdgesInitialized: false,
      };
    }
    return this.graphById[graphId];
  }

  ensureNodesInitialized(graphId, initialNodes) {
    const graphData = this.ensureGraphData(graphId);
    if (graphData.isNodesInitialized || !initialNodes) return;
    graphData.nodes = initialNodes;
    graphData.isNodesInitialized = true;
    graphData.nodeVersion += 1;
  }

  ensureEdgesInitialized(graphId, initialEdges) {
    const graphData = this.ensureGraphData(graphId);
    if (graphData.isEdgesInitialized || !initialEdges) return;
    graphData.edges = initialEdges;
    graphData.isEdgesInitialized = true;
    graphData.edgeVersion += 1;
  }

  setNodes(graphId, updater) {
    const graphData = this.ensureGraphData(graphId);
    const nextNodes = typeof updater === 'function' ? updater(graphData.nodes) : updater;
    graphData.nodes = nextNodes;
    graphData.nodeVersion += 1;
  }

  setEdges(graphId, updater) {
    const graphData = this.ensureGraphData(graphId);
    const nextEdges = typeof updater === 'function' ? updater(graphData.edges) : updater;
    graphData.edges = nextEdges;
    graphData.edgeVersion += 1;
  }

  onNodesChange(graphId, changes) {
    if (!changes?.length) return;
    const graphData = this.ensureGraphData(graphId);

    const removedNodeIds = new Set();
    for (const change of changes) {
      if (change.type === 'remove') {
        removedNodeIds.add(change.id);
      }
    }

    graphData.nodes = applyNodeChanges(changes, graphData.nodes);
    graphData.nodeVersion += 1;

    if (removedNodeIds.size > 0) {
      const nextEdges = graphData.edges.filter(
        (edge) => !removedNodeIds.has(edge.source) && !removedNodeIds.has(edge.target)
      );
      if (nextEdges.length !== graphData.edges.length) {
        graphData.edges = nextEdges;
        graphData.edgeVersion += 1;
      }
    }
  }

  onEdgesChange(graphId, changes) {
    if (!changes?.length) return;
    const graphData = this.ensureGraphData(graphId);
    graphData.edges = applyEdgeChanges(changes, graphData.edges);
    graphData.edgeVersion += 1;
  }

  onConnect(graphId, params) {
    const graphData = this.ensureGraphData(graphId);
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
    graphData.edges = [...graphData.edges, newEdge];
    graphData.edgeVersion += 1;
  }
}

function useGraphStore() {
  const store = useContext(GraphStoreContext);
  if (!store) {
    throw new Error('useGraphStore must be used inside GraphStoreProvider');
  }
  return store;
}

export function GraphStoreProvider({ children }) {
  const [store] = useState(() => new GraphStore());
  return createElement(GraphStoreContext.Provider, { value: store }, children);
}

export function useNodesState(graphId, initialNodes) {
  const store = useGraphStore();

  useEffect(() => {
    store.ensureNodesInitialized(graphId, initialNodes);
  }, [store, graphId, initialNodes]);

  const nodes = useObserver(() => store.ensureGraphData(graphId).nodes);
  const nodeVersion = useObserver(() => store.ensureGraphData(graphId).nodeVersion);

  const setNodes = useCallback((updater) => {
    store.setNodes(graphId, updater);
  }, [store, graphId]);

  const onNodesChange = useCallback((changes) => {
    store.onNodesChange(graphId, changes);
  }, [store, graphId]);

  return [nodes, setNodes, onNodesChange, nodeVersion];
}

export function useEdgesState(graphId, initialEdges) {
  const store = useGraphStore();

  useEffect(() => {
    store.ensureEdgesInitialized(graphId, initialEdges);
  }, [store, graphId, initialEdges]);

  const edges = useObserver(() => store.ensureGraphData(graphId).edges);

  const setEdges = useCallback((updater) => {
    store.setEdges(graphId, updater);
  }, [store, graphId]);

  const onEdgesChange = useCallback((changes) => {
    store.onEdgesChange(graphId, changes);
  }, [store, graphId]);

  return [edges, setEdges, onEdgesChange];
}

export function useOnConnect(graphId) {
  const store = useGraphStore();

  return useCallback((params) => {
    store.onConnect(graphId, params);
  }, [store, graphId]);
}
