import { createContext, createElement, useCallback, useContext, useEffect, useState } from 'react';
import { action, makeObservable, observable } from 'mobx';
import { useObserver } from 'mobx-react-lite';
import { applyNodeChanges, applyEdgeChanges } from 'reactflow';

const GraphStoreContext = createContext(null);
export const basicDataKey = 'basicData';
export const extraDataKey = 'extraData';

export function cloneData(value) {
  if (value == null) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((item) => cloneData(item));
  }
  return { ...value };
}

export function normalizeBasicData(graphId, targetType, targetId, incomingData) {
  const hasNamedBasicData =
    incomingData &&
    typeof incomingData === 'object' &&
    incomingData[basicDataKey] &&
    typeof incomingData[basicDataKey] === 'object';
  const nextBasicData = hasNamedBasicData ? { ...incomingData[basicDataKey] } : {};
  if (!hasNamedBasicData && incomingData && typeof incomingData === 'object') {
    if (typeof incomingData.label === 'string') {
      nextBasicData.label = incomingData.label;
    }
    if (typeof incomingData.description === 'string') {
      nextBasicData.description = incomingData.description;
    }
  }
  nextBasicData.graphId = graphId;
  if (targetType === 'node') {
    nextBasicData.nodeId = targetId;
  } else {
    nextBasicData.edgeId = targetId;
  }
  return nextBasicData;
}

export function normalizeExtraData(incomingData, existingExtraData) {
  if (incomingData == null || typeof incomingData !== 'object') {
    return existingExtraData ?? {};
  }
  if (
    Object.prototype.hasOwnProperty.call(incomingData, basicDataKey) ||
    Object.prototype.hasOwnProperty.call(incomingData, extraDataKey)
  ) {
    if (Object.prototype.hasOwnProperty.call(incomingData, extraDataKey)) {
      const nextExtraData = incomingData[extraDataKey];
      return nextExtraData && typeof nextExtraData === 'object' ? nextExtraData : {};
    }
    const nextExtraData = { ...incomingData };
    delete nextExtraData[basicDataKey];
    return Object.keys(nextExtraData).length > 0 ? nextExtraData : existingExtraData ?? {};
  }
  return incomingData;
}

export function normalizeNodes(graphId, nodes, existingNodeExtraDataById = {}) {
  const nextNodeExtraDataById = {};
  const nextNodes = (nodes ?? []).map((node) => {
    const existingExtraData = existingNodeExtraDataById[node.id];
    const nextBasicData = normalizeBasicData(graphId, 'node', node.id, node.data);
    const nextExtraData = normalizeExtraData(node.data, existingExtraData);
    nextNodeExtraDataById[node.id] = cloneData(nextExtraData ?? {});
    return {
      ...node,
      data: {
        basicData: nextBasicData,
      },
    };
  });
  return {
    nodes: nextNodes,
    nodeExtraDataById: nextNodeExtraDataById,
  };
}

export function normalizeEdges(graphId, edges, existingEdgeExtraDataById = {}) {
  const nextEdgeExtraDataById = {};
  const nextEdges = (edges ?? []).map((edge) => {
    const existingExtraData = existingEdgeExtraDataById[edge.id];
    const nextBasicData = normalizeBasicData(graphId, 'edge', edge.id, edge.data);
    const nextExtraData = normalizeExtraData(edge.data, existingExtraData);
    nextEdgeExtraDataById[edge.id] = cloneData(nextExtraData ?? {});
    return {
      ...edge,
      data: {
        basicData: nextBasicData,
      },
    };
  });
  return {
    edges: nextEdges,
    edgeExtraDataById: nextEdgeExtraDataById,
  };
}

export class BaseGraphStore {
  graphById = {};

  constructor() {
    makeObservable(this, {
      graphById: observable,
      ensureGraphData: action.bound,
      ensureNodesInitialized: action.bound,
      ensureEdgesInitialized: action.bound,
      setNodes: action.bound,
      setEdges: action.bound,
      onNodesChange: action.bound,
      onEdgesChange: action.bound,
      onConnect: action.bound,
      setExtraData: action.bound,
    });
  }

  ensureGraphData(graphId) {
    if (!this.graphById[graphId]) {
      this.graphById[graphId] = {
        nodes: [],
        edges: [],
        nodeExtraDataById: {},
        edgeExtraDataById: {},
        nodeVersion: 0,
        edgeVersion: 0,
        nodeExtraVersion: 0,
        edgeExtraVersion: 0,
        isNodesInitialized: false,
        isEdgesInitialized: false,
      };
    }
    return this.graphById[graphId];
  }

  ensureNodesInitialized(graphId, initialNodes) {
    const graphData = this.ensureGraphData(graphId);
    if (graphData.isNodesInitialized || !initialNodes) return;
    const normalizedNodesResult = normalizeNodes(
      graphId,
      initialNodes,
      graphData.nodeExtraDataById
    );
    graphData.nodes = normalizedNodesResult.nodes;
    graphData.nodeExtraDataById = normalizedNodesResult.nodeExtraDataById;
    graphData.isNodesInitialized = true;
    graphData.nodeVersion += 1;
    graphData.nodeExtraVersion += 1;
  }

  ensureEdgesInitialized(graphId, initialEdges) {
    const graphData = this.ensureGraphData(graphId);
    if (graphData.isEdgesInitialized || !initialEdges) return;
    const normalizedEdgesResult = normalizeEdges(
      graphId,
      initialEdges,
      graphData.edgeExtraDataById
    );
    graphData.edges = normalizedEdgesResult.edges;
    graphData.edgeExtraDataById = normalizedEdgesResult.edgeExtraDataById;
    graphData.isEdgesInitialized = true;
    graphData.edgeVersion += 1;
    graphData.edgeExtraVersion += 1;
  }

