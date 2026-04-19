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
const DIR_UP = 'up';
const DIR_DOWN = 'down';
const DIR_LEFT = 'left';
const DIR_RIGHT = 'right';
const PREF_HORIZONTAL = 'horizontal';
const PREF_VERTICAL = 'vertical';
const PREF_UP = DIR_UP;
const PREF_DOWN = DIR_DOWN;
const PREF_LEFT = DIR_LEFT;
const PREF_RIGHT = DIR_RIGHT;

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

function getSegmentDirection(fromPoint, toPoint) {
  if (fromPoint.x === toPoint.x) {
    if (toPoint.y > fromPoint.y) return DIR_DOWN;
    if (toPoint.y < fromPoint.y) return DIR_UP;
    return null;
  }
  if (fromPoint.y === toPoint.y) {
    if (toPoint.x > fromPoint.x) return DIR_RIGHT;
    if (toPoint.x < fromPoint.x) return DIR_LEFT;
  }
  return null;
}

function getManhattanDistance(fromPoint, toPoint) {
  return Math.abs(fromPoint.x - toPoint.x) + Math.abs(fromPoint.y - toPoint.y);
}

function getUniqueNumbers(values) {
  return [...new Set(values)].sort((a, b) => a - b);
}

function normalizePreferenceForCase(preference, fromPoint, toPoint) {
  if (preference === PREF_HORIZONTAL || preference === PREF_VERTICAL) return preference;
  if (
    preference === PREF_UP ||
    preference === PREF_DOWN ||
    preference === PREF_LEFT ||
    preference === PREF_RIGHT
  ) {
    return preference;
  }
  const deltaX = toPoint.x - fromPoint.x;
  const deltaY = toPoint.y - fromPoint.y;
  return Math.abs(deltaX) >= Math.abs(deltaY) ? PREF_HORIZONTAL : PREF_VERTICAL;
}

function getRelativePositionKey(fromPoint, toPoint) {
  const isOnRight = toPoint.x >= fromPoint.x;
  const isOnBottom = toPoint.y >= fromPoint.y;
  if (isOnRight && isOnBottom) return 'bottomRight';
  if (!isOnRight && isOnBottom) return 'bottomLeft';
  if (isOnRight && !isOnBottom) return 'topRight';
  return 'topLeft';
}

