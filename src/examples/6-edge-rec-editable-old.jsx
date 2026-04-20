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
const directionOptions = [
  { value: 'right', label: 'right' },
  { value: 'left', label: 'left' },
  { value: 'down', label: 'down' },
  { value: 'up', label: 'up' },
  { value: 'horizontal', label: 'horizontal' },
  { value: 'vertical', label: 'vertical' },
  { value: null, label: 'auto' },
];
const directionalPreferenceStubLength = 24;

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

function isDirectionPreferenceValue(direction) {
  return (
    direction === 'horizontal' ||
    direction === 'vertical' ||
    direction === 'left' ||
    direction === 'right' ||
    direction === 'up' ||
    direction === 'down' ||
    direction === null
  );
}

function normalizeDirectionPreferences(directionPreferences, controlPointCount) {
  const normalizedControlPoints = Array.from({ length: controlPointCount }).map((_, index) => {
    const preference = directionPreferences?.controlPoints?.[index];
    const prev = isDirectionPreferenceValue(preference?.prev) ? preference.prev : null;
    const next = isDirectionPreferenceValue(preference?.next) ? preference.next : null;
    return { prev, next };
  });

  const startNext = isDirectionPreferenceValue(directionPreferences?.start?.next)
    ? directionPreferences.start.next
    : null;
  const endPrev = isDirectionPreferenceValue(directionPreferences?.end?.prev)
    ? directionPreferences.end.prev
    : null;

  return {
    start: { next: startNext },
    controlPoints: normalizedControlPoints,
    end: { prev: endPrev },
  };
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

function getDirectionVector(direction) {
  if (direction === 'left') return { x: -1, y: 0 };
  if (direction === 'right') return { x: 1, y: 0 };
  if (direction === 'up') return { x: 0, y: -1 };
  if (direction === 'down') return { x: 0, y: 1 };
  return null;
}

function getOppositeDirection(direction) {
  if (direction === 'left') return 'right';
  if (direction === 'right') return 'left';
  if (direction === 'up') return 'down';
  if (direction === 'down') return 'up';
  return direction;
}

function getDirectionFromDelta(deltaX, deltaY) {
  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    if (deltaX > 0) return 'right';
    if (deltaX < 0) return 'left';
    if (deltaY > 0) return 'down';
    if (deltaY < 0) return 'up';
    return null;
  }
  if (deltaY > 0) return 'down';
  if (deltaY < 0) return 'up';
  if (deltaX > 0) return 'right';
  if (deltaX < 0) return 'left';
  return null;
}

function getPreferredDirectionForAxis(axisPreference, fromPoint, toPoint) {
  const deltaX = toPoint.x - fromPoint.x;
  const deltaY = toPoint.y - fromPoint.y;
  if (axisPreference === 'horizontal') {
    if (deltaX > 0) return ['right', 'left'];
    if (deltaX < 0) return ['left', 'right'];
    return ['right', 'left'];
  }
  if (axisPreference === 'vertical') {
    if (deltaY > 0) return ['down', 'up'];
    if (deltaY < 0) return ['up', 'down'];
    return ['down', 'up'];
  }
  return null;
}

function resolveEmissionDirections(directionPreference, fromPoint, toPoint) {
  if (
    directionPreference === 'left' ||
    directionPreference === 'right' ||
    directionPreference === 'up' ||
    directionPreference === 'down'
  ) {
    return [directionPreference];
  }
  if (directionPreference === 'horizontal' || directionPreference === 'vertical') {
    return getPreferredDirectionForAxis(directionPreference, fromPoint, toPoint);
  }
  const preferredDirection = getDirectionFromDelta(toPoint.x - fromPoint.x, toPoint.y - fromPoint.y);
  const allDirections = ['right', 'left', 'down', 'up'];
  if (!preferredDirection) {
    return allDirections;
  }
  return [preferredDirection, ...allDirections.filter((direction) => direction !== preferredDirection)];
}

function movePoint(point, direction, length) {
  const vector = getDirectionVector(direction);
  if (!vector || length === 0) return point;
  return {
    x: point.x + vector.x * length,
    y: point.y + vector.y * length,
  };
}

function getSegmentDirection(fromPoint, toPoint) {
  if (fromPoint.x === toPoint.x) {
    if (toPoint.y > fromPoint.y) return 'down';
    if (toPoint.y < fromPoint.y) return 'up';
    return null;
  }
  if (fromPoint.y === toPoint.y) {
    if (toPoint.x > fromPoint.x) return 'right';
    if (toPoint.x < fromPoint.x) return 'left';
  }
  return null;
}

function getManhattanDistance(fromPoint, toPoint) {
  return Math.abs(fromPoint.x - toPoint.x) + Math.abs(fromPoint.y - toPoint.y);
}

