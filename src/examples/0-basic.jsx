import { useCallback } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  addEdge,
} from 'reactflow';
import { useNodesState, useEdgesState } from './storeExapmle';
import 'reactflow/dist/style.css';

const initialNodes = [
  { id: '1', position: { x: 0, y: 0 }, data: { label: 'Start Node' } },
  { id: '2', position: { x: 0, y: 100 }, data: { label: 'Middle Node' } },
  { id: '3', position: { x: 200, y: 100 }, data: { label: 'End Node' } },
];

const initialEdges = [
  { id: 'e1-2', source: '1', target: '2' },
  // step: 直线, 直角拐弯. smoothstep: 直线, 带border-radius的直角拐弯.
  { id: 'e2-3', source: '2', type: 'smoothstep', target: '3', animated: true },
];

const basicFlowId = 'basicFlowId';

export default function BasicFlow() {
  const [nodes, setNodes, onNodesChange] = useNodesState(basicFlowId, initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(basicFlowId, initialEdges);

  // 创建新的edge时调用的callback
  const onConnect = useCallback((params) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  return (
    <div className="flow-wrapper">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
      >
        <Controls />
        <MiniMap />
        <Background variant="dots" gap={12} size={1} />
      </ReactFlow>
    </div>
  );
}