  setNodes(graphId, updater) {
    const graphData = this.ensureGraphData(graphId);
    const nextNodes = typeof updater === 'function' ? updater(graphData.nodes) : updater;
    const normalizedNodesResult = normalizeNodes(graphId, nextNodes, graphData.nodeExtraDataById);
    graphData.nodes = normalizedNodesResult.nodes;
    graphData.nodeExtraDataById = normalizedNodesResult.nodeExtraDataById;
    graphData.nodeVersion += 1;
    graphData.nodeExtraVersion += 1;
  }

  setEdges(graphId, updater) {
    const graphData = this.ensureGraphData(graphId);
    const nextEdges = typeof updater === 'function' ? updater(graphData.edges) : updater;
    const normalizedEdgesResult = normalizeEdges(graphId, nextEdges, graphData.edgeExtraDataById);
    graphData.edges = normalizedEdgesResult.edges;
    graphData.edgeExtraDataById = normalizedEdgesResult.edgeExtraDataById;
    graphData.edgeVersion += 1;
    graphData.edgeExtraVersion += 1;
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

    const changedNodes = applyNodeChanges(changes, graphData.nodes);
    const normalizedNodesResult = normalizeNodes(graphId, changedNodes, graphData.nodeExtraDataById);
    graphData.nodes = normalizedNodesResult.nodes;
    graphData.nodeExtraDataById = normalizedNodesResult.nodeExtraDataById;
    graphData.nodeVersion += 1;
    graphData.nodeExtraVersion += 1;

    if (removedNodeIds.size > 0) {
      const nextEdges = graphData.edges.filter(
        (edge) => !removedNodeIds.has(edge.source) && !removedNodeIds.has(edge.target)
      );
      if (nextEdges.length !== graphData.edges.length) {
        const normalizedEdgesResult = normalizeEdges(
          graphId,
          nextEdges,
          graphData.edgeExtraDataById
        );
        graphData.edges = normalizedEdgesResult.edges;
        graphData.edgeExtraDataById = normalizedEdgesResult.edgeExtraDataById;
        graphData.edgeVersion += 1;
        graphData.edgeExtraVersion += 1;
      }
    }
  }

  onEdgesChange(graphId, changes) {
    if (!changes?.length) return;
    const graphData = this.ensureGraphData(graphId);
    const changedEdges = applyEdgeChanges(changes, graphData.edges);
    const normalizedEdgesResult = normalizeEdges(graphId, changedEdges, graphData.edgeExtraDataById);
    graphData.edges = normalizedEdgesResult.edges;
    graphData.edgeExtraDataById = normalizedEdgesResult.edgeExtraDataById;
    graphData.edgeVersion += 1;
    graphData.edgeExtraVersion += 1;
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
    const normalizedEdgesResult = normalizeEdges(
      graphId,
      [...graphData.edges, newEdge],
      graphData.edgeExtraDataById
    );
    graphData.edges = normalizedEdgesResult.edges;
    graphData.edgeExtraDataById = normalizedEdgesResult.edgeExtraDataById;
    graphData.edgeVersion += 1;
    graphData.edgeExtraVersion += 1;
  }

  getExtraData(graphId, targetType, targetId) {
    const graphData = this.ensureGraphData(graphId);
    if (targetType === 'node') {
      return graphData.nodeExtraDataById[targetId];
    }
    return graphData.edgeExtraDataById[targetId];
  }

  setExtraData(graphId, targetType, targetId, updater) {
    const graphData = this.ensureGraphData(graphId);
    const currentExtraData = this.getExtraData(graphId, targetType, targetId) ?? {};
    const nextExtraData =
      typeof updater === 'function' ? updater(cloneData(currentExtraData)) : updater;
    if (targetType === 'node') {
      graphData.nodeExtraDataById[targetId] = cloneData(nextExtraData ?? {});
      graphData.nodeExtraVersion += 1;
      return;
    }
    graphData.edgeExtraDataById[targetId] = cloneData(nextExtraData ?? {});
    graphData.edgeExtraVersion += 1;
  }
}

export class GraphStore extends BaseGraphStore {}

function useGraphStore() {
  const store = useContext(GraphStoreContext);
  if (!store) {
    throw new Error('useGraphStore must be used inside GraphStoreProvider');
  }
  return store;
}

export function GraphStoreProvider({ children, storeFactory }) {
  const [store] = useState(() => {
    if (storeFactory) {
      return storeFactory();
    }
    return new GraphStore();
  });
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

export function useGraphDataApi(graphId) {
  const store = useGraphStore();
  const getExtraData = useCallback(
    (targetType, targetId) => {
      return store.getExtraData(graphId, targetType, targetId);
    },
    [store, graphId]
  );
  const setExtraData = useCallback(
    (targetType, targetId, updater) => {
      store.setExtraData(graphId, targetType, targetId, updater);
    },
    [store, graphId]
  );
  const nodeExtraVersion = useObserver(() => store.ensureGraphData(graphId).nodeExtraVersion);
  const edgeExtraVersion = useObserver(() => store.ensureGraphData(graphId).edgeExtraVersion);
  return {
    getExtraData,
    setExtraData,
    nodeExtraVersion,
    edgeExtraVersion,
  };
}

export function useExtraData(graphId, targetType, targetId) {
  const store = useGraphStore();
  return useObserver(() => {
    if (!graphId || !targetId) return undefined;
    return store.getExtraData(graphId, targetType, targetId);
  });
}

export function useOnConnect(graphId) {
  const store = useGraphStore();

  return useCallback((params) => {
    store.onConnect(graphId, params);
  }, [store, graphId]);
}
