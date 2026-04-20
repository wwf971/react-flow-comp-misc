import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  addEdge,
  useViewport,
  useUpdateNodeInternals,
} from 'reactflow';
import FolderView from '../../../../2025/react-comp-misc/src/layout/folder/FolderView';
import {
  EdgeRecMenuContext,
  editableRecEdgeTypes,
  createDefaultEditableRecEdgeData,
} from '../edges/edgesRec/EdgeRec.jsx';
import { useEditableRecEdgeInteractions } from '../edges/edgesRec/interaction.js';
import { useNodesState, useEdgesState } from './storeExapmle';
import 'reactflow/dist/style.css';
import './7-er-table.css';

const erTableFlowId = 'erTableFlowId';
const erTableColumns = {
  key: { data: 'key', align: 'left' },
  name: { data: 'name', align: 'left' },
  type: { data: 'type', align: 'left' },
};
const erTableColumnsOrder = ['key', 'name', 'type'];
const erTableColumnsSize = {
  key: { width: 38, minWidth: 30, resizable: false },
  name: { width: 130, minWidth: 90, resizable: false },
  type: { width: 90, minWidth: 70, resizable: false },
};
const erTableHeaderEstimateHeight = 30;
const erTableTitleEstimateHeight = 22;
const erTableRowEstimateHeight = 28;
const erTableMinimumEndpointLegLength = 100;

function getRowHandleId(rowId, side, role) {
  return `row|${rowId}|${side}|${role}`;
}

function parseHandleId(handleId) {
  const matchResult = /^row\|(.+)\|(left|right)\|(source|target)$/.exec(handleId ?? '');
  if (!matchResult) return null;
  return {
    rowId: matchResult[1],
    side: matchResult[2],
    role: matchResult[3],
  };
}

function buildEditableRecEdgeData(fromSide, toSide) {
  return createDefaultEditableRecEdgeData({
    startNext: fromSide,
    endPrev: toSide,
    minimumEndpointLegLength: erTableMinimumEndpointLegLength,
  });
}

function getDefaultCenterYByIndex(index) {
  return (
    erTableTitleEstimateHeight +
    erTableHeaderEstimateHeight +
    index * erTableRowEstimateHeight +
    erTableRowEstimateHeight / 2
  );
}

const ErTableNode = memo(function ErTableNode({ id, data }) {
  const rootRef = useRef(null);
  const updateNodeInternals = useUpdateNodeInternals();
  const { zoom } = useViewport();
  const rowIds = useMemo(() => data.rows.map((row) => row.id), [data.rows]);
  const [rowCenterYById, setRowCenterYById] = useState({});

  const rows = useMemo(
    () =>
      data.rows.map((row) => ({
        id: row.id,
        data: {
          key: row.keyMark,
          name: row.name,
          type: row.type,
        },
      })),
    [data.rows]
  );

  const measureRowCenters = useCallback(() => {
    if (!rootRef.current) return;
    const rootRect = rootRef.current.getBoundingClientRect();
    const safeZoom = zoom > 0.0001 ? zoom : 1;
    const nextRowCenterYById = {};
    rowIds.forEach((rowId, index) => {
      const rowElement = rootRef.current.querySelector(`[data-row-id="${rowId}"]`);
      if (!rowElement) {
        nextRowCenterYById[rowId] = getDefaultCenterYByIndex(index);
        return;
      }
      const rowRect = rowElement.getBoundingClientRect();
      nextRowCenterYById[rowId] = (rowRect.top - rootRect.top + rowRect.height / 2) / safeZoom;
    });
    setRowCenterYById(nextRowCenterYById);
  }, [rowIds, zoom]);

  useLayoutEffect(() => {
    let isUnmounted = false;
    const rafId = requestAnimationFrame(() => {
      if (isUnmounted) return;
      measureRowCenters();
      requestAnimationFrame(() => {
        if (!isUnmounted) measureRowCenters();
      });
    });
    const handleWindowResize = () => {
      measureRowCenters();
    };
    const resizeObserver =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => {
            measureRowCenters();
          })
        : null;
    if (resizeObserver && rootRef.current) {
      resizeObserver.observe(rootRef.current);
    }
    window.addEventListener('resize', handleWindowResize);
    return () => {
      isUnmounted = true;
      cancelAnimationFrame(rafId);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [measureRowCenters]);

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, rowCenterYById, updateNodeInternals]);

  return (
    <div ref={rootRef} className="er-table-node-root">
      <div className="er-table-node-title">{data.tableName}</div>
      <div className="er-table-node-view-wrap">
        <FolderView
          columns={erTableColumns}
          columnsOrder={erTableColumnsOrder}
          columnsSizeInit={erTableColumnsSize}
          rows={rows}
          showStatusBar={false}
          selectionMode="none"
          listOnly
        />
      </div>
      {data.rows.map((row, index) => {
        const centerY = rowCenterYById[row.id] ?? getDefaultCenterYByIndex(index);
        return (
          <div key={row.id}>
            <Handle
              id={getRowHandleId(row.id, 'left', 'source')}
              type="source"
              position={Position.Left}
              className="er-table-row-handle"
              style={{ top: `${centerY}px`, left: '0px', transform: 'translate(-50%, -50%)' }}
            />
            <Handle
              id={getRowHandleId(row.id, 'right', 'target')}
              type="target"
              position={Position.Right}
              className="er-table-row-handle"
              style={{ top: `${centerY}px`, left: '100%', transform: 'translate(-50%, -50%)' }}
            />
          </div>
        );
      })}
    </div>
  );
});

