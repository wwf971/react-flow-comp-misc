import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
} from 'reactflow';
import {
  GraphStoreProvider,
  useNodesState,
  useEdgesState,
  useOnConnect,
} from '../store/graphStoreJotai';
import 'reactflow/dist/style.css';

const initialNodes = [
  { id: '1', position: { x: 0, y: 0 }, data: { label: 'Start Node' } },
  { id: '2', position: { x: 0, y: 100 }, data: { label: 'Middle Node' } },
  { id: '3', position: { x: 200, y: 100 }, data: { label: 'End Node' } },
];

const initialEdges = [
  { id: 'e1-2', source: '1', target: '2' },
  { id: 'e2-3', source: '2', target: '3', type: 'smoothstep', animated: true },
];

function JotaiFlowContent() {
  const [nodes, setNodes, onNodesChange, nodeVersion] = useNodesState();
  const [edges, setEdges, onEdgesChange] = useEdgesState();
  const onConnect = useOnConnect();

  return (
    <div className="flow-wrapper">
      <ReactFlow
        key={nodeVersion}
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

export default function JotaiFlow() {
  return (
    <GraphStoreProvider initialNodes={initialNodes} initialEdges={initialEdges}>
      <JotaiFlowContent />
    </GraphStoreProvider>
  );
}