function getDirectionPlanByCaseKey(caseKey) {
  switch (caseKey) {
    case 'topRight|up|up':
      return [DIR_UP, DIR_RIGHT, DIR_DOWN];
    case 'topRight|up|down':
      return [DIR_UP, DIR_RIGHT, DIR_UP];
    case 'topRight|up|left':
      return [DIR_UP, DIR_RIGHT];
    case 'topRight|up|right':
      return [DIR_UP, DIR_RIGHT, DIR_UP, DIR_LEFT];
    case 'topRight|up|horizontal':
      return [DIR_UP, DIR_RIGHT];
    case 'topRight|up|vertical':
      return [DIR_UP, DIR_RIGHT, DIR_UP];
    case 'topRight|down|up':
      return [DIR_DOWN, DIR_RIGHT, DIR_UP, DIR_RIGHT, DIR_DOWN];
    case 'topRight|down|down':
      return [DIR_DOWN, DIR_RIGHT, DIR_UP];
    case 'topRight|down|left':
      return [DIR_DOWN, DIR_RIGHT, DIR_UP, DIR_RIGHT];
    case 'topRight|down|right':
      return [DIR_DOWN, DIR_RIGHT, DIR_UP, DIR_LEFT];
    case 'topRight|down|horizontal':
      return [DIR_DOWN, DIR_RIGHT, DIR_UP, DIR_RIGHT];
    case 'topRight|down|vertical':
      return [DIR_DOWN, DIR_RIGHT, DIR_UP];
    case 'topRight|left|up':
      return [DIR_LEFT, DIR_UP, DIR_RIGHT, DIR_DOWN];
    case 'topRight|left|down':
      return [DIR_LEFT, DIR_UP, DIR_RIGHT, DIR_UP];
    case 'topRight|left|left':
      return [DIR_LEFT, DIR_UP, DIR_RIGHT];
    case 'topRight|left|right':
      return [DIR_LEFT, DIR_UP, DIR_LEFT];
    case 'topRight|left|horizontal':
      return [DIR_LEFT, DIR_UP, DIR_RIGHT];
    case 'topRight|left|vertical':
      return [DIR_LEFT, DIR_UP, DIR_RIGHT, DIR_UP];
    case 'topRight|right|up':
      return [DIR_RIGHT, DIR_UP, DIR_RIGHT, DIR_DOWN];
    case 'topRight|right|down':
      return [DIR_RIGHT, DIR_UP];
    case 'topRight|right|left':
      return [DIR_RIGHT, DIR_UP, DIR_RIGHT];
    case 'topRight|right|right':
      return [DIR_RIGHT, DIR_UP, DIR_LEFT];
    case 'topRight|right|horizontal':
      return [DIR_RIGHT, DIR_UP, DIR_RIGHT];
    case 'topRight|right|vertical':
      return [DIR_RIGHT, DIR_UP];
    case 'topRight|horizontal|up':
      return [DIR_RIGHT, DIR_UP, DIR_RIGHT, DIR_DOWN];
    case 'topRight|horizontal|down':
      return [DIR_RIGHT, DIR_UP];
    case 'topRight|horizontal|left':
      return [DIR_RIGHT, DIR_UP, DIR_RIGHT];
    case 'topRight|horizontal|right':
      return [DIR_RIGHT, DIR_UP, DIR_LEFT];
    case 'topRight|horizontal|horizontal':
      return [DIR_RIGHT, DIR_UP, DIR_RIGHT];
    case 'topRight|horizontal|vertical':
      return [DIR_RIGHT, DIR_UP];
    case 'topRight|vertical|up':
      return [DIR_UP, DIR_RIGHT, DIR_DOWN];
    case 'topRight|vertical|down':
      return [DIR_UP, DIR_RIGHT, DIR_UP];
    case 'topRight|vertical|left':
      return [DIR_UP, DIR_RIGHT];
    case 'topRight|vertical|right':
      return [DIR_UP, DIR_RIGHT, DIR_UP, DIR_LEFT];
    case 'topRight|vertical|horizontal':
      return [DIR_UP, DIR_RIGHT];
    case 'topRight|vertical|vertical':
      return [DIR_UP, DIR_RIGHT, DIR_UP];
    case 'topLeft|up|up':
      return [DIR_UP, DIR_LEFT, DIR_DOWN];
    case 'topLeft|up|down':
      return [DIR_UP, DIR_LEFT, DIR_UP];
    case 'topLeft|up|left':
      return [DIR_UP, DIR_LEFT, DIR_UP, DIR_RIGHT];
    case 'topLeft|up|right':
      return [DIR_UP, DIR_LEFT];
    case 'topLeft|up|horizontal':
      return [DIR_UP, DIR_LEFT];
    case 'topLeft|up|vertical':
      return [DIR_UP, DIR_LEFT, DIR_UP];
    case 'topLeft|down|up':
      return [DIR_DOWN, DIR_LEFT, DIR_UP, DIR_LEFT, DIR_DOWN];
    case 'topLeft|down|down':
      return [DIR_DOWN, DIR_LEFT, DIR_UP];
    case 'topLeft|down|left':
      return [DIR_DOWN, DIR_LEFT, DIR_UP, DIR_RIGHT];
    case 'topLeft|down|right':
      return [DIR_DOWN, DIR_LEFT, DIR_UP, DIR_LEFT];
    case 'topLeft|down|horizontal':
      return [DIR_DOWN, DIR_LEFT, DIR_UP, DIR_LEFT];
    case 'topLeft|down|vertical':
      return [DIR_DOWN, DIR_LEFT, DIR_UP];
    case 'topLeft|left|up':
      return [DIR_LEFT, DIR_UP, DIR_LEFT, DIR_DOWN];
    case 'topLeft|left|down':
      return [DIR_LEFT, DIR_UP];
    case 'topLeft|left|left':
      return [DIR_LEFT, DIR_UP, DIR_RIGHT];
    case 'topLeft|left|right':
      return [DIR_LEFT, DIR_UP, DIR_LEFT];
    case 'topLeft|left|horizontal':
      return [DIR_LEFT, DIR_UP, DIR_LEFT];
    case 'topLeft|left|vertical':
      return [DIR_LEFT, DIR_UP];
    case 'topLeft|right|up':
      return [DIR_RIGHT, DIR_UP, DIR_LEFT, DIR_DOWN];
    case 'topLeft|right|down':
      return [DIR_RIGHT, DIR_UP, DIR_LEFT, DIR_UP];
    case 'topLeft|right|left':
      return [DIR_RIGHT, DIR_UP, DIR_RIGHT];
    case 'topLeft|right|right':
      return [DIR_RIGHT, DIR_UP, DIR_LEFT];
    case 'topLeft|right|horizontal':
      return [DIR_RIGHT, DIR_UP, DIR_LEFT];
    case 'topLeft|right|vertical':
      return [DIR_RIGHT, DIR_UP, DIR_LEFT, DIR_UP];
    case 'topLeft|horizontal|up':
      return [DIR_LEFT, DIR_UP, DIR_LEFT, DIR_DOWN];
    case 'topLeft|horizontal|down':
      return [DIR_LEFT, DIR_UP];
    case 'topLeft|horizontal|left':
      return [DIR_LEFT, DIR_UP, DIR_RIGHT];
    case 'topLeft|horizontal|right':
      return [DIR_LEFT, DIR_UP, DIR_LEFT];
    case 'topLeft|horizontal|horizontal':
      return [DIR_LEFT, DIR_UP, DIR_LEFT];
    case 'topLeft|horizontal|vertical':
      return [DIR_LEFT, DIR_UP];
    case 'topLeft|vertical|up':
      return [DIR_UP, DIR_LEFT, DIR_DOWN];
    case 'topLeft|vertical|down':
      return [DIR_UP, DIR_LEFT, DIR_UP];
    case 'topLeft|vertical|left':
      return [DIR_UP, DIR_LEFT, DIR_UP, DIR_RIGHT];
    case 'topLeft|vertical|right':
      return [DIR_UP, DIR_LEFT];
    case 'topLeft|vertical|horizontal':
      return [DIR_UP, DIR_LEFT];
    case 'topLeft|vertical|vertical':
      return [DIR_UP, DIR_LEFT, DIR_UP];
    case 'bottomRight|up|up':
      return [DIR_UP, DIR_RIGHT, DIR_DOWN];
    case 'bottomRight|up|down':
      return [DIR_UP, DIR_RIGHT, DIR_DOWN, DIR_RIGHT, DIR_UP];
    case 'bottomRight|up|left':
      return [DIR_UP, DIR_RIGHT, DIR_DOWN, DIR_RIGHT];
    case 'bottomRight|up|right':
      return [DIR_UP, DIR_RIGHT, DIR_DOWN, DIR_LEFT];
    case 'bottomRight|up|horizontal':
      return [DIR_UP, DIR_RIGHT, DIR_DOWN, DIR_RIGHT];
    case 'bottomRight|up|vertical':
      return [DIR_UP, DIR_RIGHT, DIR_DOWN];
    case 'bottomRight|down|up':
      return [DIR_DOWN, DIR_RIGHT, DIR_DOWN];
    case 'bottomRight|down|down':
      return [DIR_DOWN, DIR_RIGHT, DIR_UP];
    case 'bottomRight|down|left':
      return [DIR_DOWN, DIR_RIGHT];
    case 'bottomRight|down|right':
      return [DIR_DOWN, DIR_RIGHT, DIR_DOWN, DIR_LEFT];
    case 'bottomRight|down|horizontal':
      return [DIR_DOWN, DIR_RIGHT];
    case 'bottomRight|down|vertical':
      return [DIR_DOWN, DIR_RIGHT, DIR_DOWN];
    case 'bottomRight|left|up':
      return [DIR_LEFT, DIR_DOWN, DIR_RIGHT, DIR_DOWN];
    case 'bottomRight|left|down':
      return [DIR_LEFT, DIR_DOWN, DIR_RIGHT, DIR_UP];
    case 'bottomRight|left|left':
      return [DIR_LEFT, DIR_DOWN, DIR_RIGHT];
    case 'bottomRight|left|right':
      return [DIR_LEFT, DIR_DOWN, DIR_LEFT];
    case 'bottomRight|left|horizontal':
      return [DIR_LEFT, DIR_DOWN, DIR_RIGHT];
    case 'bottomRight|left|vertical':
      return [DIR_LEFT, DIR_DOWN, DIR_RIGHT, DIR_DOWN];
    case 'bottomRight|right|up':
      return [DIR_RIGHT, DIR_DOWN];
    case 'bottomRight|right|down':
      return [DIR_RIGHT, DIR_DOWN, DIR_RIGHT, DIR_UP];
    case 'bottomRight|right|left':
      return [DIR_RIGHT, DIR_DOWN, DIR_RIGHT];
    case 'bottomRight|right|right':
      return [DIR_RIGHT, DIR_DOWN, DIR_LEFT];
    case 'bottomRight|right|horizontal':
      return [DIR_RIGHT, DIR_DOWN, DIR_RIGHT];
    case 'bottomRight|right|vertical':
      return [DIR_RIGHT, DIR_DOWN];
    case 'bottomRight|horizontal|up':
      return [DIR_RIGHT, DIR_DOWN];
    case 'bottomRight|horizontal|down':
      return [DIR_RIGHT, DIR_DOWN, DIR_RIGHT, DIR_UP];
    case 'bottomRight|horizontal|left':
      return [DIR_RIGHT, DIR_DOWN, DIR_RIGHT];
    case 'bottomRight|horizontal|right':
      return [DIR_RIGHT, DIR_DOWN, DIR_LEFT];
    case 'bottomRight|horizontal|horizontal':
      return [DIR_RIGHT, DIR_DOWN, DIR_RIGHT];
    case 'bottomRight|horizontal|vertical':
      return [DIR_RIGHT, DIR_DOWN];
    case 'bottomRight|vertical|up':
      return [DIR_DOWN, DIR_RIGHT, DIR_DOWN];
    case 'bottomRight|vertical|down':
      return [DIR_DOWN, DIR_RIGHT, DIR_UP];
    case 'bottomRight|vertical|left':
      return [DIR_DOWN, DIR_RIGHT];
    case 'bottomRight|vertical|right':
      return [DIR_DOWN, DIR_RIGHT, DIR_DOWN, DIR_LEFT];
    case 'bottomRight|vertical|horizontal':
      return [DIR_DOWN, DIR_RIGHT];
    case 'bottomRight|vertical|vertical':
      return [DIR_DOWN, DIR_RIGHT, DIR_DOWN];
    case 'bottomLeft|up|up':
      return [DIR_UP, DIR_LEFT, DIR_DOWN];
    case 'bottomLeft|up|down':
      return [DIR_UP, DIR_LEFT, DIR_UP];
    case 'bottomLeft|up|left':
      return [DIR_UP, DIR_LEFT, DIR_DOWN, DIR_RIGHT];
    case 'bottomLeft|up|right':
      return [DIR_UP, DIR_LEFT, DIR_DOWN, DIR_LEFT];
    case 'bottomLeft|up|horizontal':
      return [DIR_UP, DIR_LEFT, DIR_DOWN, DIR_LEFT];
    case 'bottomLeft|up|vertical':
      return [DIR_UP, DIR_LEFT, DIR_DOWN];
    case 'bottomLeft|down|up':
      return [DIR_DOWN, DIR_LEFT, DIR_DOWN];
    case 'bottomLeft|down|down':
      return [DIR_DOWN, DIR_LEFT, DIR_UP];
    case 'bottomLeft|down|left':
      return [DIR_DOWN, DIR_LEFT, DIR_DOWN, DIR_RIGHT];
    case 'bottomLeft|down|right':
      return [DIR_DOWN, DIR_LEFT];
    case 'bottomLeft|down|horizontal':
      return [DIR_DOWN, DIR_LEFT];
    case 'bottomLeft|down|vertical':
      return [DIR_DOWN, DIR_LEFT, DIR_DOWN];
    case 'bottomLeft|left|up':
      return [DIR_LEFT, DIR_DOWN];
    case 'bottomLeft|left|down':
      return [DIR_LEFT, DIR_DOWN, DIR_LEFT, DIR_UP];
    case 'bottomLeft|left|left':
      return [DIR_LEFT, DIR_DOWN, DIR_RIGHT];
    case 'bottomLeft|left|right':
      return [DIR_LEFT, DIR_DOWN, DIR_LEFT];
    case 'bottomLeft|left|horizontal':
      return [DIR_LEFT, DIR_DOWN, DIR_LEFT];
    case 'bottomLeft|left|vertical':
      return [DIR_LEFT, DIR_DOWN];
    case 'bottomLeft|right|up':
      return [DIR_RIGHT, DIR_DOWN, DIR_LEFT, DIR_DOWN];
    case 'bottomLeft|right|down':
      return [DIR_RIGHT, DIR_DOWN, DIR_LEFT, DIR_UP];
    case 'bottomLeft|right|left':
      return [DIR_RIGHT, DIR_DOWN, DIR_RIGHT];
    case 'bottomLeft|right|right':
      return [DIR_RIGHT, DIR_DOWN, DIR_LEFT];
    case 'bottomLeft|right|horizontal':
      return [DIR_RIGHT, DIR_DOWN, DIR_LEFT];
    case 'bottomLeft|right|vertical':
      return [DIR_RIGHT, DIR_DOWN, DIR_LEFT, DIR_DOWN];
    case 'bottomLeft|horizontal|up':
      return [DIR_LEFT, DIR_DOWN];
    case 'bottomLeft|horizontal|down':
      return [DIR_LEFT, DIR_DOWN, DIR_LEFT, DIR_UP];
    case 'bottomLeft|horizontal|left':
      return [DIR_LEFT, DIR_DOWN, DIR_RIGHT];
    case 'bottomLeft|horizontal|right':
      return [DIR_LEFT, DIR_DOWN, DIR_LEFT];
    case 'bottomLeft|horizontal|horizontal':
      return [DIR_LEFT, DIR_DOWN, DIR_LEFT];
    case 'bottomLeft|horizontal|vertical':
      return [DIR_LEFT, DIR_DOWN];
    case 'bottomLeft|vertical|up':
      return [DIR_DOWN, DIR_LEFT, DIR_DOWN];
    case 'bottomLeft|vertical|down':
      return [DIR_DOWN, DIR_LEFT, DIR_UP];
    case 'bottomLeft|vertical|left':
      return [DIR_DOWN, DIR_LEFT, DIR_DOWN, DIR_RIGHT];
    case 'bottomLeft|vertical|right':
      return [DIR_DOWN, DIR_LEFT];
    case 'bottomLeft|vertical|horizontal':
      return [DIR_DOWN, DIR_LEFT];
    case 'bottomLeft|vertical|vertical':
      return [DIR_DOWN, DIR_LEFT, DIR_DOWN];
    default:
      return [DIR_RIGHT, DIR_DOWN, DIR_LEFT];
  }
}