const nodeTypes = {
  erTable: ErTableNode,
};

const erTables = [
  {
    id: 'users',
    tableName: 'users',
    position: { x: 560, y: 80 },
    rows: [
      { id: 'id', keyMark: 'PK', name: 'id', type: 'uuid' },
      { id: 'email', keyMark: '', name: 'email', type: 'varchar' },
      { id: 'displayName', keyMark: '', name: 'display_name', type: 'varchar' },
    ],
  },
  {
    id: 'orders',
    tableName: 'orders',
    position: { x: 140, y: 200 },
    rows: [
      { id: 'id', keyMark: 'PK', name: 'id', type: 'uuid' },
      { id: 'userId', keyMark: 'FK', name: 'user_id', type: 'uuid' },
      { id: 'status', keyMark: '', name: 'status', type: 'varchar' },
      { id: 'createdAt', keyMark: '', name: 'created_at', type: 'timestamp' },
    ],
  },
  {
    id: 'orderItems',
    tableName: 'order_items',
    position: { x: 560, y: 360 },
    rows: [
      { id: 'id', keyMark: 'PK', name: 'id', type: 'uuid' },
      { id: 'orderId', keyMark: 'FK', name: 'order_id', type: 'uuid' },
      { id: 'sku', keyMark: '', name: 'sku', type: 'varchar' },
      { id: 'quantity', keyMark: '', name: 'quantity', type: 'int' },
    ],
  },
];

const relationshipSpecs = [
  {
    id: 'rel-orders-user',
    from: { tableId: 'orders', rowId: 'userId', side: 'left' },
    to: { tableId: 'users', rowId: 'id', side: 'right' },
  },
  {
    id: 'rel-orderItems-order',
    from: { tableId: 'orderItems', rowId: 'orderId', side: 'left' },
    to: { tableId: 'orders', rowId: 'id', side: 'right' },
  },
];

const initialNodes = erTables.map((table) => ({
  id: table.id,
  type: 'erTable',
  position: table.position,
  className: 'er-table-flow-node',
  data: {
    tableName: table.tableName,
    rows: table.rows,
  },
}));

const initialEdges = relationshipSpecs.map((relationship) => ({
  id: relationship.id,
  source: relationship.from.tableId,
  sourceHandle: getRowHandleId(relationship.from.rowId, relationship.from.side, 'source'),
  target: relationship.to.tableId,
  targetHandle: getRowHandleId(relationship.to.rowId, relationship.to.side, 'target'),
  type: 'editableRec',
  data: buildEditableRecEdgeData(relationship.from.side, relationship.to.side),
}));

export default function ErTableFlow() {
  const [nodes, , onNodesChange] = useNodesState(erTableFlowId, initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(erTableFlowId, initialEdges);
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
    (connection) => {
      const sourceSide = parseHandleId(connection.sourceHandle)?.side ?? 'left';
      const targetSide = parseHandleId(connection.targetHandle)?.side ?? 'right';
      setEdges((existingEdges) =>
        addEdge(
          {
            ...connection,
            type: 'editableRec',
            data: buildEditableRecEdgeData(sourceSide, targetSide),
          },
          existingEdges
        )
      );
    },
    [setEdges]
  );

  return (
    <EdgeRecMenuContext.Provider value={edgeMenuContextValue}>
      <div className="flow-wrapper er-table-flow-wrapper">
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
