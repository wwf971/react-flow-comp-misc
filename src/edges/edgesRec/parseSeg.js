function getManhattanDistance(fromPoint, toPoint) {
  return Math.abs(fromPoint.x - toPoint.x) + Math.abs(fromPoint.y - toPoint.y);
}

function getPolylineCenterPoint(points) {
  if (!points?.length) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];

  let totalLength = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    totalLength += getManhattanDistance(points[index], points[index + 1]);
  }

  if (totalLength <= 0) {
    return points[Math.floor(points.length / 2)];
  }

  const halfLength = totalLength / 2;
  let traversed = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const fromPoint = points[index];
    const toPoint = points[index + 1];
    const segmentLength = getManhattanDistance(fromPoint, toPoint);
    if (traversed + segmentLength < halfLength) {
      traversed += segmentLength;
      continue;
    }

    if (segmentLength <= 0) return fromPoint;
    const remainingLength = halfLength - traversed;
    const ratio = remainingLength / segmentLength;
    return {
      x: fromPoint.x + (toPoint.x - fromPoint.x) * ratio,
      y: fromPoint.y + (toPoint.y - fromPoint.y) * ratio,
    };
  }

  return points[points.length - 1];
}

function getUniqueNumbers(values) {
  return [...new Set(values)].sort((a, b) => a - b);
}

export function getSegmentDirection(fromPoint, toPoint, directions) {
  if (fromPoint.x === toPoint.x) {
    if (toPoint.y > fromPoint.y) return directions.down;
    if (toPoint.y < fromPoint.y) return directions.up;
    return null;
  }
  if (fromPoint.y === toPoint.y) {
    if (toPoint.x > fromPoint.x) return directions.right;
    if (toPoint.x < fromPoint.x) return directions.left;
  }
  return null;
}

export function normalizePreferenceForCase(preference, fromPoint, toPoint) {
  if (
    preference === 'horizontal' ||
    preference === 'vertical' ||
    preference === 'up' ||
    preference === 'down' ||
    preference === 'left' ||
    preference === 'right'
  ) {
    return preference;
  }
  const deltaX = toPoint.x - fromPoint.x;
  const deltaY = toPoint.y - fromPoint.y;
  return Math.abs(deltaX) >= Math.abs(deltaY) ? 'horizontal' : 'vertical';
}

export function getRelativePositionKey(fromPoint, toPoint) {
  const isOnRight = toPoint.x >= fromPoint.x;
  const isOnBottom = toPoint.y >= fromPoint.y;
  if (isOnRight && isOnBottom) return 'bottomRight';
  if (!isOnRight && isOnBottom) return 'bottomLeft';
  if (isOnRight && !isOnBottom) return 'topRight';
  return 'topLeft';
}

export function buildWorldGraph(fromPoint, toPoint, options = {}) {
  const step = typeof options.stubLength === 'number' ? options.stubLength : 24;
  const minimumEndpointLegLength =
    typeof options.minimumEndpointLegLength === 'number' ? options.minimumEndpointLegLength : 0;
  const offsetValues = [step, step * 2];
  if (minimumEndpointLegLength > 0) {
    offsetValues.push(minimumEndpointLegLength);
  }
  const getAxisValues = (fromValue, toValue) => {
    const values = [fromValue, toValue];
    offsetValues.forEach((offset) => {
      values.push(fromValue - offset);
      values.push(fromValue + offset);
      values.push(toValue - offset);
      values.push(toValue + offset);
    });
    return getUniqueNumbers(values);
  };
  const xValues = getAxisValues(fromPoint.x, toPoint.x);
  const yValues = getAxisValues(fromPoint.y, toPoint.y);
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
  return { nodes, indexByGrid, startIndex, endIndex };
}