function buildWorldGraph(fromPoint, toPoint) {
  const step = directionalPreferenceStubLength;
  const xValues = getUniqueNumbers([
    fromPoint.x - step * 2,
    fromPoint.x - step,
    fromPoint.x,
    fromPoint.x + step,
    fromPoint.x + step * 2,
    toPoint.x - step * 2,
    toPoint.x - step,
    toPoint.x,
    toPoint.x + step,
    toPoint.x + step * 2,
  ]);
  const yValues = getUniqueNumbers([
    fromPoint.y - step * 2,
    fromPoint.y - step,
    fromPoint.y,
    fromPoint.y + step,
    fromPoint.y + step * 2,
    toPoint.y - step * 2,
    toPoint.y - step,
    toPoint.y,
    toPoint.y + step,
    toPoint.y + step * 2,
  ]);
  const nodes = [];
  const indexByKey = new Map();
  const indexByGrid = new Map();

  yValues.forEach((y, yIndex) => {
    xValues.forEach((x, xIndex) => {
      const nodeIndex = nodes.length;
      nodes.push({ x, y, xIndex, yIndex });
      indexByKey.set(`${x}|${y}`, nodeIndex);
      indexByGrid.set(`${xIndex}|${yIndex}`, nodeIndex);
    });
  });

  const startIndex = indexByKey.get(`${fromPoint.x}|${fromPoint.y}`);
  const endIndex = indexByKey.get(`${toPoint.x}|${toPoint.y}`);
  return { nodes, xValues, yValues, indexByGrid, startIndex, endIndex };
}

