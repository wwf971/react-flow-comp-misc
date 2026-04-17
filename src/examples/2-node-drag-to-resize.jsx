import { memo } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  Handle,
  Position,
  NodeResizer,
} from 'reactflow';
import { useNodesState, useEdgesState } from './storeExapmle';
import 'reactflow/dist/style.css';
import './2-node-drag-to-resize.css';

const dragResizeFlowId = 'dragResizeFlowId';

function ResizableNodeInner({ selected, data }) {
  return (
    <div className="resize-node-root">
      <NodeResizer
        isVisible
        minWidth={120}
        minHeight={80}
        lineClassName="resize-node-line"
        handleClassName="resize-node-handle"
        lineStyle={{ borderWidth: 8, borderColor: 'transparent' }}
        handleStyle={{
          width: 10,
          height: 10,
          borderColor: 'transparent',
          backgroundColor: 'transparent',
        }}
      />
      <Handle type="target" position={Position.Left} className="resize-node-port" />
      <div className="resize-node-title">{data.label}</div>
      <div className="resize-node-desc">{data.description}</div>
      <Handle type="source" position={Position.Right} className="resize-node-port" />
    </div>
  );
}

const ResizableNode = memo(ResizableNodeInner);

const nodeTypes = {
  resizable: ResizableNode,
};

const initialNodes = [
  {
    id: 'resize-a',
    type: 'resizable',
    position: { x: 60, y: 120 },
    style: { width: 180, height: 110 },
    data: {
      label: 'Resize Me',
      description: 'Drag the border handles to resize this node.',
    },
  },
  {
    id: 'resize-b',
    type: 'resizable',
    position: { x: 360, y: 120 },
    style: { width: 180, height: 110 },
    data: {
      label: 'Target Node',
      description: 'Resize also works here.',
    },
  },
];

const initialEdges = [
  { id: 'resize-edge-a-b', source: 'resize-a', target: 'resize-b', animated: true },
];

export default function NodeDragResizeFlow() {
  const [nodes, , onNodesChange] = useNodesState(dragResizeFlowId, initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(dragResizeFlowId, initialEdges);

  return (
    <div className="flow-wrapper">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
      >
        <Controls />
        <MiniMap />
        <Background variant="dots" gap={12} size={1} />
      </ReactFlow>
    </div>
  );
}
