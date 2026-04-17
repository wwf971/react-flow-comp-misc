/*
SVG hit testing is shape-aware (path stroke/fill), not rectangle-box based like normal HTML.
This example uses a visible thin edge path plus a transparent wide path to make right-click
interaction on curves tolerant while keeping edge visuals clean.
*/
import { createContext, memo, useCallback, useContext, useMemo, useState } from 'react';
import { Menu } from '@wwf971/react-comp-misc';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BaseEdge,
  Handle,
  Position,
  addEdge,
  getBezierPath,
} from 'reactflow';
import { useNodesState, useEdgesState } from './storeExapmle';
import 'reactflow/dist/style.css';
import './6-edge-editable.css';

const edgeEditableFlowId = 'edgeEditableFlowId';
const EdgeMenuContext = createContext(null);
const controlPointHitTolerance = 10;

function getLocalPointFromMouseEvent(event) {
  const target = event.currentTarget;
  if (!target || !target.ownerSVGElement) return null;
  const ctm = target.getScreenCTM();
  if (!ctm) return null;
  const point = target.ownerSVGElement.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const localPoint = point.matrixTransform(ctm.inverse());
  return { x: localPoint.x, y: localPoint.y };
}

function buildPathWithControlPoints(sourceX, sourceY, targetX, targetY, controlPoints) {
  if (!controlPoints?.length) {
    const [bezierPath] = getBezierPath({ sourceX, sourceY, targetX, targetY });
    return bezierPath;
  }

  let path = `M ${sourceX} ${sourceY}`;

  for (let index = 0; index < controlPoints.length; index += 1) {
    const currentPoint = controlPoints[index];
    const nextPoint = controlPoints[index + 1];
    const isLastControlPoint = index === controlPoints.length - 1;
    const endPoint = isLastControlPoint
      ? { x: targetX, y: targetY }
      : {
          x: (currentPoint.x + nextPoint.x) / 2,
          y: (currentPoint.y + nextPoint.y) / 2,
        };

    path += ` Q ${currentPoint.x} ${currentPoint.y} ${endPoint.x} ${endPoint.y}`;
  }

  return path;
}

function getEdgeFrame(sourceX, sourceY, targetX, targetY) {
  const deltaX = targetX - sourceX;
  const deltaY = targetY - sourceY;
  const rawLength = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  const isLengthTooSmall = rawLength < 0.0001;
  const length = isLengthTooSmall ? 1 : rawLength;
  const tangentX = isLengthTooSmall ? 1 : deltaX / length;
  const tangentY = isLengthTooSmall ? 0 : deltaY / length;
  const normalX = -tangentY;
  const normalY = tangentX;

  return {
    sourceX,
    sourceY,
    targetX,
    targetY,
    length,
    tangentX,
    tangentY,
    normalX,
    normalY,
  };
}

function relativeControlPointToAbsolute(controlPoint, edgeFrame) {
  const t = typeof controlPoint?.t === 'number' ? controlPoint.t : 0.5;
  const offsetT = typeof controlPoint?.offsetT === 'number' ? controlPoint.offsetT : 0;
  const offsetN = typeof controlPoint?.offsetN === 'number' ? controlPoint.offsetN : 0;
  const along = t * edgeFrame.length + offsetT;
  return {
    x: edgeFrame.sourceX + edgeFrame.tangentX * along + edgeFrame.normalX * offsetN,
    y: edgeFrame.sourceY + edgeFrame.tangentY * along + edgeFrame.normalY * offsetN,
  };
}

function absoluteControlPointToRelative(flowPoint, edgeFrame) {
  const vectorX = flowPoint.x - edgeFrame.sourceX;
  const vectorY = flowPoint.y - edgeFrame.sourceY;
  const projectedAlong = vectorX * edgeFrame.tangentX + vectorY * edgeFrame.tangentY;
  const projectedNormal = vectorX * edgeFrame.normalX + vectorY * edgeFrame.normalY;
  const clampedAlong = Math.min(Math.max(projectedAlong, 0), edgeFrame.length);
  const t = clampedAlong / edgeFrame.length;
  const offsetT = projectedAlong - clampedAlong;
  return {
    t,
    offsetT,
    offsetN: projectedNormal,
  };
}

