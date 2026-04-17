/*
1. When dragging a node, how does react update position?

  --> onNodesChange([{ type: 'position', id, position, ... }]).
    called by React Flow when dragging a node.
  --> applyNodeChanges() @mobx store
    looks up nodeSettersMap.get(id) and calls setter(n => ({ ...n, position, ... }))
    setNodeVersion(v+1) bumps version.
2. And how does this position triggers re-render of the node and all connecting edges?
  Re-render: MobX observes nodes + nodeVersion updates and triggers a re-render.
  React Flow receives nodes with a new array ref and changed node object ref.
  We pass nodes={newArray} to React Flow -> nodes is a new array ref -> React re-renders the ReactFlow root (prop changed).
  Only one node object is new; array is new. React Flow may memo internally so only that node (and its edges) re-render.
  Edges: same edges ref; React Flow derives edge paths from current nodes, so edges redraw.


3. How does handleDataChange work?
  the method is provided by context provider in NodeTextEditableFlowContent as onChangeRef.
  custom node NodeTextEditable access onChangeRef this method via context.
  
*/

import { useCallback, useRef, useEffect, memo, createContext, useContext } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  Handle,
  Position,
} from 'reactflow';
import {
  useNodesState,
  useEdgesState,
  useOnConnect,
} from './storeExapmle';
import 'reactflow/dist/style.css';
import './3-node-text-editable.css';

const NodeDataChangeRefContext = createContext(null);

function NodeTextEditableInner({ data, id }) {
  const labelRef = useRef(null);
  const descRef = useRef(null);
  const onChangeRef = useContext(NodeDataChangeRefContext);

  const getTextWithNewlines = (el) => {
    if (!el) return '';
    return Array.from(el.childNodes)
      .map((n) => (n.nodeType === 3 ? n.textContent : n.nodeName === 'BR' ? '\n' : getTextWithNewlines(n)))
      .join('');
  };

  const handleLabelBlur = (e) => {
    const newValue = getTextWithNewlines(e.target) || e.target.textContent || '';
    if (onChangeRef?.current && newValue !== data.label) {
      onChangeRef.current(id, { ...data, label: newValue });
    }
  };

  const handleEditableMouseDown = (e) => {
    e.stopPropagation();
  };

  const handleDescBlur = (e) => {
    const newValue = getTextWithNewlines(e.target) || e.target.textContent || '';
    if (onChangeRef?.current && newValue !== data.description) {
      onChangeRef.current(id, { ...data, description: newValue });
    }
  };

  const handleLabelKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.execCommand('insertLineBreak');
    }
  };

  const handleDescKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.execCommand('insertLineBreak');
    }
  };

  return (
    <div className="custom-node">
      <Handle type="target" position={Position.Top} />
      <div className="custom-node-header">
        <div
          ref={labelRef}
          className="custom-node-editable nodrag nopan"
          contentEditable
          suppressContentEditableWarning
          onMouseDown={handleEditableMouseDown}
          onBlur={handleLabelBlur}
          onKeyDown={handleLabelKeyDown}
        >
          {data.label}
        </div>
      </div>
      <div className="custom-node-body">
        <div
          ref={descRef}
          className="custom-node-editable nodrag nopan"
          contentEditable
          suppressContentEditableWarning
          onMouseDown={handleEditableMouseDown}
          onBlur={handleDescBlur}
          onKeyDown={handleDescKeyDown}
        >
          {data.description}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const NodeTextEditable = memo(NodeTextEditableInner, (prev, next) => {
  return prev.id === next.id && prev.data?.label === next.data?.label && prev.data?.description === next.data?.description;
});

const nodeTypes = {
  custom: NodeTextEditable,
};

const initialNodes = [
  {
    id: '1',
    type: 'custom',
    position: { x: 0, y: 0 },
    data: { label: 'Custom Node 1', description: 'This is a custom node with styling' },
  },
  {
    id: '2',
    type: 'custom',
    position: { x: 0, y: 150 },
    data: { label: 'Custom Node 2', description: 'Drag me around!' },
  },
  {
    id: '3',
    type: 'custom',
    position: { x: 250, y: 75 },
    data: { label: 'Custom Node 3' },
  },
];

const initialEdges = [
  { id: 'e1-2', source: '1', target: '2' },
  { id: 'e2-3', source: '2', target: '3', animated: true },
];

const nodeTextEditableFlowId = 'nodeTextEditableFlowId';

function NodeTextEditableFlowContent() {
  const [nodes, setNodes, onNodesChange] = useNodesState(
    nodeTextEditableFlowId,
    initialNodes
  );
  const [edges, , onEdgesChange] = useEdgesState(nodeTextEditableFlowId, initialEdges);
  const onConnect = useOnConnect(nodeTextEditableFlowId);

  const handleDataChange = useCallback(
    (nodeId, newData) => {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId ? { ...node, data: newData } : node
        )
      );
    },
    [setNodes],
  );

  const onChangeRef = useRef(handleDataChange);
  useEffect(() => {
    onChangeRef.current = handleDataChange;
  }, [handleDataChange]);

  return (
    <NodeDataChangeRefContext.Provider value={onChangeRef}>
      <div className="flow-wrapper">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
        >
          <Controls />
          <Background variant="dots" gap={12} size={1} />
        </ReactFlow>
      </div>
    </NodeDataChangeRefContext.Provider>
  );
}

export default function NodeTextEditableFlow() {
  return <NodeTextEditableFlowContent />;
}
