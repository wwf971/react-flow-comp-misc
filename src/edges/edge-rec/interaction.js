import { createElement, useCallback, useMemo, useState } from 'react';
import { CheckIcon, MenuComp } from '@wwf971/react-comp-misc';
import { getEdgeSwitcherMenuOptions, invokeEdgeTypeSwitch } from '../edge-switcher/EdgeSwitcherUtils.js';

const directionOptions = [
  { value: 'right', label: 'right' },
  { value: 'left', label: 'left' },
  { value: 'down', label: 'down' },
  { value: 'up', label: 'up' },
  { value: 'horizontal', label: 'horizontal' },
  { value: 'vertical', label: 'vertical' },
  { value: null, label: 'auto' },
];

function MenuOptionLabel({ label, isChecked }) {
  return createElement(
    'div',
    { className: 'rec-edge-menu-item' },
    createElement(
      'span',
      { className: 'rec-edge-menu-icon-wrap' },
      isChecked ? createElement(CheckIcon, { width: 12, height: 12 }) : null
    ),
    createElement('span', { className: 'rec-edge-menu-text' }, label)
  );
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

export function normalizeDirectionPreferences(directionPreferences, controlPointCount) {
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

function setControlPointSideDirection(directionPreferences, controlPointIndex, side, direction) {
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

export function useEditableRecEdgeInteractions({
  edges,
  setEdges,
  getExtraData,
  setExtraData,
  maxControlPointCount = 2,
}) {
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

  const selectEdge = useCallback((edgeId) => {
    setSelectedTarget({ edgeId, controlPointIndex: null, segmentIndex: 0 });
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

  const menuItems = useMemo(() => {
    if (!menuState) return [];
    const selectedEdge = edges.find((edge) => edge.id === menuState.edgeId);
    const selectedEdgeExtraData = getExtraData?.('edge', menuState.edgeId) ?? selectedEdge?.data ?? {};
    const selectedControlPoints = selectedEdgeExtraData?.controlPoints ?? [];
    const selectedDirectionPreferences = normalizeDirectionPreferences(
      selectedEdgeExtraData?.directionPreferences,
      selectedControlPoints.length
    );
    const isDebugInfoVisible = selectedEdgeExtraData?.isDebugInfoVisible !== false;
    const isCreateEnabled =
      menuState.menuTargetType === 'segment' &&
      !!menuState.controlPointRelative &&
      (menuState.controlPointCount ?? 0) < maxControlPointCount;
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
    items.push({
      type: 'item',
      name: 'show debug info',
      action: 'toggle-debug-info',
      component: MenuOptionLabel,
      componentProps: {
        label: 'show debug info',
        isChecked: isDebugInfoVisible,
      },
    });
    return items;
  }, [edges, getExtraData, maxControlPointCount, menuState]);

  const handleMenuItemClick = useCallback(
    (item) => {
      if (!menuState) return;
      if (item.action === 'create-control-point' && menuState.controlPointRelative) {
        setEdges((existingEdges) =>
          existingEdges.map((edge) => {
            if (edge.id !== menuState.edgeId) return edge;
            const edgeExtraData = getExtraData?.('edge', edge.id) ?? {};
            const controlPoints = edgeExtraData?.controlPoints ?? [];
            if (controlPoints.length >= maxControlPointCount) return edge;
            const directionPreferences = normalizeDirectionPreferences(
              edgeExtraData?.directionPreferences,
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
            setExtraData?.('edge', edge.id, (existingExtraData) => ({
              ...existingExtraData,
              controlPoints: nextControlPoints,
              directionPreferences: nextDirectionPreferences,
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
            const directionPreferences = normalizeDirectionPreferences(
              edgeExtraData?.directionPreferences,
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
            setExtraData?.('edge', edge.id, (existingExtraData) => ({
              ...existingExtraData,
              controlPoints: controlPoints.filter((_, index) => index !== removeIndex),
              directionPreferences: nextDirectionPreferences,
            }));
            return edge;
          })
        );
      }

      if (item.action === 'set-side-direction') {
        setEdges((existingEdges) =>
          existingEdges.map((edge) => {
            if (edge.id !== menuState.edgeId) return edge;
            const edgeExtraData = getExtraData?.('edge', edge.id) ?? {};
            const controlPoints = edgeExtraData?.controlPoints ?? [];
            const directionPreferences = normalizeDirectionPreferences(
              edgeExtraData?.directionPreferences,
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
            setExtraData?.('edge', edge.id, (existingExtraData) => ({
              ...existingExtraData,
              directionPreferences: nextDirectionPreferences,
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
      if (item.action === 'toggle-debug-info') {
        setExtraData?.('edge', menuState.edgeId, (existingExtraData) => ({
          ...existingExtraData,
          isDebugInfoVisible: existingExtraData?.isDebugInfoVisible === false,
        }));
      }
    },
    [edges, getExtraData, maxControlPointCount, menuState, setEdges, setExtraData]
  );

  const updateControlPoint = useCallback(
    (edgeId, controlPointIndex, controlPointRelative) => {
      setEdges((existingEdges) =>
        existingEdges.map((edge) => {
          if (edge.id !== edgeId) return edge;
          const edgeExtraData = getExtraData?.('edge', edge.id) ?? {};
          const controlPoints = edgeExtraData?.controlPoints ?? [];
          const nextControlPoints = controlPoints.map((point, index) => {
            return index === controlPointIndex ? controlPointRelative : point;
          });
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
      selectSegment,
      selectControlPoint,
      startControlPointDrag,
      endControlPointDrag,
    }),
    [
      endControlPointDrag,
      openMenu,
      selectEdge,
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

  const menuOverlay = isMenuOpen
    ? createElement(MenuComp, {
        items: menuItems,
        position: menuState.position,
        onClose: closeMenu,
        onItemClick: handleMenuItemClick,
        onContextMenu: (event) => {
          event.preventDefault();
          closeMenu();
        },
      })
    : null;

  return {
    edgeMenuContextValue,
    isControlPointDragging,
    handlePaneClick,
    handleNodeClick,
    menuOverlay,
  };
}