function appendPointIfDifferent(points, point) {
  if (!point) return;
  const lastPoint = points[points.length - 1];
  if (!lastPoint || lastPoint.x !== point.x || lastPoint.y !== point.y) {
    points.push(point);
  }
}

function buildInnerOrthogonalPoints(startPoint, endPoint) {
  if (startPoint.x === endPoint.x || startPoint.y === endPoint.y) {
    return [endPoint];
  }
  const cornerByHorizontalFirst = { x: endPoint.x, y: startPoint.y };
  const cornerByVerticalFirst = { x: startPoint.x, y: endPoint.y };
  const horizontalFirstDistance =
    getManhattanDistance(startPoint, cornerByHorizontalFirst) +
    getManhattanDistance(cornerByHorizontalFirst, endPoint);
  const verticalFirstDistance =
    getManhattanDistance(startPoint, cornerByVerticalFirst) +
    getManhattanDistance(cornerByVerticalFirst, endPoint);
  if (horizontalFirstDistance <= verticalFirstDistance) {
    return [cornerByHorizontalFirst, endPoint];
  }
  return [cornerByVerticalFirst, endPoint];
}

function getPerpendicularDetourDirection(baseDirection, fromPoint, toPoint) {
  if (baseDirection === 'up' || baseDirection === 'down') {
    return toPoint.x < fromPoint.x ? 'left' : 'right';
  }
  if (baseDirection === 'left' || baseDirection === 'right') {
    return toPoint.y < fromPoint.y ? 'up' : 'down';
  }
  return null;
}

function buildOrthogonalPathPoints(
  fromPoint,
  toPoint,
  startEmissionDirection,
  endEmissionDirection,
  startPreference,
  endPreference,
  options = {}
) {
  const { isForceStartDetour = false, isForceEndDetour = false } = options;
  const endIncomingDirection = endEmissionDirection
    ? getOppositeDirection(endEmissionDirection)
    : null;
  const startStubLength = startPreference === null ? 0 : directionalPreferenceStubLength;
  const endStubLength = endPreference === null ? 0 : directionalPreferenceStubLength;
  const startStubPoint = startEmissionDirection
    ? movePoint(fromPoint, startEmissionDirection, startStubLength)
    : fromPoint;
  const endStubPoint = endIncomingDirection
    ? movePoint(toPoint, getOppositeDirection(endIncomingDirection), endStubLength)
    : toPoint;
  const startDetourDirection =
    isForceStartDetour && startEmissionDirection
      ? getPerpendicularDetourDirection(startEmissionDirection, startStubPoint, endStubPoint)
      : null;
  const startDetourPoint = startDetourDirection
    ? movePoint(startStubPoint, startDetourDirection, directionalPreferenceStubLength)
    : null;
  const middleStartPoint = startDetourPoint ?? startStubPoint;
  const endDetourDirection =
    isForceEndDetour && endIncomingDirection
      ? getPerpendicularDetourDirection(endIncomingDirection, endStubPoint, middleStartPoint)
      : null;
  const endDetourPoint = endDetourDirection
    ? movePoint(endStubPoint, endDetourDirection, directionalPreferenceStubLength)
    : null;
  const middleEndPoint = endDetourPoint ?? endStubPoint;
  const points = [fromPoint];
  appendPointIfDifferent(points, startStubPoint);
  appendPointIfDifferent(points, startDetourPoint);
  buildInnerOrthogonalPoints(middleStartPoint, middleEndPoint).forEach((point) => {
    appendPointIfDifferent(points, point);
  });
  appendPointIfDifferent(points, endStubPoint);
  appendPointIfDifferent(points, toPoint);
  return points;
}

function scoreOrthogonalPath(points, startEmissionDirection, endIncomingDirection) {
  let bendCount = 0;
  let distance = 0;
  let previousDirection = null;
  const segmentDirections = [];
  for (let index = 1; index < points.length; index += 1) {
    const fromPoint = points[index - 1];
    const toPoint = points[index];
    const direction = getSegmentDirection(fromPoint, toPoint);
    if (!direction) continue;
    segmentDirections.push(direction);
    distance += getManhattanDistance(fromPoint, toPoint);
    if (previousDirection && previousDirection !== direction) {
      bendCount += 1;
    }
    previousDirection = direction;
  }
  return {
    bendCount,
    distance,
  };
}

function getPathDirections(points) {
  const directions = [];
  for (let index = 1; index < points.length; index += 1) {
    const direction = getSegmentDirection(points[index - 1], points[index]);
    if (direction) {
      directions.push(direction);
    }
  }
  return directions;
}

