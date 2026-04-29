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
import { FolderView } from '@wwf971/react-comp-misc';
import {
  EdgeRecMenuContext,
  editableRecEdgeTypes,
  createDefaultEditableRecEdgeData,
} from '../edges/edge-rec/EdgeRec.jsx';
import { useEditableRecEdgeInteractions } from '../edges/edge-rec/interaction.js';
import {
  EdgeBezierMenuContext,
  editableBezierEdgeTypes,
  createDefaultEditableBezierEdgeData,
  useEditableBezierEdgeInteractions,
} from '../edges/edge-bezier/EdgeBezier.jsx';
import {
  useNodesState,
  useEdgesState,
  useExtraData,
  useGraphDataApi,
} from '../storeMobx';
import 'reactflow/dist/style.css';
import './ERChart.css';

const erChartDefaultFlowId = 'erChartFlowId';
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
const edgeModeDefault = 'edge-rec';

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

function buildEditableBezierEdgeData() {
  return createDefaultEditableBezierEdgeData();
}

function resolveEdgeMode(edgeMode) {
  if (edgeMode === 'default') return 'default';
  if (edgeMode === 'edge-bezier') return 'edge-bezier';
  if (edgeMode === 'edge-rec') return 'edge-rec';
  return edgeModeDefault;
}

function getEdgeTypeByMode(edgeMode) {
  if (edgeMode === 'default') return 'default';
  if (edgeMode === 'edge-bezier') return 'editableBezier';
  return 'editableRec';
}

function getEdgeTypesByMode(edgeMode) {
  if (edgeMode === 'edge-bezier') return editableBezierEdgeTypes;
  if (edgeMode === 'edge-rec') return editableRecEdgeTypes;
  return undefined;
}

function getEdgeDataByMode(edgeMode, sourceSide, targetSide) {
  if (edgeMode === 'edge-bezier') {
    return buildEditableBezierEdgeData();
  }
  if (edgeMode === 'edge-rec') {
    return buildEditableRecEdgeData(sourceSide, targetSide);
  }
  return undefined;
}

function getDefaultCenterYByIndex(index) {
  return (
    erTableTitleEstimateHeight +
    erTableHeaderEstimateHeight +
    index * erTableRowEstimateHeight +
    erTableRowEstimateHeight / 2
  );
}

export const ERTable = memo(function ERTable({ id, data }) {
  const basicData = data?.basicData ?? {};
  const nodeExtraData = useExtraData(basicData.graphId, 'node', id) ?? {};
  const rootRef = useRef(null);
  const updateNodeInternals = useUpdateNodeInternals();
  const { zoom } = useViewport();
  const tableRows = useMemo(() => nodeExtraData.rows ?? [], [nodeExtraData.rows]);
  const rowIds = useMemo(() => tableRows.map((row) => row.id), [tableRows]);
  const [rowCenterYById, setRowCenterYById] = useState({});

  const rows = useMemo(
    () =>
      tableRows.map((row) => ({
        id: row.id,
        data: {
          key: row.keyMark,
          name: row.name,
          type: row.type,
        },
      })),
    [tableRows]
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
      <div className="er-table-node-title">{nodeExtraData.tableName}</div>
      <div className="er-table-node-view-wrap">
        <FolderView
          columns={erTableColumns}
          columnsOrder={erTableColumnsOrder}
          columnsSizeInit={erTableColumnsSize}
          rows={rows}
          isLastColumnFilled={true}
          showStatusBar={false}
          selectionMode="none"
          listOnly
        />
      </div>
      {tableRows.map((row, index) => {
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
  erTable: ERTable,
};

function buildInitialNodes(tables) {
  return tables.map((table) => ({
    id: table.id,
    type: 'erTable',
    position: table.position,
    className: 'er-table-flow-node',
    data: {
      tableName: table.tableName,
      rows: table.rows,
    },
  }));
}

function buildInitialEdges(relationships, edgeMode) {
  return relationships.map((relationship) => ({
    id: relationship.id,
    source: relationship.from.tableId,
    sourceHandle: getRowHandleId(relationship.from.rowId, relationship.from.side, 'source'),
    target: relationship.to.tableId,
    targetHandle: getRowHandleId(relationship.to.rowId, relationship.to.side, 'target'),
    type: getEdgeTypeByMode(edgeMode),
    data: getEdgeDataByMode(edgeMode, relationship.from.side, relationship.to.side),
  }));
}

export function ERChart({ flowId = erChartDefaultFlowId, tables = [], relationships = [], getComp }) {
  const edgeMode = resolveEdgeMode(getComp?.('edgeMode'));
  const initialNodes = useMemo(() => buildInitialNodes(tables), [tables]);
  const initialEdges = useMemo(
    () => buildInitialEdges(relationships, edgeMode),
    [relationships, edgeMode]
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(flowId, initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowId, initialEdges);
  const { getExtraData, setExtraData } = useGraphDataApi(flowId);
  const recEdgeInteractions = useEditableRecEdgeInteractions({
    edges,
    setEdges,
    getExtraData,
    setExtraData,
  });
  const bezierEdgeInteractions = useEditableBezierEdgeInteractions({
    edges,
    setEdges,
    getExtraData,
    setExtraData,
  });
  const activeEdgeInteractions =
    edgeMode === 'edge-rec'
      ? recEdgeInteractions
      : edgeMode === 'edge-bezier'
        ? bezierEdgeInteractions
        : {
            edgeMenuContextValue: null,
            isControlPointDragging: false,
            handlePaneClick: undefined,
            handleNodeClick: undefined,
            menuOverlay: null,
          };
  const {
    edgeMenuContextValue,
    isControlPointDragging,
    handlePaneClick,
    handleNodeClick,
    menuOverlay,
  } = activeEdgeInteractions;

  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  const onConnect = useCallback(
    (connection) => {
      const sourceSide = parseHandleId(connection.sourceHandle)?.side ?? 'left';
      const targetSide = parseHandleId(connection.targetHandle)?.side ?? 'right';
      const edgeData = getEdgeDataByMode(edgeMode, sourceSide, targetSide);
      setEdges((existingEdges) =>
        addEdge(
          {
            ...connection,
            type: getEdgeTypeByMode(edgeMode),
            data: edgeData,
          },
          existingEdges
        )
      );
    },
    [edgeMode, setEdges]
  );

  const edgeTypes = getEdgeTypesByMode(edgeMode);
  const flowContent = (
    <div className="flow-wrapper er-table-flow-wrapper">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
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
  );
  const EdgeMenuContextComp =
    edgeMode === 'edge-rec'
      ? EdgeRecMenuContext
      : edgeMode === 'edge-bezier'
        ? EdgeBezierMenuContext
        : null;

  if (!EdgeMenuContextComp) {
    return flowContent;
  }

  return (
    <EdgeMenuContextComp.Provider value={edgeMenuContextValue}>
      {flowContent}
      {menuOverlay}
    </EdgeMenuContextComp.Provider>
  );
}

export default ERChart;