function getGraphNeighbors(graph, nodeIndex) {
  const node = graph.nodes[nodeIndex];
  const neighbors = [];
  const deltas = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];

  deltas.forEach((delta) => {
    const neighborGridKey = `${node.xIndex + delta.x}|${node.yIndex + delta.y}`;
    const neighborIndex = graph.indexByGrid.get(neighborGridKey);
    if (typeof neighborIndex !== 'number') return;
    const neighborNode = graph.nodes[neighborIndex];
    const direction = getSegmentDirection(node, neighborNode);
    if (!direction) return;
    neighbors.push({
      neighborIndex,
      direction,
      length: getManhattanDistance(node, neighborNode),
    });
  });

  return neighbors;
}

function rebuildPathPointsFromState(finalState, statesByKey, graph) {
  const nodeIndices = [];
  let currentState = finalState;
  while (currentState) {
    nodeIndices.push(currentState.nodeIndex);
    currentState = currentState.parentStateKey
      ? statesByKey.get(currentState.parentStateKey) ?? null
      : null;
  }
  nodeIndices.reverse();
  return nodeIndices.map((nodeIndex) => {
    const node = graph.nodes[nodeIndex];
    return { x: node.x, y: node.y };
  });
}

function findPathByDirectionPlan(graph, directionPlan) {
  if (!directionPlan?.length) return null;
  const startState = {
    stateKey: `${graph.startIndex}|0|0`,
    nodeIndex: graph.startIndex,
    directionIndex: 0,
    hasMovedInCurrentDirection: false,
    distance: 0,
    parentStateKey: null,
  };
  const statesByKey = new Map([[startState.stateKey, startState]]);
  const openStateKeys = [startState.stateKey];

  while (openStateKeys.length > 0) {
    const stateKey = openStateKeys.shift();
    const currentState = stateKey ? statesByKey.get(stateKey) : null;
    if (!currentState) continue;

    const isAtEnd =
      currentState.nodeIndex === graph.endIndex &&
      currentState.directionIndex === directionPlan.length - 1 &&
      currentState.hasMovedInCurrentDirection;
    if (isAtEnd) {
      return {
        points: rebuildPathPointsFromState(currentState, statesByKey, graph),
        score: {
          bendCount: directionPlan.length - 1,
          distance: currentState.distance,
        },
      };
    }

    if (
      currentState.hasMovedInCurrentDirection &&
      currentState.directionIndex < directionPlan.length - 1
    ) {
      const nextDirectionIndex = currentState.directionIndex + 1;
      const switchStateKey = `${currentState.nodeIndex}|${nextDirectionIndex}|0`;
      const switchState = {
        stateKey: switchStateKey,
        nodeIndex: currentState.nodeIndex,
        directionIndex: nextDirectionIndex,
        hasMovedInCurrentDirection: false,
        distance: currentState.distance,
        parentStateKey: stateKey,
      };
      const existingSwitchState = statesByKey.get(switchStateKey);
      if (!existingSwitchState || switchState.distance < existingSwitchState.distance) {
        statesByKey.set(switchStateKey, switchState);
        openStateKeys.push(switchStateKey);
      }
    }

    const requiredDirection = directionPlan[currentState.directionIndex];
    const neighbors = getGraphNeighbors(graph, currentState.nodeIndex);
    neighbors.forEach((neighbor) => {
      if (neighbor.direction !== requiredDirection) return;
      const nextDistance = currentState.distance + neighbor.length;
      const nextStateKey = `${neighbor.neighborIndex}|${currentState.directionIndex}|1`;
      const nextState = {
        stateKey: nextStateKey,
        nodeIndex: neighbor.neighborIndex,
        directionIndex: currentState.directionIndex,
        hasMovedInCurrentDirection: true,
        distance: nextDistance,
        parentStateKey: stateKey,
      };
      const existingNextState = statesByKey.get(nextStateKey);
      if (!existingNextState || nextDistance < existingNextState.distance) {
        statesByKey.set(nextStateKey, nextState);
        openStateKeys.push(nextStateKey);
      }
    });
  }

  return null;
}