function isValidOrthogonalPathCandidate(points, startPreference, startEmissionDirection, endPreference, endEmissionDirection) {
  const directions = getPathDirections(points);
  if (!directions.length) return true;

  if (startPreference !== null && startEmissionDirection && directions.length > 1) {
    const secondDirection = directions[1];
    if (secondDirection === getOppositeDirection(startEmissionDirection)) {
      return false;
    }
  }

  if (endPreference !== null && endEmissionDirection && directions.length > 1) {
    const endIncomingDirection = getOppositeDirection(endEmissionDirection);
    const beforeLastDirection = directions[directions.length - 2];
    if (beforeLastDirection === getOppositeDirection(endIncomingDirection)) {
      return false;
    }
  }

  return true;
}

function chooseBestOrthogonalPath(
  fromPoint,
  toPoint,
  startPreference,
  endPreference
) {
  const startEmissionCandidates = resolveEmissionDirections(startPreference, fromPoint, toPoint);
  const endEmissionCandidates = resolveEmissionDirections(endPreference, toPoint, fromPoint);
  let bestResult = null;
  let bestRelaxedResult = null;

  startEmissionCandidates.forEach((startEmissionDirection) => {
    endEmissionCandidates.forEach((endEmissionDirection) => {
      const endIncomingDirection = endEmissionDirection
        ? getOppositeDirection(endEmissionDirection)
        : null;
      const routeOptions = [{ isForceStartDetour: false, isForceEndDetour: false }];
      if (startPreference !== null && startEmissionDirection) {
        routeOptions.push({ isForceStartDetour: true, isForceEndDetour: false });
      }
      if (endPreference !== null && endEmissionDirection) {
        routeOptions.push({ isForceStartDetour: false, isForceEndDetour: true });
      }
      if (startPreference !== null && startEmissionDirection && endPreference !== null && endEmissionDirection) {
        routeOptions.push({ isForceStartDetour: true, isForceEndDetour: true });
      }

      routeOptions.forEach((routeOption) => {
        const points = buildOrthogonalPathPoints(
          fromPoint,
          toPoint,
          startEmissionDirection,
          endEmissionDirection,
          startPreference,
          endPreference,
          routeOption
        );
        const isValidCandidate = isValidOrthogonalPathCandidate(
          points,
          startPreference,
          startEmissionDirection,
          endPreference,
          endEmissionDirection
        );
        const score = scoreOrthogonalPath(points, startEmissionDirection, endIncomingDirection);
        const nextResult = {
          points,
          score,
        };
        if (!bestRelaxedResult) {
          bestRelaxedResult = nextResult;
        } else {
          const hasLessBendsRelaxed =
            nextResult.score.bendCount < bestRelaxedResult.score.bendCount;
          const hasLessDistanceRelaxed =
            nextResult.score.distance < bestRelaxedResult.score.distance;
          if (
            hasLessBendsRelaxed ||
            (nextResult.score.bendCount === bestRelaxedResult.score.bendCount &&
              hasLessDistanceRelaxed)
          ) {
            bestRelaxedResult = nextResult;
          }
        }

        if (!isValidCandidate) {
          return;
        }
        if (!bestResult) {
          bestResult = nextResult;
          return;
        }
        const hasLessBends = nextResult.score.bendCount < bestResult.score.bendCount;
        const hasLessDistance = nextResult.score.distance < bestResult.score.distance;
        if (
          hasLessBends ||
          (nextResult.score.bendCount === bestResult.score.bendCount && hasLessDistance)
        ) {
          bestResult = nextResult;
        }
      });
    });
  });

  if (bestResult) {
    return bestResult.points;
  }
  if (bestRelaxedResult) {
    return bestRelaxedResult.points;
  }
  return buildOrthogonalPathPoints(fromPoint, toPoint, null, null, null, null);
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
    const { startEmissionDirection, endEmissionDirection } = resolveSegmentPreferences(
      index,
      directionPreferences
    );
    const orthogonalPoints = chooseBestOrthogonalPath(
      fromPoint,
      toPoint,
      startEmissionDirection,
      endEmissionDirection
    );
    const pathParts = orthogonalPoints.map((point, pointIndex) =>
      pointIndex === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`
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

    const startSideChildren = directionOptions.map((option) => ({
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

    const endSideChildren = directionOptions.map((option) => ({
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
      name: 'set start-side direction',
      disabled: !canSetStartSide,
      children: startSideChildren,
    });
    items.push({
      type: 'menu',
      name: 'set end-side direction',
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
            const nextDirectionPreferences = {
              start: { next: directionPreferences.start.next },
              controlPoints: [
                ...directionPreferences.controlPoints.slice(0, splitSegmentIndex),
                { prev: null, next: null },
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
            const nextDirectionPreferences = {
              start: { next: directionPreferences.start.next },
              controlPoints: directionPreferences.controlPoints.filter(
                (_, index) => index !== removeIndex
              ),
              end: { prev: directionPreferences.end.prev },
            };
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