function normalizeControlPoint(controlPoint, edgeFrame) {
  const isRelativeControlPoint =
    typeof controlPoint?.t === 'number' &&
    typeof controlPoint?.offsetT === 'number' &&
    typeof controlPoint?.offsetN === 'number';
  if (isRelativeControlPoint) {
    return controlPoint;
  }

  const isAbsoluteControlPoint =
    typeof controlPoint?.x === 'number' && typeof controlPoint?.y === 'number';
  if (isAbsoluteControlPoint) {
    return absoluteControlPointToRelative(controlPoint, edgeFrame);
  }

  return {
    t: 0.5,
    offsetT: 0,
    offsetN: 0,
  };
}

function getNearestControlPointIndex(controlPoints, flowPoint, tolerance) {
  if (!flowPoint || !controlPoints?.length) return null;
  let nearestControlPointIndex = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  controlPoints.forEach((point, index) => {
    const deltaX = point.x - flowPoint.x;
    const deltaY = point.y - flowPoint.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestControlPointIndex = index;
    }
  });

  const isWithinTolerance = nearestDistance <= tolerance;
  return isWithinTolerance ? nearestControlPointIndex : null;
}

const EditableBezierEdge = memo(function EditableBezierEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}) {
  const edgeMenu = useContext(EdgeMenuContext);
  const edgeFrame = useMemo(
    () => getEdgeFrame(sourceX, sourceY, targetX, targetY),
    [sourceX, sourceY, targetX, targetY]
  );
  const controlPoints = data?.controlPoints ?? [];
  const relativeControlPoints = useMemo(
    () => controlPoints.map((point) => normalizeControlPoint(point, edgeFrame)),
    [controlPoints, edgeFrame]
  );
  const absoluteControlPoints = useMemo(
    () => relativeControlPoints.map((point) => relativeControlPointToAbsolute(point, edgeFrame)),
    [relativeControlPoints, edgeFrame]
  );
  const path = useMemo(
    () => buildPathWithControlPoints(sourceX, sourceY, targetX, targetY, absoluteControlPoints),
    [sourceX, sourceY, targetX, targetY, absoluteControlPoints]
  );
  const selectedTarget = edgeMenu?.selectedTarget ?? null;
  const isEdgeSelected =
    selectedTarget?.edgeId === id && selectedTarget?.controlPointIndex === null;

  const handlePathContextMenu = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      const flowPoint = getLocalPointFromMouseEvent(event);
      if (!flowPoint) return;
      const controlPointIndex = getNearestControlPointIndex(
        absoluteControlPoints,
        flowPoint,
        controlPointHitTolerance
      );
      edgeMenu?.openMenu({
        edgeId: id,
        controlPointIndex,
        controlPointRelative: absoluteControlPointToRelative(flowPoint, edgeFrame),
        position: { x: event.clientX, y: event.clientY },
      });
      if (typeof controlPointIndex === 'number') {
        edgeMenu?.selectControlPoint(id, controlPointIndex);
      } else {
        edgeMenu?.selectEdge(id);
      }
    },
    [absoluteControlPoints, edgeFrame, edgeMenu, id]
  );

  const handleControlPointContextMenu = useCallback(
    (event, controlPointIndex, controlPointRelative) => {
      event.preventDefault();
      event.stopPropagation();
      edgeMenu?.openMenu({
        edgeId: id,
        controlPointIndex,
        controlPointRelative,
        position: { x: event.clientX, y: event.clientY },
      });
      edgeMenu?.selectControlPoint(id, controlPointIndex);
    },
    [edgeMenu, id]
  );

  const handleControlPointPointerDown = useCallback((event, controlPointIndex) => {
    const isLeftButton = event.button === 0;
    if (!isLeftButton) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    edgeMenu?.startControlPointDrag();
    edgeMenu?.selectControlPoint(id, controlPointIndex);
  }, [edgeMenu, id]);

  const handleControlPointPointerMove = useCallback(
    (event, controlPointIndex) => {
      const isPrimaryButtonPressed = (event.buttons & 1) === 1;
      if (!isPrimaryButtonPressed) return;
      const flowPoint = getLocalPointFromMouseEvent(event);
      if (!flowPoint) return;
      const controlPointRelative = absoluteControlPointToRelative(flowPoint, edgeFrame);
      edgeMenu?.updateControlPoint(id, controlPointIndex, controlPointRelative);
    },
    [edgeFrame, edgeMenu, id]
  );

  const handleControlPointPointerUp = useCallback((event) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    edgeMenu?.endControlPointDrag();
  }, [edgeMenu]);

  const handleEdgeClick = useCallback(
    (event) => {
      const isLeftButton = event.button === 0;
      if (!isLeftButton) return;
      event.preventDefault();
      event.stopPropagation();
      edgeMenu?.selectEdge(id);
    },
    [edgeMenu, id]
  );

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        className={`editable-edge-visible-path ${isEdgeSelected ? 'is-selected' : ''}`}
      />
      <path
        className="editable-edge-hit-path nopan"
        d={path}
        onClick={handleEdgeClick}
        onContextMenu={handlePathContextMenu}
      />
      {absoluteControlPoints.map((point, index) => {
        const isControlPointSelected =
          selectedTarget?.edgeId === id && selectedTarget?.controlPointIndex === index;
        return (
          <g key={`${id}-control-point-${index}`}>
            <circle
              className="editable-edge-control-point-hit nopan"
              cx={point.x}
              cy={point.y}
              r={10}
              onContextMenu={(event) =>
                handleControlPointContextMenu(event, index, relativeControlPoints[index])
              }
              onPointerDown={(event) => handleControlPointPointerDown(event, index)}
              onPointerMove={(event) => handleControlPointPointerMove(event, index)}
              onPointerUp={handleControlPointPointerUp}
              onPointerCancel={handleControlPointPointerUp}
            />
            <circle
              className={`editable-edge-control-point ${isControlPointSelected ? 'is-selected' : ''}`}
              cx={point.x}
              cy={point.y}
              r={4}
            />
          </g>
        );
      })}
    </>
  );
});

