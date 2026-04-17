import { createContext, memo, useCallback, useContext, useMemo, useState } from 'react';
import { CheckIcon, MenuComp } from '@wwf971/react-comp-misc';
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
import { useNodesState, useEdgesState } from './storeExapmle';
import 'reactflow/dist/style.css';
import './6-edge-rec-editable.css';

const edgeRecEditableFlowId = 'edgeRecEditableFlowId';
const EdgeRecMenuContext = createContext(null);
const controlPointHitTolerance = 10;
const maxControlPoints = 2;
const orientationOptions = [
  { value: 'horizontal', label: 'horizontal' },
  { value: 'vertical', label: 'vertical' },
  { value: null, label: 'null' },
];

function MenuOptionLabel({ label, isChecked }) {
  return (
    <div className="rec-edge-menu-item">
      <span className="rec-edge-menu-icon-wrap">
        {isChecked ? <CheckIcon width={12} height={12} /> : null}
      </span>
      <span className="rec-edge-menu-text">{label}</span>
    </div>
  );
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

function getRightAngleCorner(pointA, pointB, isHigherPointHorizontalFirst) {
  if (pointA.y <= pointB.y) {
    return isHigherPointHorizontalFirst
      ? { x: pointB.x, y: pointA.y }
      : { x: pointA.x, y: pointB.y };
  }
  return isHigherPointHorizontalFirst
    ? { x: pointA.x, y: pointB.y }
    : { x: pointB.x, y: pointA.y };
}

function appendRightAngleSegment(pathParts, fromPoint, toPoint, isHigherPointHorizontalFirst) {
  const corner = getRightAngleCorner(fromPoint, toPoint, isHigherPointHorizontalFirst);
  const isCornerSameAsFrom = corner.x === fromPoint.x && corner.y === fromPoint.y;
  const isCornerSameAsTo = corner.x === toPoint.x && corner.y === toPoint.y;

  if (!isCornerSameAsFrom && !isCornerSameAsTo) {
    pathParts.push(`L ${corner.x} ${corner.y}`);
  }
  pathParts.push(`L ${toPoint.x} ${toPoint.y}`);
}

function isDirectionValue(direction) {
  return direction === 'horizontal' || direction === 'vertical' || direction === null;
}

function normalizeDirectionPreferences(directionPreferences, controlPointCount) {
  const normalizedControlPoints = Array.from({ length: controlPointCount }).map((_, index) => {
    const preference = directionPreferences?.controlPoints?.[index];
    const prev = isDirectionValue(preference?.prev) ? preference.prev : null;
    const next = isDirectionValue(preference?.next) ? preference.next : null;
    return { prev, next };
  });

  const startNext = isDirectionValue(directionPreferences?.start?.next)
    ? directionPreferences.start.next
    : null;
  const endPrev = isDirectionValue(directionPreferences?.end?.prev)
    ? directionPreferences.end.prev
    : null;

  return {
    start: { next: startNext },
    controlPoints: normalizedControlPoints,
    end: { prev: endPrev },
  };
}

function resolveSegmentDirection(segmentIndex, directionPreferences) {
  const controlPointCount = directionPreferences.controlPoints.length;
  const startDirection =
    segmentIndex === 0
      ? directionPreferences.start.next
      : directionPreferences.controlPoints[segmentIndex - 1]?.next ?? null;
  const endDirection =
    segmentIndex === controlPointCount
      ? directionPreferences.end.prev
      : directionPreferences.controlPoints[segmentIndex]?.prev ?? null;

  if (startDirection !== null) {
    return startDirection;
  }
  if (endDirection !== null) {
    return endDirection;
  }
  return 'horizontal';
}

function cloneDirectionPreferences(directionPreferences) {
  return {
    start: { next: directionPreferences.start.next },
    controlPoints: directionPreferences.controlPoints.map((point) => ({
      prev: point.prev,
      next: point.next,
    })),
    end: { prev: directionPreferences.end.prev },
  };
}

function setControlPointSideDirection(
  directionPreferences,
  controlPointIndex,
  side,
  direction
) {
  const nextDirectionPreferences = cloneDirectionPreferences(directionPreferences);
  if (!nextDirectionPreferences.controlPoints[controlPointIndex]) {
    return nextDirectionPreferences;
  }
  if (side === 'prev') {
    nextDirectionPreferences.controlPoints[controlPointIndex].prev = direction;
    return nextDirectionPreferences;
  }
  if (side === 'next') {
    nextDirectionPreferences.controlPoints[controlPointIndex].next = direction;
    return nextDirectionPreferences;
  }
  return nextDirectionPreferences;
}

function applySideDirectionForMenuTarget(menuState, directionPreferences, direction) {
  if (!menuState) return directionPreferences;
  const sideRole = menuState.sideRole;
  if (sideRole !== 'start' && sideRole !== 'end') {
    return directionPreferences;
  }

  if (menuState.menuTargetType === 'control-point') {
    if (typeof menuState.controlPointIndex !== 'number') return directionPreferences;
    const side = sideRole === 'start' ? 'prev' : 'next';
    return setControlPointSideDirection(
      directionPreferences,
      menuState.controlPointIndex,
      side,
      direction
    );
  }

  if (menuState.menuTargetType === 'endpoint') {
    const endpointKey = menuState.endpointKey;
    if (endpointKey === 'start' && sideRole === 'end') {
      return setEndpointSideDirection(directionPreferences, 'start', direction);
    }
    if (endpointKey === 'end' && sideRole === 'start') {
      return setEndpointSideDirection(directionPreferences, 'end', direction);
    }
  }

  return directionPreferences;
}

function setEndpointSideDirection(directionPreferences, endpointKey, direction) {
  const nextDirectionPreferences = cloneDirectionPreferences(directionPreferences);
  if (endpointKey === 'start') {
    nextDirectionPreferences.start.next = direction;
    return nextDirectionPreferences;
  }
  if (endpointKey === 'end') {
    nextDirectionPreferences.end.prev = direction;
    return nextDirectionPreferences;
  }
  return nextDirectionPreferences;
}

function buildRecEditableSegments(sourceX, sourceY, targetX, targetY, controlPoints, directionPreferences) {
  const pathPoints = [{ x: sourceX, y: sourceY }, ...(controlPoints ?? []), { x: targetX, y: targetY }];

  return pathPoints.slice(0, -1).map((fromPoint, index) => {
    const toPoint = pathPoints[index + 1];
    const direction = resolveSegmentDirection(index, directionPreferences);
    const isHigherPointHorizontalFirst = direction === 'horizontal';
    const pathParts = [`M ${fromPoint.x} ${fromPoint.y}`];
    appendRightAngleSegment(
      pathParts,
      fromPoint,
      toPoint,
      isHigherPointHorizontalFirst
    );
    return {
      index,
      path: pathParts.join(' '),
    };
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
      directionPreferences
    );
  }, [sourceX, sourceY, targetX, targetY, absoluteControlPoints, directionPreferences]);

  const selectedTarget = edgeMenu?.selectedTarget ?? null;
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

const edgeTypes = {
  editableRec: EditableRecEdge,
};

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
        start: { next: 'horizontal' },
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

  const selectSegment = useCallback((edgeId, segmentIndex) => {
    setSelectedTarget({ edgeId, controlPointIndex: null, segmentIndex });
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
            type: 'editableRec',
            data: {
              controlPoints: [],
              directionPreferences: {
                start: { next: 'horizontal' },
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

  const menuItems = useMemo(() => {
    if (!menuState) return [];
    const selectedEdge = edges.find((edge) => edge.id === menuState.edgeId);
    const selectedControlPoints = selectedEdge?.data?.controlPoints ?? [];
    const selectedDirectionPreferences = normalizeDirectionPreferences(
      selectedEdge?.data?.directionPreferences,
      selectedControlPoints.length
    );
    const isCreateEnabled =
      menuState.menuTargetType === 'segment' &&
      !!menuState.controlPointRelative &&
      (menuState.controlPointCount ?? 0) < maxControlPoints;
    const items = [];
    if (menuState.menuTargetType === 'segment') {
      items.push({
        type: 'item',
        name: 'create control point',
        action: 'create-control-point',
        disabled: !isCreateEnabled,
      });
    }
    if (typeof menuState.controlPointIndex === 'number') {
      items.push({ type: 'item', name: 'remove control point', action: 'remove-control-point' });
    }
    const canSetStartSide =
      menuState.menuTargetType === 'control-point' ||
      (menuState.menuTargetType === 'endpoint' && menuState.endpointKey === 'end');
    const canSetEndSide =
      menuState.menuTargetType === 'control-point' ||
      (menuState.menuTargetType === 'endpoint' && menuState.endpointKey === 'start');

    const startSideCurrentValue =
      menuState.menuTargetType === 'control-point' &&
      typeof menuState.controlPointIndex === 'number'
        ? selectedDirectionPreferences.controlPoints[menuState.controlPointIndex]?.prev ?? null
        : menuState.menuTargetType === 'endpoint' && menuState.endpointKey === 'end'
          ? selectedDirectionPreferences.end.prev
          : null;

    const endSideCurrentValue =
      menuState.menuTargetType === 'control-point' &&
      typeof menuState.controlPointIndex === 'number'
        ? selectedDirectionPreferences.controlPoints[menuState.controlPointIndex]?.next ?? null
        : menuState.menuTargetType === 'endpoint' && menuState.endpointKey === 'start'
          ? selectedDirectionPreferences.start.next
          : null;

    const startSideChildren = orientationOptions.map((option) => ({
      type: 'item',
      name: option.label,
      action: 'set-side-direction',
      data: {
        sideRole: 'start',
        direction: option.value,
      },
      component: MenuOptionLabel,
      componentProps: {
        label: option.label,
        isChecked: startSideCurrentValue === option.value,
      },
    }));

    const endSideChildren = orientationOptions.map((option) => ({
      type: 'item',
      name: option.label,
      action: 'set-side-direction',
      data: {
        sideRole: 'end',
        direction: option.value,
      },
      component: MenuOptionLabel,
      componentProps: {
        label: option.label,
        isChecked: endSideCurrentValue === option.value,
      },
    }));

    items.push({
      type: 'menu',
      name: 'set start-side orientation',
      disabled: !canSetStartSide,
      children: startSideChildren,
    });
    items.push({
      type: 'menu',
      name: 'set end-side orientation',
      disabled: !canSetEndSide,
      children: endSideChildren,
    });
    return items;
  }, [edges, menuState]);

  const handleMenuItemClick = useCallback(
    (item) => {
      if (!menuState) return;
      if (item.action === 'create-control-point' && menuState.controlPointRelative) {
        setEdges((existingEdges) =>
          existingEdges.map((edge) => {
            if (edge.id !== menuState.edgeId) return edge;
            const controlPoints = edge.data?.controlPoints ?? [];
            if (controlPoints.length >= maxControlPoints) return edge;
            const directionPreferences = normalizeDirectionPreferences(
              edge.data?.directionPreferences,
              controlPoints.length
            );
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
            const splitSegmentIndex = insertIndex === -1 ? controlPoints.length : insertIndex;
            const splitDirection = resolveSegmentDirection(splitSegmentIndex, directionPreferences);
            const nextDirectionPreferences = {
              start: { next: directionPreferences.start.next },
              controlPoints: [
                ...directionPreferences.controlPoints.slice(0, splitSegmentIndex),
                { prev: null, next: splitDirection },
                ...directionPreferences.controlPoints.slice(splitSegmentIndex),
              ],
              end: { prev: directionPreferences.end.prev },
            };
            return {
              ...edge,
              data: {
                ...edge.data,
                controlPoints: nextControlPoints,
                directionPreferences: nextDirectionPreferences,
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
            const directionPreferences = normalizeDirectionPreferences(
              edge.data?.directionPreferences,
              controlPoints.length
            );
            const removeIndex = menuState.controlPointIndex;
            const leftSegmentDirection = resolveSegmentDirection(removeIndex, directionPreferences);
            const rightSegmentDirection = resolveSegmentDirection(removeIndex + 1, directionPreferences);
            const mergedSegmentDirection =
              leftSegmentDirection === rightSegmentDirection
                ? leftSegmentDirection
                : leftSegmentDirection;
            const nextDirectionPreferences = {
              start: { next: directionPreferences.start.next },
              controlPoints: directionPreferences.controlPoints.filter(
                (_, index) => index !== removeIndex
              ),
              end: { prev: directionPreferences.end.prev },
            };
            if (removeIndex === 0) {
              nextDirectionPreferences.start.next = mergedSegmentDirection;
            } else if (nextDirectionPreferences.controlPoints[removeIndex - 1]) {
              nextDirectionPreferences.controlPoints[removeIndex - 1].next =
                mergedSegmentDirection;
            }
            return {
              ...edge,
              data: {
                ...edge.data,
                controlPoints: controlPoints.filter((_, index) => index !== removeIndex),
                directionPreferences: nextDirectionPreferences,
              },
            };
          })
        );
      }

      if (item.action === 'set-side-direction') {
        setEdges((existingEdges) =>
          existingEdges.map((edge) => {
            if (edge.id !== menuState.edgeId) return edge;
            const controlPoints = edge.data?.controlPoints ?? [];
            const directionPreferences = normalizeDirectionPreferences(
              edge.data?.directionPreferences,
              controlPoints.length
            );
            const nextDirectionPreferences = applySideDirectionForMenuTarget(
              {
                menuTargetType: menuState.menuTargetType,
                controlPointIndex: menuState.controlPointIndex,
                endpointKey: menuState.endpointKey,
                sideRole: item.data?.sideRole,
              },
              directionPreferences,
              item.data?.direction
            );
            return {
              ...edge,
              data: {
                ...edge.data,
                directionPreferences: nextDirectionPreferences,
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
      selectSegment,
      selectControlPoint,
      startControlPointDrag,
      endControlPointDrag,
    }),
    [
      endControlPointDrag,
      openMenu,
      selectControlPoint,
      selectSegment,
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
      {isMenuOpen && (
        <MenuComp
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
    </EdgeRecMenuContext.Provider>
  );
}