function getGraphNeighbors(graph, nodeIndex, getSegmentDirectionFn, directions) {
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
    const direction = getSegmentDirectionFn(node, neighborNode, directions);
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

export function findPathByDirectionPlan(graph, directionPlan, options = {}) {
  if (!directionPlan?.length) return null;
  const getSegmentDirectionFn = options.getSegmentDirection;
  const directions = options.directions;
  if (!getSegmentDirectionFn || !directions) return null;
  const getDistanceKeyPart = (distance) => Number(distance).toFixed(3);
  const getFirstLegKeyPart = (distance) =>
    typeof distance === 'number' ? getDistanceKeyPart(distance) : 'na';
  const minimumStartLegLength =
    typeof options.minimumStartLegLength === 'number' ? options.minimumStartLegLength : 0;
  const minimumEndLegLength =
    typeof options.minimumEndLegLength === 'number' ? options.minimumEndLegLength : 0;
  const isStartLegMinimumEnabled = minimumStartLegLength > 0 && directionPlan.length >= 2;
  const isEndLegMinimumEnabled = minimumEndLegLength > 0 && directionPlan.length >= 2;
  const getLegExtraLength = (distance, minimumLength) =>
    Math.max(0, (typeof distance === 'number' ? distance : 0) - minimumLength);
  const compareFinalState = (stateA, stateB) => {
    const firstExtraA = isStartLegMinimumEnabled
      ? getLegExtraLength(stateA.firstDirectionMovedDistance, minimumStartLegLength)
      : 0;
    const firstExtraB = isStartLegMinimumEnabled
      ? getLegExtraLength(stateB.firstDirectionMovedDistance, minimumStartLegLength)
      : 0;
    if (firstExtraA !== firstExtraB) return firstExtraA - firstExtraB;
    const lastExtraA = isEndLegMinimumEnabled
      ? getLegExtraLength(stateA.movedDistanceInCurrentDirection, minimumEndLegLength)
      : 0;
    const lastExtraB = isEndLegMinimumEnabled
      ? getLegExtraLength(stateB.movedDistanceInCurrentDirection, minimumEndLegLength)
      : 0;
    if (lastExtraA !== lastExtraB) return lastExtraA - lastExtraB;
    return stateA.distance - stateB.distance;
  };
  const startState = {
    stateKey: `${graph.startIndex}|0|0|${getDistanceKeyPart(0)}|${getFirstLegKeyPart(null)}`,
    nodeIndex: graph.startIndex,
    directionIndex: 0,
    hasMovedInCurrentDirection: false,
    movedDistanceInCurrentDirection: 0,
    firstDirectionMovedDistance: null,
    distance: 0,
    parentStateKey: null,
  };
  const statesByKey = new Map([[startState.stateKey, startState]]);
  const openStateKeys = [startState.stateKey];
  let bestFinalState = null;

  while (openStateKeys.length > 0) {
    const stateKey = openStateKeys.shift();
    const currentState = stateKey ? statesByKey.get(stateKey) : null;
    if (!currentState) continue;

    const isAtEnd =
      currentState.nodeIndex === graph.endIndex &&
      currentState.directionIndex === directionPlan.length - 1 &&
      currentState.hasMovedInCurrentDirection &&
      (!isEndLegMinimumEnabled || currentState.movedDistanceInCurrentDirection >= minimumEndLegLength);
    if (isAtEnd) {
      if (!bestFinalState || compareFinalState(currentState, bestFinalState) < 0) {
        bestFinalState = currentState;
      }
      continue;
    }

    if (
      currentState.hasMovedInCurrentDirection &&
      currentState.directionIndex < directionPlan.length - 1
    ) {
      const isSwitchingOutOfFirstDirection = currentState.directionIndex === 0;
      const isFirstDirectionLongEnough =
        !isStartLegMinimumEnabled ||
        !isSwitchingOutOfFirstDirection ||
        currentState.movedDistanceInCurrentDirection >= minimumStartLegLength;
      if (!isFirstDirectionLongEnough) {
        continue;
      }
      const nextDirectionIndex = currentState.directionIndex + 1;
      const nextFirstDirectionMovedDistance =
        currentState.directionIndex === 0
          ? currentState.movedDistanceInCurrentDirection
          : currentState.firstDirectionMovedDistance;
      const switchStateKey = `${currentState.nodeIndex}|${nextDirectionIndex}|0|${getDistanceKeyPart(
        0
      )}|${getFirstLegKeyPart(nextFirstDirectionMovedDistance)}`;
      const switchState = {
        stateKey: switchStateKey,
        nodeIndex: currentState.nodeIndex,
        directionIndex: nextDirectionIndex,
        hasMovedInCurrentDirection: false,
        movedDistanceInCurrentDirection: 0,
        firstDirectionMovedDistance: nextFirstDirectionMovedDistance,
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
    const neighbors = getGraphNeighbors(graph, currentState.nodeIndex, getSegmentDirectionFn, directions);
    neighbors.forEach((neighbor) => {
      if (neighbor.direction !== requiredDirection) return;
      const nextDistance = currentState.distance + neighbor.length;
      const nextMovedDistance = currentState.movedDistanceInCurrentDirection + neighbor.length;
      const nextStateKey = `${neighbor.neighborIndex}|${currentState.directionIndex}|1|${getDistanceKeyPart(
        nextMovedDistance
      )}|${getFirstLegKeyPart(currentState.firstDirectionMovedDistance)}`;
      const nextState = {
        stateKey: nextStateKey,
        nodeIndex: neighbor.neighborIndex,
        directionIndex: currentState.directionIndex,
        hasMovedInCurrentDirection: true,
        movedDistanceInCurrentDirection: nextMovedDistance,
        firstDirectionMovedDistance: currentState.firstDirectionMovedDistance,
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

  if (bestFinalState) {
    return {
      points: rebuildPathPointsFromState(bestFinalState, statesByKey, graph),
      score: {
        bendCount: directionPlan.length - 1,
        distance: bestFinalState.distance,
      },
    };
  }
  return null;
}

export function balanceOuterLegsForABAPattern({
  points,
  directionPlan,
  getSegmentDirection,
  directions,
}) {
  if (directionPlan?.length !== 3 || points.length !== 4) return points;
  const [firstDirection, middleDirection, lastDirection] = directionPlan;
  if (firstDirection !== lastDirection || firstDirection === middleDirection) return points;
  const [startPoint, firstTurnPoint, secondTurnPoint, endPoint] = points;
  const firstSegmentDirection = getSegmentDirection(startPoint, firstTurnPoint, directions);
  const middleSegmentDirection = getSegmentDirection(firstTurnPoint, secondTurnPoint, directions);
  const lastSegmentDirection = getSegmentDirection(secondTurnPoint, endPoint, directions);
  if (
    firstSegmentDirection !== firstDirection ||
    middleSegmentDirection !== middleDirection ||
    lastSegmentDirection !== lastDirection
  ) {
    return points;
  }

  if (firstDirection === directions.up || firstDirection === directions.down) {
    const deltaY = endPoint.y - startPoint.y;
    const isDirectionCompatible =
      (firstDirection === directions.down && deltaY > 0) ||
      (firstDirection === directions.up && deltaY < 0);
    if (!isDirectionCompatible) return points;
    const sharedY = startPoint.y + deltaY / 2;
    return [
      startPoint,
      { x: firstTurnPoint.x, y: sharedY },
      { x: secondTurnPoint.x, y: sharedY },
      endPoint,
    ];
  }

  const deltaX = endPoint.x - startPoint.x;
  const isDirectionCompatible =
    (firstDirection === directions.right && deltaX > 0) ||
    (firstDirection === directions.left && deltaX < 0);
  if (!isDirectionCompatible) return points;
  const sharedX = startPoint.x + deltaX / 2;
  return [
    startPoint,
    { x: sharedX, y: firstTurnPoint.y },
    { x: sharedX, y: secondTurnPoint.y },
    endPoint,
  ];
}

function isOppositeDirection(directionA, directionB, directions) {
  return (
    (directionA === directions.up && directionB === directions.down) ||
    (directionA === directions.down && directionB === directions.up) ||
    (directionA === directions.left && directionB === directions.right) ||
    (directionA === directions.right && directionB === directions.left)
  );
}

export function balanceOuterLegsForABArevBPattern({
  points,
  directionPlan,
  minimumEndpointLegLength,
  getSegmentDirection,
  directions,
}) {
  if (directionPlan?.length !== 4 || points.length !== 5) return points;
  const [directionA, directionB, directionC, directionB2] = directionPlan;
  if (directionB !== directionB2) return points;
  if (!isOppositeDirection(directionA, directionC, directions)) return points;
  const requiredLength =
    typeof minimumEndpointLegLength === 'number' ? minimumEndpointLegLength : 0;
  if (requiredLength <= 0) return points;

  const [point0, point1, point2, point3, point4] = points;
  const segmentDirections = [
    getSegmentDirection(point0, point1, directions),
    getSegmentDirection(point1, point2, directions),
    getSegmentDirection(point2, point3, directions),
    getSegmentDirection(point3, point4, directions),
  ];
  if (
    segmentDirections[0] !== directionA ||
    segmentDirections[1] !== directionB ||
    segmentDirections[2] !== directionC ||
    segmentDirections[3] !== directionB2
  ) {
    return points;
  }

  if (directionA === directions.left || directionA === directions.right) {
    const deltaSign = directionA === directions.right ? 1 : -1;
    const pinnedStartX = point0.x + deltaSign * requiredLength;
    const sharedY = point0.y + (point4.y - point0.y) / 2;
    const nextPoints = [
      point0,
      { x: pinnedStartX, y: point0.y },
      { x: pinnedStartX, y: sharedY },
      { x: point4.x, y: sharedY },
      point4,
    ];
    const nextFirstDirection = getSegmentDirection(nextPoints[0], nextPoints[1], directions);
    const nextSecondDirection = getSegmentDirection(nextPoints[1], nextPoints[2], directions);
    const nextThirdDirection = getSegmentDirection(nextPoints[2], nextPoints[3], directions);
    const nextFourthDirection = getSegmentDirection(nextPoints[3], nextPoints[4], directions);
    if (
      nextFirstDirection !== directionA ||
      nextSecondDirection !== directionB ||
      nextThirdDirection !== directionC ||
      nextFourthDirection !== directionB2
    ) {
      return points;
    }
    return nextPoints;
  }

  const deltaSign = directionA === directions.down ? 1 : -1;
  const pinnedStartY = point0.y + deltaSign * requiredLength;
  const sharedX = point0.x + (point4.x - point0.x) / 2;
  const nextPoints = [
    point0,
    { x: point0.x, y: pinnedStartY },
    { x: sharedX, y: pinnedStartY },
    { x: sharedX, y: point4.y },
    point4,
  ];
  const nextFirstDirection = getSegmentDirection(nextPoints[0], nextPoints[1], directions);
  const nextSecondDirection = getSegmentDirection(nextPoints[1], nextPoints[2], directions);
  const nextThirdDirection = getSegmentDirection(nextPoints[2], nextPoints[3], directions);
  const nextFourthDirection = getSegmentDirection(nextPoints[3], nextPoints[4], directions);
  if (
    nextFirstDirection !== directionA ||
    nextSecondDirection !== directionB ||
    nextThirdDirection !== directionC ||
    nextFourthDirection !== directionB2
  ) {
    return points;
  }
  return nextPoints;
}

export function balanceOuterLegsForABArevPattern({
  points,
  directionPlan,
  minimumEndpointLegLength,
  getSegmentDirection,
  directions,
}) {
  if (directionPlan?.length !== 3 || points.length !== 4) return points;
  const [directionA, directionB, directionAReversed] = directionPlan;
  if (!isOppositeDirection(directionA, directionAReversed, directions)) return points;
  const requiredLength =
    typeof minimumEndpointLegLength === 'number' ? minimumEndpointLegLength : 0;
  if (requiredLength <= 0) return points;

  const [point0, point1, point2, point3] = points;
  const segmentDirections = [
    getSegmentDirection(point0, point1, directions),
    getSegmentDirection(point1, point2, directions),
    getSegmentDirection(point2, point3, directions),
  ];
  if (
    segmentDirections[0] !== directionA ||
    segmentDirections[1] !== directionB ||
    segmentDirections[2] !== directionAReversed
  ) {
    return points;
  }

  if (directionA === directions.left || directionA === directions.right) {
    const directionASign = directionA === directions.right ? 1 : -1;
    const projectedDeltaOnAAxis = (point3.x - point0.x) * directionASign;
    const isEndOnASide = projectedDeltaOnAAxis > 0;
    const pinnedStartX = point0.x + directionASign * requiredLength;
    const pinnedEndX = point3.x + directionASign * requiredLength;
    const pivotX = isEndOnASide ? pinnedEndX : pinnedStartX;
    const nextPoints = [
      point0,
      { x: pivotX, y: point0.y },
      { x: pivotX, y: point3.y },
      point3,
    ];
    const nextFirstDirection = getSegmentDirection(nextPoints[0], nextPoints[1], directions);
    const nextSecondDirection = getSegmentDirection(nextPoints[1], nextPoints[2], directions);
    const nextThirdDirection = getSegmentDirection(nextPoints[2], nextPoints[3], directions);
    if (
      nextFirstDirection !== directionA ||
      nextSecondDirection !== directionB ||
      nextThirdDirection !== directionAReversed
    ) {
      return points;
    }
    return nextPoints;
  }

  const directionASign = directionA === directions.down ? 1 : -1;
  const projectedDeltaOnAAxis = (point3.y - point0.y) * directionASign;
  const isEndOnASide = projectedDeltaOnAAxis > 0;
  const pinnedStartY = point0.y + directionASign * requiredLength;
  const pinnedEndY = point3.y + directionASign * requiredLength;
  const pivotY = isEndOnASide ? pinnedEndY : pinnedStartY;
  const nextPoints = [
    point0,
    { x: point0.x, y: pivotY },
    { x: point3.x, y: pivotY },
    point3,
  ];
  const nextFirstDirection = getSegmentDirection(nextPoints[0], nextPoints[1], directions);
  const nextSecondDirection = getSegmentDirection(nextPoints[1], nextPoints[2], directions);
  const nextThirdDirection = getSegmentDirection(nextPoints[2], nextPoints[3], directions);
  if (
    nextFirstDirection !== directionA ||
    nextSecondDirection !== directionB ||
    nextThirdDirection !== directionAReversed
  ) {
    return points;
  }
  return nextPoints;
}

export function balanceOuterLegsForABArevBAPattern({
  points,
  directionPlan,
  minimumEndpointLegLength,
  getSegmentDirection,
  directions,
}) {
  if (directionPlan?.length !== 5 || points.length !== 6) return points;
  const [directionA, directionB, directionC, directionB2, directionA2] = directionPlan;
  if (directionA !== directionA2) return points;
  if (directionB !== directionB2) return points;
  if (!isOppositeDirection(directionA, directionC, directions)) return points;
  const requiredLength =
    typeof minimumEndpointLegLength === 'number' ? minimumEndpointLegLength : 0;
  if (requiredLength <= 0) return points;

  const [point0, point1, point2, point3, point4, point5] = points;
  const segmentDirections = [
    getSegmentDirection(point0, point1, directions),
    getSegmentDirection(point1, point2, directions),
    getSegmentDirection(point2, point3, directions),
    getSegmentDirection(point3, point4, directions),
    getSegmentDirection(point4, point5, directions),
  ];
  if (
    segmentDirections[0] !== directionA ||
    segmentDirections[1] !== directionB ||
    segmentDirections[2] !== directionC ||
    segmentDirections[3] !== directionB2 ||
    segmentDirections[4] !== directionA2
  ) {
    return points;
  }

  if (directionA === directions.up || directionA === directions.down) {
    const deltaSign = directionA === directions.down ? 1 : -1;
    const pinnedStartY = point0.y + deltaSign * requiredLength;
    const pinnedEndY = point5.y - deltaSign * requiredLength;
    const sharedX = point0.x + (point5.x - point0.x) / 2;
    const nextPoints = [
      point0,
      { x: point0.x, y: pinnedStartY },
      { x: sharedX, y: pinnedStartY },
      { x: sharedX, y: pinnedEndY },
      { x: point5.x, y: pinnedEndY },
      point5,
    ];
    const nextMiddleDirection = getSegmentDirection(nextPoints[2], nextPoints[3], directions);
    if (nextMiddleDirection !== directionC) return points;
    return nextPoints;
  }

  const deltaSign = directionA === directions.right ? 1 : -1;
  const pinnedStartX = point0.x + deltaSign * requiredLength;
  const pinnedEndX = point5.x - deltaSign * requiredLength;
  const sharedY = point0.y + (point5.y - point0.y) / 2;
  const nextPoints = [
    point0,
    { x: pinnedStartX, y: point0.y },
    { x: pinnedStartX, y: sharedY },
    { x: pinnedEndX, y: sharedY },
    { x: pinnedEndX, y: point5.y },
    point5,
  ];
  const nextMiddleDirection = getSegmentDirection(nextPoints[2], nextPoints[3], directions);
  if (nextMiddleDirection !== directionC) return points;
  return nextPoints;
}

export function compressPathPoints(points) {
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

export function buildOrthogonalFallbackPoints({
  fromPoint,
  toPoint,
  directionPlan,
  directions,
  stubLength,
}) {
  if (fromPoint.x === toPoint.x || fromPoint.y === toPoint.y) {
    return [fromPoint, toPoint];
  }

  const firstDirection = directionPlan?.[0] ?? null;
  const points = [fromPoint];

  if (firstDirection === directions.up || firstDirection === directions.down) {
    const pivotY = fromPoint.y + (firstDirection === directions.down ? stubLength : -stubLength);
    points.push({ x: fromPoint.x, y: pivotY });
    points.push({ x: toPoint.x, y: pivotY });
    points.push(toPoint);
    return compressPathPoints(points);
  }

  if (firstDirection === directions.left || firstDirection === directions.right) {
    const pivotX = fromPoint.x + (firstDirection === directions.right ? stubLength : -stubLength);
    points.push({ x: pivotX, y: fromPoint.y });
    points.push({ x: pivotX, y: toPoint.y });
    points.push(toPoint);
    return compressPathPoints(points);
  }

  points.push({ x: toPoint.x, y: fromPoint.y });
  points.push(toPoint);
  return compressPathPoints(points);
}

export function chooseBestOrthogonalPath({
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
  directions,
  stubLength,
}) {
  if (fromPoint.x === toPoint.x && fromPoint.y === toPoint.y) {
    return {
      points: [fromPoint, toPoint],
      caseKey: 'samePoint',
      directionPlan: [],
    };
  }

  const graph = buildWorldGraph(fromPoint, toPoint, {
    minimumEndpointLegLength,
    stubLength,
  });
  const positionKey = getRelativePositionKey(fromPoint, toPoint);
  const normalizedStartPreference = normalizePreferenceForCase(startPreference, fromPoint, toPoint);
  const normalizedEndPreference = normalizePreferenceForCase(endPreference, toPoint, fromPoint);
  const caseKey = `${positionKey}|${normalizedStartPreference}|${normalizedEndPreference}`;
  const directionPlan = getDirectionPlanByCaseKey(caseKey);
  const isABAPattern =
    directionPlan?.length === 3 &&
    directionPlan[0] === directionPlan[2] &&
    directionPlan[0] !== directionPlan[1];
  const isABArevPattern =
    directionPlan?.length === 3 &&
    isOppositeDirection(directionPlan[0], directionPlan[2], directions);
  const isABArevBPattern =
    directionPlan?.length === 4 &&
    directionPlan[1] === directionPlan[3] &&
    isOppositeDirection(directionPlan[0], directionPlan[2], directions);
  const routeAttempts = [
    {
      minimumStartLegLength: minimumEndpointLegLength,
      minimumEndLegLength: minimumEndpointLegLength,
    },
    {
      minimumStartLegLength: 0,
      minimumEndLegLength: minimumEndpointLegLength,
    },
    {
      minimumStartLegLength: minimumEndpointLegLength,
      minimumEndLegLength: 0,
    },
    {
      minimumStartLegLength: 0,
      minimumEndLegLength: 0,
    },
  ];
  const attemptsToRun = isABAPattern || isABArevPattern || isABArevBPattern
    ? [{ minimumStartLegLength: 0, minimumEndLegLength: 0 }]
    : routeAttempts;
  let finalResult = null;
  attemptsToRun.some((attempt) => {
    finalResult = findPathByDirectionPlan(graph, directionPlan, {
      ...attempt,
      getSegmentDirection,
      directions,
    });
    return Boolean(finalResult);
  });

  const basePoints = finalResult
    ? finalResult.points
    : buildOrthogonalFallbackPoints({
        fromPoint,
        toPoint,
        directionPlan,
        directions,
        stubLength,
      });
  const compressedPoints = compressPathPoints(basePoints);
  if (isABArevPattern) {
    return {
      points: balanceOuterLegsForABArevPattern({
        points: compressedPoints,
        directionPlan,
        minimumEndpointLegLength,
        getSegmentDirection,
        directions,
      }),
      caseKey,
      directionPlan,
    };
  }
  if (isABArevBPattern) {
    return {
      points: balanceOuterLegsForABArevBPattern({
        points: compressedPoints,
        directionPlan,
        minimumEndpointLegLength,
        getSegmentDirection,
        directions,
      }),
      caseKey,
      directionPlan,
    };
  }
  const pointsWithABArevBABalancedLegs = balanceOuterLegsForABArevBAPattern({
    points: compressedPoints,
    directionPlan,
    minimumEndpointLegLength,
    getSegmentDirection,
    directions,
  });
  const pointsWithABArevBBalancedLegs = balanceOuterLegsForABArevBPattern({
    points: pointsWithABArevBABalancedLegs,
    directionPlan,
    minimumEndpointLegLength,
    getSegmentDirection,
    directions,
  });
  return {
    points: balanceOuterLegsForABAPattern({
      points: pointsWithABArevBBalancedLegs,
      directionPlan,
      getSegmentDirection,
      directions,
    }),
    caseKey,
    directionPlan,
  };
}

export function buildRecEditableSegments({
  sourceX,
  sourceY,
  targetX,
  targetY,
  controlPoints,
  directionPreferences,
  minimumEndpointLegLength,
  resolveSegmentPreferences,
  chooseBestOrthogonalPath,
}) {
  const pathPoints = [{ x: sourceX, y: sourceY }, ...(controlPoints ?? []), { x: targetX, y: targetY }];

  return pathPoints.slice(0, -1).map((fromPoint, index) => {
    const toPoint = pathPoints[index + 1];
    const { startEmissionDirection, endEmissionDirection } = resolveSegmentPreferences(
      index,
      directionPreferences
    );
    const routingResult = chooseBestOrthogonalPath({
      fromPoint,
      toPoint,
      startPreference: startEmissionDirection,
      endPreference: endEmissionDirection,
      minimumEndpointLegLength,
    });
    const orthogonalPoints = routingResult.points;
    const pathParts = orthogonalPoints.map((point, pointIndex) =>
      pointIndex === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`
    );
    const centerPoint = getPolylineCenterPoint(orthogonalPoints);
    const debugLabelPosition = { x: centerPoint.x + 6, y: centerPoint.y - 6 };
    return {
      index,
      path: pathParts.join(' '),
      debugCaseKey: routingResult.caseKey,
      debugDirectionPlan: routingResult.directionPlan,
      debugLabelPosition,
    };
  });
}
