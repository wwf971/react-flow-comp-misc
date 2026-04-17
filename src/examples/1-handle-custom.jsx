import { useCallback } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  addEdge,
  Handle,
  Position,
} from 'reactflow';
import { useNodesState, useEdgesState } from './storeExapmle';
import 'reactflow/dist/style.css';

function NodeCircle({ data }) {
  const handleCount = typeof data.handleCount === 'number' ? data.handleCount : 5;
  const startAngle = typeof data.startAngle === 'number' ? data.startAngle : -90;

  const handles = Array.from({ length: handleCount }).map((_, index) => {
    const angleDeg = startAngle + (360 / handleCount) * index;
    const angleRad = (angleDeg * Math.PI) / 180;
    const radius = 50;
    const center = 50;
    const x = center + radius * Math.cos(angleRad);
    const y = center + radius * Math.sin(angleRad);

    return (
      <Handle
        key={index}
        type="source"
        position={Position.Right}
        id={`circle-${index}`}
        style={{
          left: `${x}%`,
          top: `${y}%`,
          transform: 'translate(-50%, -50%)',
        }}
        className="circle-node-handle"
      />
    );
  });

  return (
    <div className="circle-node">
      <svg className="circle-node-svg" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="48" />
      </svg>
      <div className="circle-node-label">{data.label}</div>
      {handles}
    </div>
  );
}

function TripleHandleNode({ data }) {
  return (
    <div className="custom-node">
      <div className="custom-node-label">{data.label}</div>
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="custom-node-handle"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right-1"
        className="custom-node-handle"
        style={{ top: '25%' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right-2"
        className="custom-node-handle"
        style={{ top: '50%' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right-3"
        className="custom-node-handle"
        style={{ top: '75%' }}
      />
    </div>
  );
}

const nodeTypes = {
  tripleHandle: TripleHandleNode,
  circle: NodeCircle,
};

const initialNodes = [
  {
    id: 'a',
    type: 'tripleHandle',
    position: { x: 0, y: 80 },
    data: { label: 'Three handles on right edge' },
  },
  {
    id: 'b',
    position: { x: 220, y: 20 },
    data: { label: 'Top target' },
  },
  {
    id: 'c',
    position: { x: 220, y: 80 },
    data: { label: 'Middle target' },
  },
  {
    id: 'd',
    position: { x: 220, y: 140 },
    data: { label: 'Bottom target' },
  },
  {
    id: 'circle-1',
    type: 'circle',
    position: { x: 0, y: 260 },
    data: { label: 'Circle 5 handles', handleCount: 5, startAngle: -90 },
  },
  {
    id: 'circle-target-1',
    position: { x: 220, y: 240 },
    data: { label: 'Circle target 1' },
  },
  {
    id: 'circle-target-2',
    position: { x: 220, y: 300 },
    data: { label: 'Circle target 2' },
  },
];

const initialEdges = [
  { id: 'e-a-b', source: 'a', sourceHandle: 'right-1', target: 'b', type: 'step' },
  { id: 'e-a-c', source: 'a', sourceHandle: 'right-2', target: 'c', type: 'step' },
  { id: 'e-a-d', source: 'a', sourceHandle: 'right-3', target: 'd', type: 'step' },
  { id: 'e-circle-1', source: 'circle-1', sourceHandle: 'circle-0', target: 'circle-target-1', type: 'default' },
  { id: 'e-circle-2', source: 'circle-1', sourceHandle: 'circle-2', target: 'circle-target-2', type: 'defaults' },
];

const handleCustomFlowId = 'handleCustomFlowId';

export default function HandleCustomFlow() {
  const [nodes, setNodes, onNodesChange] = useNodesState(handleCustomFlowId, initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(handleCustomFlowId, initialEdges);

  const onConnect = useCallback(
    (params) =>
      setEdges((eds) => {
        const sourceNode = nodes.find((node) => node.id === params.source);
        const targetNode = nodes.find((node) => node.id === params.target);
        const involvesCircle = sourceNode?.type === 'circle' || targetNode?.type === 'circle';
        const edgeType = involvesCircle ? 'default' : 'step';

        return addEdge({ type: edgeType, ...params }, eds);
      }),
    [nodes, setEdges],
  );

  return (
    <div className="flow-wrapper">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
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

