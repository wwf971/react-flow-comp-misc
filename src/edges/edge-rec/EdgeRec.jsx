/*
each control point(including start/end points) can have a preference for the direction of egde connecting to it.
  - preference ranges in [up, down, left, right, horizontal, vertical, auto]
  - for end points, there is only preference on one side.
  - for control points, preference on both sides can be specified independently.

 * Orthogonal routing case key format: "<relativePosition>|<startEmissionPreference>|<endEmissionPreference>".
 * The end preference is normalized using (toPoint -> fromPoint), so it is treated as the end point's own emission
 * toward its next segment; therefore this segment's final direction arrives from the opposite side for up/down/left/right.
 * "horizontal" and "vertical" are axis hints, so they are not opposite-direction constraints.

*/
import { createContext, memo, useCallback, useContext, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BaseEdge,
  Handle,
  Position,
  addEdge,
} from 'reactflow';
import { useNodesState, useEdgesState, useExtraData, useGraphDataApi } from '../../storeMobx';
import {
  buildWorldGraph,
  buildRecEditableSegments as parseBuildRecEditableSegments,
  chooseBestOrthogonalPath as parseChooseBestOrthogonalPath,
  findPathByDirectionPlan,
  getRelativePositionKey,
  getSegmentDirection,
  normalizePreferenceForCase,
} from './parseSeg';
import {
  normalizeDirectionPreferences,
  useEditableRecEdgeInteractions,
} from './interaction';
import { getDirectionPlanByCaseKey } from './utils';
import 'reactflow/dist/style.css';
import './EdgeRec.css';

const edgeRecEditableFlowId = 'edgeRecEditableFlowId';
export const EdgeRecMenuContext = createContext(null);
const controlPointHitTolerance = 10;
const minimumFlexibleEndpointLegLength = 100;
const directionalPreferenceStubLength = 24;
const DIR_UP = 'up';
const DIR_DOWN = 'down';
const DIR_LEFT = 'left';
const DIR_RIGHT = 'right';
const debugInfoVisibilityNever = 'never';
const debugInfoVisibilityAlways = 'always';
const debugInfoVisibilitySelected = 'selected';

export function createDefaultEditableRecEdgeData({
  startNext = 'right',
  endPrev = null,
  minimumEndpointLegLength = minimumFlexibleEndpointLegLength,
  debugInfoVisibilityMode = debugInfoVisibilitySelected,
} = {}) {
  return {
    controlPoints: [],
    minimumEndpointLegLength,
    debugInfoVisibilityMode,
    directionPreferences: {
      start: { next: startNext },
      controlPoints: [],
      end: { prev: endPrev },
    },
  };
}

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
  if (isRelativeControlPoint) return controlPoint;

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

  return nearestDistance <= tolerance ? nearestControlPointIndex : null;
}

function resolveSegmentPreferences(segmentIndex, directionPreferences) {
  const controlPointCount = directionPreferences.controlPoints.length;
  const startEmissionDirection =
    segmentIndex === 0
      ? directionPreferences.start.next
      : directionPreferences.controlPoints[segmentIndex - 1]?.next ?? null;
  const endEmissionDirection =
    segmentIndex === controlPointCount
      ? directionPreferences.end.prev
      : directionPreferences.controlPoints[segmentIndex]?.prev ?? null;
  return { startEmissionDirection, endEmissionDirection };
}

function resolveDebugInfoVisibilityMode(edgeExtraData) {
  if (edgeExtraData?.debugInfoVisibilityMode === debugInfoVisibilityNever) {
    return debugInfoVisibilityNever;
  }
  if (edgeExtraData?.debugInfoVisibilityMode === debugInfoVisibilityAlways) {
    return debugInfoVisibilityAlways;
  }
  if (edgeExtraData?.debugInfoVisibilityMode === debugInfoVisibilitySelected) {
    return debugInfoVisibilitySelected;
  }
  return edgeExtraData?.isDebugInfoVisible === false
    ? debugInfoVisibilityNever
    : debugInfoVisibilitySelected;
}

function normalizeVector(vector, fallbackVector = { x: 1, y: 0 }) {
  const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
  if (length < 0.0001) {
    const fallbackLength = Math.sqrt(
      fallbackVector.x * fallbackVector.x + fallbackVector.y * fallbackVector.y
    );
    if (fallbackLength < 0.0001) return { x: 1, y: 0 };
    return { x: fallbackVector.x / fallbackLength, y: fallbackVector.y / fallbackLength };
  }
  return { x: vector.x / length, y: vector.y / length };
}

function getAxisAlignedVectorFromFallback(fallbackVector) {
  const absX = Math.abs(fallbackVector.x);
  const absY = Math.abs(fallbackVector.y);
  if (absX >= absY) {
    return fallbackVector.x >= 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
  }
  return fallbackVector.y >= 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
}

