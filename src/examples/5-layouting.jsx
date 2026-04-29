import { useCallback } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  addEdge,
} from 'reactflow';
import { useNodesState, useEdgesState } from '../storeMobx';
import 'reactflow/dist/style.css';

const initialNodes = [
  { id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } },
  { id: '2', position: { x: 0, y: 0 }, data: { label: 'B' } },
  { id: '3', position: { x: 0, y: 0 }, data: { label: 'C' } },
  { id: '4', position: { x: 0, y: 0 }, data: { label: 'D' } },
  { id: '5', position: { x: 0, y: 0 }, data: { label: 'E' } },
  { id: '6', position: { x: 0, y: 0 }, data: { label: 'F' } },
];

const initialEdges = [
  { id: 'e1-2', source: '1', target: '2', animated: true },
  { id: 'e1-3', source: '1', target: '3' },
  { id: 'e2-4', source: '2', target: '4' },
  { id: 'e2-5', source: '2', target: '5' },
  { id: 'e3-6', source: '3', target: '6' },
];

const layoutFlowId = 'layoutFlowId';

// Simple horizontal layout
const horizontalLayout = (nodes) => {
  return nodes.map((node, index) => ({
    ...node,
    position: { x: index * 150, y: 100 },
  }));
};

// Simple vertical layout
const verticalLayout = (nodes) => {
  return nodes.map((node, index) => ({
    ...node,
    position: { x: 100, y: index * 100 },
  }));
};

// Simple tree layout
const treeLayout = (nodes, edges) => {
  const levels = {};
  const visited = new Set();

  // Find root nodes (nodes with no incoming edges)
  const rootNodes = nodes.filter(
    (node) => !edges.some((edge) => edge.target === node.id)
  );

  // BFS to assign levels
  const queue = rootNodes.map((node) => ({ id: node.id, level: 0 }));
  rootNodes.forEach((node) => visited.add(node.id));

  while (queue.length > 0) {
    const { id, level } = queue.shift();
    if (!levels[level]) levels[level] = [];
    levels[level].push(id);

    edges
      .filter((edge) => edge.source === id && !visited.has(edge.target))
      .forEach((edge) => {
        visited.add(edge.target);
        queue.push({ id: edge.target, level: level + 1 });
      });
  }

  // Position nodes based on levels
  return nodes.map((node) => {
    const level = Object.keys(levels).find((l) => levels[l].includes(node.id)) || 0;
    const indexInLevel = levels[level].indexOf(node.id);
    return {
      ...node,
      position: {
        x: indexInLevel * 150 + 50,
        y: parseInt(level) * 100 + 50,
      },
    };
  });
};

export default function LayoutFlow() {
  const [nodes, setNodes, onNodesChange] = useNodesState(layoutFlowId, initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutFlowId, initialEdges);

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const applyHorizontalLayout = useCallback(() => {
    setNodes((nds) => horizontalLayout(nds));
  }, [setNodes]);

  const applyVerticalLayout = useCallback(() => {
    setNodes((nds) => verticalLayout(nds));
  }, [setNodes]);

  const applyTreeLayout = useCallback(() => {
    setNodes((nds) => treeLayout(nds, edges));
  }, [setNodes, edges]);

  return (
    <div style={{ width: '100%', height: '600px' }}>
      <div style={{ marginBottom: '8px', display: 'flex', gap: '8px' }}>
        <button onClick={applyHorizontalLayout} style={{ padding: '4px 8px' }}>
          Horizontal Layout
        </button>
        <button onClick={applyVerticalLayout} style={{ padding: '4px 8px' }}>
          Vertical Layout
        </button>
        <button onClick={applyTreeLayout} style={{ padding: '4px 8px' }}>
          Tree Layout
        </button>
      </div>
      <div style={{ width: '100%', height: '550px' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
        >
          <Controls />
          <Background variant="dots" gap={12} size={1} />
        </ReactFlow>
      </div>
    </div>
  );
}
