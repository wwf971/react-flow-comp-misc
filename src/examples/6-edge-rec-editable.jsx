import { useCallback } from 'react';
import { ReactFlow, Background, Controls, MiniMap, Handle, Position, addEdge } from 'reactflow';
import {
  EdgeRecMenuContext,
  editableRecEdgeTypes,
  createDefaultEditableRecEdgeData,
} from '../edges/edgesRec/EdgeRec.jsx';
import { useEditableRecEdgeInteractions } from '../edges/edgesRec/interaction.js';
import { useNodesState, useEdgesState } from './storeExapmle';
import 'reactflow/dist/style.css';

const edgeRecEditableFlowId = 'edgeRecEditableFlowId';

const initialNodes = [
  { id: '1', type: 'recEdgeNode', position: { x: 80, y: 120 }, data: { label: 'Node A' } },
  { id: '2', type: 'recEdgeNode', position: { x: 360, y: 120 }, data: { label: 'Node B' } },
];

const initialEdges = [
  {
    id: 'edge-1-2',
    source: '1',
    target: '2',
    type: 'editableRec',
    data: createDefaultEditableRecEdgeData(),
  },
];

function BasicNode({ data }) {
  return (
    <div className="rec-edge-demo-node-root">
      <Handle type="target" position={Position.Left} />
      <div className="rec-edge-demo-node-label">{data.label}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = {
  recEdgeNode: BasicNode,
};

export default function EdgeRecEditableFlow() {
  const [nodes, , onNodesChange] = useNodesState(edgeRecEditableFlowId, initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(edgeRecEditableFlowId, initialEdges);
  const {
    edgeMenuContextValue,
    isControlPointDragging,
    handlePaneClick,
    handleNodeClick,
    menuOverlay,
  } = useEditableRecEdgeInteractions({
    edges,
    setEdges,
  });

  const onConnect = useCallback(
    (params) =>
      setEdges((existingEdges) =>
        addEdge(
          {
            ...params,
            type: 'editableRec',
            data: createDefaultEditableRecEdgeData(),
          },
          existingEdges
        )
      ),
    [setEdges]
  );

  return (
    <EdgeRecMenuContext.Provider value={edgeMenuContextValue}>
      <div className="flow-wrapper">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={editableRecEdgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onPaneClick={handlePaneClick}
          onNodeClick={handleNodeClick}
          panOnDrag={!isControlPointDragging}
          fitView
        >
          <Controls />
          <MiniMap />
          <Background variant="dots" gap={12} size={1} />
        </ReactFlow>
      </div>
      {menuOverlay}
    </EdgeRecMenuContext.Provider>
  );
}