function getDirectionVectorByPreference(direction, fallbackVector) {
  if (direction === DIR_RIGHT) return { x: 1, y: 0 };
  if (direction === DIR_LEFT) return { x: -1, y: 0 };
  if (direction === DIR_UP) return { x: 0, y: -1 };
  if (direction === DIR_DOWN) return { x: 0, y: 1 };
  if (direction === 'horizontal') {
    return fallbackVector.x >= 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
  }
  if (direction === 'vertical') {
    return fallbackVector.y >= 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
  }
  return getAxisAlignedVectorFromFallback(fallbackVector);
}

function getTrianglePath(cx, cy, directionVector) {
  const tipLength = 8;
  const baseOffset = 5;
  const halfBase = 4;
  const tipX = cx + directionVector.x * tipLength;
  const tipY = cy + directionVector.y * tipLength;
  const baseCenterX = cx - directionVector.x * baseOffset;
  const baseCenterY = cy - directionVector.y * baseOffset;
  const normalX = -directionVector.y;
  const normalY = directionVector.x;
  const leftX = baseCenterX + normalX * halfBase;
  const leftY = baseCenterY + normalY * halfBase;
  const rightX = baseCenterX - normalX * halfBase;
  const rightY = baseCenterY - normalY * halfBase;
  return `M ${tipX} ${tipY} L ${leftX} ${leftY} L ${rightX} ${rightY} Z`;
}

function chooseBestOrthogonalPath(
  fromPoint,
  toPoint,
  startPreference,
  endPreference,
  minimumEndpointLegLength
) {
  return parseChooseBestOrthogonalPath({
    fromPoint,
    toPoint,
    startPreference,
    endPreference,
    minimumEndpointLegLength,
    buildWorldGraph,
    getRelativePositionKey,
    normalizePreferenceForCase,
    getDirectionPlanByCaseKey,
    findPathByDirectionPlan,
    getSegmentDirection,
    directions: {
      up: DIR_UP,
      down: DIR_DOWN,
      left: DIR_LEFT,
      right: DIR_RIGHT,
    },
    stubLength: directionalPreferenceStubLength,
  });
}

function buildRecEditableSegments(
  sourceX,
  sourceY,
  targetX,
  targetY,
  controlPoints,
  directionPreferences,
  minimumEndpointLegLength
) {
  return parseBuildRecEditableSegments({
    sourceX,
    sourceY,
    targetX,
    targetY,
    controlPoints,
    directionPreferences,
    minimumEndpointLegLength,
    resolveSegmentPreferences,
    chooseBestOrthogonalPath: ({
      fromPoint,
      toPoint,
      startPreference,
      endPreference,
      minimumEndpointLegLength: minimumLegLength,
    }) => {
      return chooseBestOrthogonalPath(
        fromPoint,
        toPoint,
        startPreference,
        endPreference,
        minimumLegLength
      );
    },
  });
}