const edgeTypes = {
  editableBezier: EditableBezierEdge,
};

const initialNodes = [
  { id: '1', type: 'basicEdgeNode', position: { x: 80, y: 120 }, data: { label: 'Node A' } },
  { id: '2', type: 'basicEdgeNode', position: { x: 360, y: 120 }, data: { label: 'Node B' } },
];

const initialEdges = [
  {
    id: 'edge-1-2',
    source: '1',
    target: '2',
    type: 'editableBezier',
    data: { controlPoints: [] },
  },
];

function BasicNode({ data }) {
  return (
    <div className="edge-demo-node-root">
      <Handle type="target" position={Position.Left} />
      <div className="edge-demo-node-label">{data.label}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = {
  basicEdgeNode: BasicNode,
};

export default function EdgeEditableFlow() {
  const [nodes, , onNodesChange] = useNodesState(edgeEditableFlowId, initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(edgeEditableFlowId, initialEdges);
  const [menuState, setMenuState] = useState(null);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [isControlPointDragging, setIsControlPointDragging] = useState(false);
  const isMenuOpen = menuState !== null;

  const openMenu = useCallback((nextMenuState) => {
    setMenuState(nextMenuState);
  }, []);

  const closeMenu = useCallback(() => {
    setMenuState(null);
  }, []);

  const selectEdge = useCallback((edgeId) => {
    setSelectedTarget({ edgeId, controlPointIndex: null });
  }, []);

  const selectControlPoint = useCallback((edgeId, controlPointIndex) => {
    setSelectedTarget({ edgeId, controlPointIndex });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedTarget(null);
  }, []);

  const startControlPointDrag = useCallback(() => {
    setIsControlPointDragging(true);
  }, []);

  const endControlPointDrag = useCallback(() => {
    setIsControlPointDragging(false);
  }, []);

  const onConnect = useCallback(
    (params) => {
      setEdges((existingEdges) =>
        addEdge(
          {
            ...params,
            type: 'editableBezier',
            data: { controlPoints: [] },
          },
          existingEdges
        )
      );
    },
    [setEdges]
  );

  const menuItems = useMemo(() => {
    if (!menuState) return [];
    const items = [{ type: 'item', name: 'create control point', action: 'create-control-point' }];
    if (typeof menuState.controlPointIndex === 'number') {
      items.push({ type: 'item', name: 'remove control point', action: 'remove-control-point' });
    }
    return items;
  }, [menuState]);

  const handleMenuItemClick = useCallback(
    (item) => {
      if (!menuState) return;
      if (item.action === 'create-control-point' && menuState.controlPointRelative) {
        setEdges((existingEdges) =>
          existingEdges.map((edge) => {
            if (edge.id !== menuState.edgeId) return edge;
            const controlPoints = edge.data?.controlPoints ?? [];
            const nextControlPoint = menuState.controlPointRelative;
            const insertIndex = controlPoints.findIndex((point) => {
              const currentT = typeof point?.t === 'number' ? point.t : 0.5;
              return currentT > nextControlPoint.t;
            });
            const nextControlPoints =
              insertIndex === -1
                ? [...controlPoints, nextControlPoint]
                : [
                    ...controlPoints.slice(0, insertIndex),
                    nextControlPoint,
                    ...controlPoints.slice(insertIndex),
                  ];
            return {
              ...edge,
              data: {
                ...edge.data,
                controlPoints: nextControlPoints,
              },
            };
          })
        );
      }

      if (item.action === 'remove-control-point' && typeof menuState.controlPointIndex === 'number') {
        setEdges((existingEdges) =>
          existingEdges.map((edge) => {
            if (edge.id !== menuState.edgeId) return edge;
            const controlPoints = edge.data?.controlPoints ?? [];
            return {
              ...edge,
              data: {
                ...edge.data,
                controlPoints: controlPoints.filter((_, index) => index !== menuState.controlPointIndex),
              },
            };
          })
        );
      }
    },
    [menuState, setEdges]
  );

  const updateControlPoint = useCallback(
    (edgeId, controlPointIndex, controlPointRelative) => {
      setEdges((existingEdges) =>
        existingEdges.map((edge) => {
          if (edge.id !== edgeId) return edge;
          const controlPoints = edge.data?.controlPoints ?? [];
          const nextControlPoints = controlPoints.map((point, index) => {
            return index === controlPointIndex ? controlPointRelative : point;
          });
          return {
            ...edge,
            data: {
              ...edge.data,
              controlPoints: nextControlPoints,
            },
          };
        })
      );
    },
    [setEdges]
  );
  const edgeMenuContextValue = useMemo(
    () => ({
      openMenu,
      updateControlPoint,
      selectedTarget,
      selectEdge,
      selectControlPoint,
      startControlPointDrag,
      endControlPointDrag,
    }),
    [
      endControlPointDrag,
      openMenu,
      selectControlPoint,
      selectEdge,
      selectedTarget,
      startControlPointDrag,
      updateControlPoint,
    ]
  );

  const handlePaneClick = useCallback(() => {
    closeMenu();
    clearSelection();
  }, [clearSelection, closeMenu]);

  const handleNodeClick = useCallback(() => {
    closeMenu();
    clearSelection();
  }, [clearSelection, closeMenu]);

  return (
    <EdgeMenuContext.Provider value={edgeMenuContextValue}>
      <div className="flow-wrapper">
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
      {isMenuOpen && (
        <Menu
          items={menuItems}
          position={menuState.position}
          onClose={closeMenu}
          onItemClick={handleMenuItemClick}
          onContextMenu={(event) => {
            event.preventDefault();
            closeMenu();
          }}
        />
      )}
    </EdgeMenuContext.Provider>
  );
}