function compressPathPoints(points) {
  if (points.length <= 2) return points;
  const compressed = [points[0]];
  for (let index = 1; index < points.length - 1; index += 1) {
    const pointA = compressed[compressed.length - 1];
    const pointB = points[index];
    const pointC = points[index + 1];
    const isVertical = pointA.x === pointB.x && pointB.x === pointC.x;
    const isHorizontal = pointA.y === pointB.y && pointB.y === pointC.y;
    if (!isVertical && !isHorizontal) {
      compressed.push(pointB);
    }
  }
  compressed.push(points[points.length - 1]);
  return compressed;
}

function buildOrthogonalFallbackPoints(fromPoint, toPoint, directionPlan) {
  if (fromPoint.x === toPoint.x || fromPoint.y === toPoint.y) {
    return [fromPoint, toPoint];
  }

  const firstDirection = directionPlan?.[0] ?? null;
  const step = directionalPreferenceStubLength;
  const points = [fromPoint];

  if (firstDirection === DIR_UP || firstDirection === DIR_DOWN) {
    const pivotY = fromPoint.y + (firstDirection === DIR_DOWN ? step : -step);
    points.push({ x: fromPoint.x, y: pivotY });
    points.push({ x: toPoint.x, y: pivotY });
    points.push(toPoint);
    return compressPathPoints(points);
  }

  if (firstDirection === DIR_LEFT || firstDirection === DIR_RIGHT) {
    const pivotX = fromPoint.x + (firstDirection === DIR_RIGHT ? step : -step);
    points.push({ x: pivotX, y: fromPoint.y });
    points.push({ x: pivotX, y: toPoint.y });
    points.push(toPoint);
    return compressPathPoints(points);
  }

  points.push({ x: toPoint.x, y: fromPoint.y });
  points.push(toPoint);
  return compressPathPoints(points);
}