const EditableRecEdge = memo(function EditableRecEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}) {
  const basicData = data?.basicData ?? {};
  const graphId = basicData.graphId;
  const edgeExtraData = useExtraData(graphId, 'edge', id) ?? {};
  const edgeMenu = useContext(EdgeRecMenuContext);
  const edgeFrame = useMemo(
    () => getEdgeFrame(sourceX, sourceY, targetX, targetY),
    [sourceX, sourceY, targetX, targetY]
  );
  const controlPoints = edgeExtraData?.controlPoints ?? [];
  const directionPreferences = useMemo(
    () => normalizeDirectionPreferences(edgeExtraData?.directionPreferences, controlPoints.length),
    [controlPoints.length, edgeExtraData?.directionPreferences]
  );
  const minimumEndpointLegLength =
    typeof edgeExtraData?.minimumEndpointLegLength === 'number'
      ? edgeExtraData.minimumEndpointLegLength
      : minimumFlexibleEndpointLegLength;
  const debugInfoVisibilityMode = resolveDebugInfoVisibilityMode(edgeExtraData);

  const normalizedControlPoints = useMemo(() => {
    return controlPoints.map((point, index) => {
      const relative = normalizeControlPoint(point, edgeFrame);
      const absolute = relativeControlPointToAbsolute(relative, edgeFrame);
      return {
        index,
        relative,
        absolute,
      };
    });
  }, [controlPoints, edgeFrame]);

  const sortedControlPoints = useMemo(() => {
    return [...normalizedControlPoints].sort((a, b) => a.relative.t - b.relative.t);
  }, [normalizedControlPoints]);

  const absoluteControlPoints = useMemo(() => {
    return sortedControlPoints.map((point) => point.absolute);
  }, [sortedControlPoints]);

  const segments = useMemo(() => {
    return buildRecEditableSegments(
      sourceX,
      sourceY,
      targetX,
      targetY,
      absoluteControlPoints,
      directionPreferences,
      minimumEndpointLegLength
    );
  }, [
    sourceX,
    sourceY,
    targetX,
    targetY,
    absoluteControlPoints,
    directionPreferences,
    minimumEndpointLegLength,
  ]);

  const selectedTarget = edgeMenu?.selectedTarget ?? null;
  const isEdgeSelected = selectedTarget?.edgeId === id;
  const isSegmentSelectedOnCurrentEdge =
    selectedTarget?.edgeId === id &&
    selectedTarget?.controlPointIndex === null &&
    typeof selectedTarget?.segmentIndex === 'number';
  const isDebugInfoShownAlways = debugInfoVisibilityMode === debugInfoVisibilityAlways;
  const isDebugInfoShownOnlyWhenSelected = debugInfoVisibilityMode === debugInfoVisibilitySelected;

  const startAnchorPoint = absoluteControlPoints[0] ?? { x: targetX, y: targetY };
  const endAnchorPoint =
    absoluteControlPoints[absoluteControlPoints.length - 1] ?? { x: sourceX, y: sourceY };
  const startFallbackVector = {
    x: startAnchorPoint.x - sourceX,
    y: startAnchorPoint.y - sourceY,
  };
  const endFallbackEmissionVector = {
    x: endAnchorPoint.x - targetX,
    y: endAnchorPoint.y - targetY,
  };
  const startDirectionVector = normalizeVector(
    getDirectionVectorByPreference(directionPreferences?.start?.next, startFallbackVector),
    startFallbackVector
  );
  const endEmissionVector = normalizeVector(
    getDirectionVectorByPreference(directionPreferences?.end?.prev, endFallbackEmissionVector),
    endFallbackEmissionVector
  );
  const endDirectionVector = {
    x: -endEmissionVector.x,
    y: -endEmissionVector.y,
  };
  const startTrianglePath = getTrianglePath(sourceX, sourceY, startDirectionVector);
  const endTrianglePath = getTrianglePath(targetX, targetY, endDirectionVector);
  const handleSegmentContextMenu = useCallback(
    (event, segmentIndex) => {
      event.preventDefault();
      event.stopPropagation();
      const flowPoint = getLocalPointFromMouseEvent(event);
      if (!flowPoint) return;
      const controlPointIndexInSorted = getNearestControlPointIndex(
        absoluteControlPoints,
        flowPoint,
        controlPointHitTolerance
      );
      const controlPointIndex =
        typeof controlPointIndexInSorted === 'number'
          ? sortedControlPoints[controlPointIndexInSorted].index
          : null;
      edgeMenu?.openMenu({
        edgeId: id,
        controlPointIndex,
        controlPointRelative: absoluteControlPointToRelative(flowPoint, edgeFrame),
        position: { x: event.clientX, y: event.clientY },
        controlPointCount: controlPoints.length,
        segmentIndex,
        menuTargetType: 'segment',
      });
      if (typeof controlPointIndex === 'number') {
        edgeMenu?.selectControlPoint(id, controlPointIndex);
      } else {
        edgeMenu?.selectSegment(id, segmentIndex);
      }
    },
    [absoluteControlPoints, controlPoints.length, edgeFrame, edgeMenu, id, sortedControlPoints]
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
        controlPointCount: controlPoints.length,
        menuTargetType: 'control-point',
      });
      edgeMenu?.selectControlPoint(id, controlPointIndex);
    },
    [controlPoints.length, edgeMenu, id]
  );

  const handleEndpointContextMenu = useCallback(
    (event, endpointKey) => {
      event.preventDefault();
      event.stopPropagation();
      edgeMenu?.openMenu({
        edgeId: id,
        endpointKey,
        position: { x: event.clientX, y: event.clientY },
        menuTargetType: 'endpoint',
      });
    },
    [edgeMenu, id]
  );

  const handleControlPointPointerDown = useCallback(
    (event, controlPointIndex) => {
      const isLeftButton = event.button === 0;
      if (!isLeftButton) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      edgeMenu?.startControlPointDrag();
      edgeMenu?.selectControlPoint(id, controlPointIndex);
    },
    [edgeMenu, id]
  );

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

  const handleControlPointPointerUp = useCallback(
    (event) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      edgeMenu?.endControlPointDrag();
    },
    [edgeMenu]
  );

  const handleSegmentClick = useCallback(
    (event, segmentIndex) => {
      const isLeftButton = event.button === 0;
      if (!isLeftButton) return;
      event.preventDefault();
      event.stopPropagation();
      edgeMenu?.selectSegment(id, segmentIndex);
    },
    [edgeMenu, id]
  );

  return (
    <>
      {segments.map((segment) => {
        const isSegmentSelected =
          selectedTarget?.edgeId === id &&
          selectedTarget?.controlPointIndex === null &&
          selectedTarget?.segmentIndex === segment.index;
        return (
          <g key={`${id}-segment-${segment.index}`}>
            <BaseEdge
              id={`${id}-segment-${segment.index}`}
              path={segment.path}
              className={`editable-rec-edge-visible-path ${isSegmentSelected ? 'is-selected' : ''}`}
            />
            <path
              className="editable-rec-edge-hit-path nopan"
              d={segment.path}
              onClick={(event) => handleSegmentClick(event, segment.index)}
              onContextMenu={(event) => handleSegmentContextMenu(event, segment.index)}
            />
            {(isDebugInfoShownAlways || (isDebugInfoShownOnlyWhenSelected && isSegmentSelected)) ? (
              <text
                className="editable-rec-edge-debug-label"
                x={segment.debugLabelPosition.x}
                y={segment.debugLabelPosition.y}
              >
                <tspan x={segment.debugLabelPosition.x} dy="0">
                  {segment.debugCaseKey}
                </tspan>
                {'\n'}
                <tspan x={segment.debugLabelPosition.x} dy="12">
                  {segment.debugDirectionPlan.join(' -> ')}
                </tspan>
              </text>
            ) : null}
          </g>
        );
      })}
      <g>
        <circle
          className="editable-rec-edge-endpoint-hit nopan"
          cx={sourceX}
          cy={sourceY}
          r={9}
          onContextMenu={(event) => handleEndpointContextMenu(event, 'start')}
        />
        {isEdgeSelected ? (
          <path className="editable-rec-edge-endpoint-triangle" d={startTrianglePath} />
        ) : null}
        {isSegmentSelectedOnCurrentEdge ? (
          <text className="editable-rec-edge-endpoint-label" x={sourceX + 8} y={sourceY - 8}>
            start
          </text>
        ) : null}
      </g>
      <g>
        <circle
          className="editable-rec-edge-endpoint-hit nopan"
          cx={targetX}
          cy={targetY}
          r={9}
          onContextMenu={(event) => handleEndpointContextMenu(event, 'end')}
        />
        {isEdgeSelected ? (
          <path className="editable-rec-edge-endpoint-triangle" d={endTrianglePath} />
        ) : null}
        {isSegmentSelectedOnCurrentEdge ? (
          <text className="editable-rec-edge-endpoint-label" x={targetX + 8} y={targetY - 8}>
            end
          </text>
        ) : null}
      </g>
      {normalizedControlPoints.map((point) => {
        const isControlPointSelected =
          selectedTarget?.edgeId === id && selectedTarget?.controlPointIndex === point.index;
        return (
          <g key={`${id}-control-point-${point.index}`}>
            <circle
              className="editable-rec-edge-control-point-hit nopan"
              cx={point.absolute.x}
              cy={point.absolute.y}
              r={10}
              onContextMenu={(event) =>
                handleControlPointContextMenu(event, point.index, point.relative)
              }
              onPointerDown={(event) => handleControlPointPointerDown(event, point.index)}
              onPointerMove={(event) => handleControlPointPointerMove(event, point.index)}
              onPointerUp={handleControlPointPointerUp}
              onPointerCancel={handleControlPointPointerUp}
            />
            <circle
              className={`editable-rec-edge-control-point ${isControlPointSelected ? 'is-selected' : ''}`}
              cx={point.absolute.x}
              cy={point.absolute.y}
              r={4}
            />
          </g>
        );
      })}
    </>
  );
});

export const editableRecEdgeTypes = {
  editableRec: EditableRecEdge,
};
const edgeTypes = editableRecEdgeTypes;

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
      <div className="rec-edge-demo-node-label">{data?.basicData?.label ?? ''}</div>
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
  const { getExtraData, setExtraData } = useGraphDataApi(edgeRecEditableFlowId);
  const {
    edgeMenuContextValue,
    isControlPointDragging,
    handlePaneClick,
    handleNodeClick,
    menuOverlay,
  } = useEditableRecEdgeInteractions({
    edges,
    setEdges,
    getExtraData,
    setExtraData,
  });

  const onConnect = useCallback(
    (params) => {
      setEdges((existingEdges) =>
        addEdge(
          {
            ...params,
            type: 'editableRec',
            data: createDefaultEditableRecEdgeData(),
          },
          existingEdges
        )
      );
    },
    [setEdges]
  );

  return (
    <EdgeRecMenuContext.Provider value={edgeMenuContextValue}>
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
      {menuOverlay}
    </EdgeRecMenuContext.Provider>
  );
}
