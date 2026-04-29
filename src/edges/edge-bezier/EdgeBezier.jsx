import { createContext, memo, useCallback, useContext, useMemo, useState } from 'react';
import { Menu } from '@wwf971/react-comp-misc';
import { BaseEdge, getBezierPath } from 'reactflow';
import './EdgeBezier.css';
import { getEdgeSwitcherMenuOptions, invokeEdgeTypeSwitch } from '../edge-switcher/EdgeSwitcherUtils.js';
import { useExtraData } from '../../storeMobx';

export const EdgeBezierMenuContext = createContext(null);
const controlPointHitTolerance = 10;

export function createDefaultEditableBezierEdgeData() {
  return { controlPoints: [] };
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
      : { x: (currentPoint.x + nextPoint.x) / 2, y: (currentPoint.y + nextPoint.y) / 2 };
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
  return { sourceX, sourceY, targetX, targetY, length, tangentX, tangentY, normalX, normalY };
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
  return { t, offsetT, offsetN: projectedNormal };
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

  return { t: 0.5, offsetT: 0, offsetN: 0 };
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

const EditableBezierEdge = memo(function EditableBezierEdge({
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
  const edgeMenu = useContext(EdgeBezierMenuContext);
  const edgeFrame = useMemo(
    () => getEdgeFrame(sourceX, sourceY, targetX, targetY),
    [sourceX, sourceY, targetX, targetY]
  );
  const controlPoints = edgeExtraData?.controlPoints ?? [];
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
  const isEdgeSelected = selectedTarget?.edgeId === id && selectedTarget?.controlPointIndex === null;

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

  const handleControlPointPointerDown = useCallback(
    (event, controlPointIndex) => {
      if (event.button !== 0) return;
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
      if ((event.buttons & 1) !== 1) return;
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

  const handleEdgeClick = useCallback(
    (event) => {
      if (event.button !== 0) return;
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

export const editableBezierEdgeTypes = {
  editableBezier: EditableBezierEdge,
};

export function useEditableBezierEdgeInteractions({ edges, setEdges, getExtraData, setExtraData }) {
  const [menuState, setMenuState] = useState(null);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [isControlPointDragging, setIsControlPointDragging] = useState(false);
  const isMenuOpen = menuState !== null;

  const openMenu = useCallback((nextMenuState) => setMenuState(nextMenuState), []);
  const closeMenu = useCallback(() => setMenuState(null), []);
  const selectEdge = useCallback((edgeId) => setSelectedTarget({ edgeId, controlPointIndex: null }), []);
  const selectControlPoint = useCallback(
    (edgeId, controlPointIndex) => setSelectedTarget({ edgeId, controlPointIndex }),
    []
  );
  const clearSelection = useCallback(() => setSelectedTarget(null), []);
  const startControlPointDrag = useCallback(() => setIsControlPointDragging(true), []);
  const endControlPointDrag = useCallback(() => setIsControlPointDragging(false), []);

  const menuItems = useMemo(() => {
    if (!menuState) return [];
    const selectedEdgeExtraData = getExtraData?.('edge', menuState.edgeId);
    const items = [{ type: 'item', name: 'create control point', action: 'create-control-point' }];
    if (typeof menuState.controlPointIndex === 'number') {
      items.push({ type: 'item', name: 'remove control point', action: 'remove-control-point' });
    }
    const switchOptions = getEdgeSwitcherMenuOptions(selectedEdgeExtraData);
    if (switchOptions.length > 0) {
      items.push({
        type: 'menu',
        name: 'switch edge type',
        children: switchOptions.map((option) => ({
          type: 'item',
          name: option.label,
          action: 'switch-edge-type',
          data: { nextEdgeType: option.value },
        })),
      });
    }
    return items;
  }, [getExtraData, menuState]);

  const handleMenuItemClick = useCallback(
    (item) => {
      if (!menuState) return;
      if (item.action === 'create-control-point' && menuState.controlPointRelative) {
        setEdges((existingEdges) =>
          existingEdges.map((edge) => {
            if (edge.id !== menuState.edgeId) return edge;
            const edgeExtraData = getExtraData?.('edge', edge.id) ?? {};
            const controlPoints = edgeExtraData?.controlPoints ?? [];
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
            setExtraData?.('edge', edge.id, (existingExtraData) => ({
              ...existingExtraData,
              controlPoints: nextControlPoints,
            }));
            return edge;
          })
        );
      }
      if (item.action === 'remove-control-point' && typeof menuState.controlPointIndex === 'number') {
        setEdges((existingEdges) =>
          existingEdges.map((edge) => {
            if (edge.id !== menuState.edgeId) return edge;
            const edgeExtraData = getExtraData?.('edge', edge.id) ?? {};
            const controlPoints = edgeExtraData?.controlPoints ?? [];
            setExtraData?.('edge', edge.id, (existingExtraData) => ({
              ...existingExtraData,
              controlPoints: controlPoints.filter((_, index) => index !== menuState.controlPointIndex),
            }));
            return edge;
          })
        );
      }
      if (item.action === 'switch-edge-type') {
        const selectedEdgeExtraData = getExtraData?.('edge', menuState.edgeId);
        invokeEdgeTypeSwitch(selectedEdgeExtraData, {
          edgeId: menuState.edgeId,
          fromEdgeType: selectedEdgeExtraData?.edgeSwitcher?.ownEdgeType,
          toEdgeType: item.data?.nextEdgeType,
        });
      }
    },
    [edges, getExtraData, menuState, setEdges, setExtraData]
  );

  const updateControlPoint = useCallback(
    (edgeId, controlPointIndex, controlPointRelative) => {
      setEdges((existingEdges) =>
        existingEdges.map((edge) => {
          if (edge.id !== edgeId) return edge;
          const edgeExtraData = getExtraData?.('edge', edge.id) ?? {};
          const controlPoints = edgeExtraData?.controlPoints ?? [];
          const nextControlPoints = controlPoints.map((point, index) =>
            index === controlPointIndex ? controlPointRelative : point
          );
          setExtraData?.('edge', edge.id, (existingExtraData) => ({
            ...existingExtraData,
            controlPoints: nextControlPoints,
          }));
          return edge;
        })
      );
    },
    [getExtraData, setEdges, setExtraData]
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

  const menuOverlay = isMenuOpen ? (
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
  ) : null;

  return {
    edgeMenuContextValue,
    isControlPointDragging,
    handlePaneClick,
    handleNodeClick,
    menuOverlay,
  };
}
