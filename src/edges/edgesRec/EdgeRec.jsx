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
import { useNodesState, useEdgesState } from '../../examples/storeExapmle';
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
import '../../examples/6-edge-rec-editable.css';

const edgeRecEditableFlowId = 'edgeRecEditableFlowId';
export const EdgeRecMenuContext = createContext(null);
const controlPointHitTolerance = 10;
const minimumFlexibleEndpointLegLength = 100;
const directionalPreferenceStubLength = 24;
const DIR_UP = 'up';
const DIR_DOWN = 'down';
const DIR_LEFT = 'left';
const DIR_RIGHT = 'right';

export function createDefaultEditableRecEdgeData({
  startNext = 'right',
  endPrev = null,
  minimumEndpointLegLength = minimumFlexibleEndpointLegLength,
} = {}) {
  return {
    controlPoints: [],
    minimumEndpointLegLength,
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
  const edgeMenu = useContext(EdgeRecMenuContext);
  const edgeFrame = useMemo(
    () => getEdgeFrame(sourceX, sourceY, targetX, targetY),
    [sourceX, sourceY, targetX, targetY]
  );
  const controlPoints = data?.controlPoints ?? [];
  const directionPreferences = useMemo(
    () => normalizeDirectionPreferences(data?.directionPreferences, controlPoints.length),
    [controlPoints.length, data?.directionPreferences]
  );
  const minimumEndpointLegLength =
    typeof data?.minimumEndpointLegLength === 'number'
      ? data.minimumEndpointLegLength
      : minimumFlexibleEndpointLegLength;

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
  const isSegmentSelectedOnCurrentEdge =
    selectedTarget?.edgeId === id &&
    selectedTarget?.controlPointIndex === null &&
    typeof selectedTarget?.segmentIndex === 'number';
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
            {isSegmentSelected ? (
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
        <circle className="editable-rec-edge-endpoint" cx={sourceX} cy={sourceY} r={3} />
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
        <circle className="editable-rec-edge-endpoint" cx={targetX} cy={targetY} r={3} />
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
    data: {
      controlPoints: [],
      directionPreferences: {
        start: { next: 'right' },
        controlPoints: [],
        end: { prev: null },
      },
    },
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
    (params) => {
      setEdges((existingEdges) =>
        addEdge(
          {
            ...params,
            type: 'editableRec',
            data: {
              controlPoints: [],
              directionPreferences: {
                start: { next: 'right' },
                controlPoints: [],
                end: { prev: null },
              },
            },
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