function chooseBestOrthogonalPath(fromPoint, toPoint, startPreference, endPreference) {
  if (fromPoint.x === toPoint.x && fromPoint.y === toPoint.y) {
    return {
      points: [fromPoint, toPoint],
      caseKey: 'samePoint',
      directionPlan: [],
    };
  }

  const graph = buildWorldGraph(fromPoint, toPoint);
  const positionKey = getRelativePositionKey(fromPoint, toPoint);
  const normalizedStartPreference = normalizePreferenceForCase(startPreference, fromPoint, toPoint);
  const normalizedEndPreference = normalizePreferenceForCase(endPreference, toPoint, fromPoint);
  const caseKey = `${positionKey}|${normalizedStartPreference}|${normalizedEndPreference}`;
  const directionPlan = getDirectionPlanByCaseKey(caseKey);

  let finalResult = findPathByDirectionPlan(graph, directionPlan);

  if (!finalResult) {
    return {
      points: buildOrthogonalFallbackPoints(fromPoint, toPoint, directionPlan),
      caseKey,
      directionPlan,
    };
  }
  return {
    points: compressPathPoints(finalResult.points),
    caseKey,
    directionPlan,
  };
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
    const routingResult = chooseBestOrthogonalPath(
      fromPoint,
      toPoint,
      startEmissionDirection,
      endEmissionDirection
    );
    const orthogonalPoints = routingResult.points;
    const pathParts = orthogonalPoints.map((point, pointIndex) =>
      pointIndex === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`
    );
    const debugLabelPosition = {
      x: fromPoint.x + 6,
      y: fromPoint.y - 6,
    };
    return {
      index,
      path: pathParts.join(' '),
      debugCaseKey: routingResult.caseKey,
      debugDirectionPlan: routingResult.directionPlan,
      debugLabelPosition,
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
