import { useCallback, useRef, useState } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  addEdge,
  MarkerType,
} from 'reactflow';
import { useNodesState, useEdgesState } from '../storeMobx';
import 'reactflow/dist/style.css';

const initialNodes = [
  {
    id: '1',
    position: { x: 0, y: 0 },
    data: { label: 'Node 1' },
    style: { background: '#D6D5E6' },
  },
  {
    id: '2',
    position: { x: 0, y: 100 },
    data: { label: 'Node 2' },
    style: { background: '#D6D5E6' },
  },
];

const initialEdges = [];
const interactiveFlowId = 'interactiveFlowId';

let nodeId = 3;

export default function InteractiveFlow() {
  const [nodes, setNodes, onNodesChange] = useNodesState(interactiveFlowId, initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(interactiveFlowId, initialEdges);
  const [selectedNode, setSelectedNode] = useState(null);
  const reactFlowWrapper = useRef(null);

  const onConnect = useCallback(
    (params) =>
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: 'smoothstep',
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed },
          },
          eds
        )
      ),
    [setEdges]
  );

  const onNodeClick = useCallback((event, node) => {
    setSelectedNode(node);
  }, []);

  const addNode = useCallback(() => {
    const newNode = {
      id: `${nodeId++}`,
      position: { x: Math.random() * 400, y: Math.random() * 400 },
      data: { label: `Node ${nodeId - 1}` },
      style: { background: '#D6D5E6' },
    };
    setNodes((nds) => nds.concat(newNode));
  }, [setNodes]);

  const deleteNode = useCallback(() => {
    if (selectedNode) {
      setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
      setEdges((eds) =>
        eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id)
      );
      setSelectedNode(null);
    }
  }, [selectedNode, setNodes, setEdges]);

  return (
    <div style={{ width: '100%', height: '600px' }}>
      <div style={{ marginBottom: '8px', display: 'flex', gap: '8px' }}>
        <button onClick={addNode} style={{ padding: '4px 8px' }}>
          Add Node
        </button>
        <button
          onClick={deleteNode}
          disabled={!selectedNode}
          style={{ padding: '4px 8px' }}
        >
          Delete Selected Node
        </button>
        {selectedNode && (
          <span style={{ marginLeft: '8px' }}>
            Selected: {selectedNode.data?.basicData?.label ?? ''}
          </span>
        )}
      </div>
      <div ref={reactFlowWrapper} style={{ width: '100%', height: '550px' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          fitView
        >
          <Controls />
          <Background variant="dots" gap={12} size={1} />
        </ReactFlow>
      </div>
    </div>
  );
}
