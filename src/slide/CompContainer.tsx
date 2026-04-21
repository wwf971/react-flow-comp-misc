import { useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import DragIcon from '@wwf971/react-comp-misc/DragIcon';
import { useSlideStore } from './contentStore';

const HANDLE_DIRS = [
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
  'nw',
];

const MIN_RATIO_SIZE = 0.03;

const clamp = (value, min, max) => {
  return Math.min(max, Math.max(min, value));
};

const normalizeRect = (rect) => {
  const width = clamp(rect.width, MIN_RATIO_SIZE, 1);
  const height = clamp(rect.height, MIN_RATIO_SIZE, 1);
  const left = clamp(rect.left, 0, 1 - width);
  const top = clamp(rect.top, 0, 1 - height);
  return { left, top, width, height };
};

const toRectFromContainer = (containerData) => {
  return {
    left: containerData.pos.x,
    top: containerData.pos.y,
    width: containerData.size.x,
    height: containerData.size.y,
  };
};

const fromRectToContainer = (rect) => {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
};

const applyAspectByDirection = (startRect, rect, dir) => {
  const aspectRatio = startRect.width / startRect.height;
  if (!aspectRatio || !Number.isFinite(aspectRatio)) return rect;

  let left = rect.left;
  let top = rect.top;
  let width = rect.width;
  let height = rect.height;

  const hasN = dir.includes('n');
  const hasS = dir.includes('s');
  const hasE = dir.includes('e');
  const hasW = dir.includes('w');
  const isCorner = (hasN || hasS) && (hasE || hasW);
  const centerX = startRect.left + startRect.width / 2;
  const centerY = startRect.top + startRect.height / 2;

  if (isCorner) {
    if (width / height > aspectRatio) {
      width = height * aspectRatio;
    } else {
      height = width / aspectRatio;
    }

    if (hasW) {
      left = startRect.left + startRect.width - width;
    } else {
      left = startRect.left;
    }

    if (hasN) {
      top = startRect.top + startRect.height - height;
    } else {
      top = startRect.top;
    }
    return { left, top, width, height };
  }

  if (hasE || hasW) {
    height = width / aspectRatio;
    top = centerY - height / 2;
    if (hasW) {
      left = startRect.left + startRect.width - width;
    } else {
      left = startRect.left;
    }
    return { left, top, width, height };
  }

  if (hasN || hasS) {
    width = height * aspectRatio;
    left = centerX - width / 2;
    if (hasN) {
      top = startRect.top + startRect.height - height;
    } else {
      top = startRect.top;
    }
    return { left, top, width, height };
  }

  return { left, top, width, height };
};

const resolveCursorClass = (dir) => {
  if (dir === 'n' || dir === 's') return 'cursor-ns';
  if (dir === 'e' || dir === 'w') return 'cursor-ew';
  if (dir === 'ne' || dir === 'sw') return 'cursor-nesw';
  return 'cursor-nwse';
};

const CompContainer = observer(({ containerId, getComp }: any) => {
  const store = useSlideStore();
  const containerData = store.getContainerData(containerId);
  const isSelected = store.selectedContainerId === containerId;
  const [isHovering, setIsHovering] = useState(false);
  const interactionRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const resizeObserver = new ResizeObserver((entries) => {
      const nextRect = entries[0]?.contentRect;
      if (!nextRect) return;
      store.setContainerPixelSize(containerId, {
        pixelX: Math.round(nextRect.width),
        pixelY: Math.round(nextRect.height),
      });
    });
    resizeObserver.observe(element);
    return () => {
      resizeObserver.disconnect();
    };
  }, [containerId, store]);

  useEffect(() => {
    return () => {
      const active = interactionRef.current;
      if (!active) return;
      window.removeEventListener('pointermove', active.onPointerMove);
      window.removeEventListener('pointerup', active.onPointerUp);
      document.body.style.userSelect = '';
    };
  }, []);

  const startInteraction = (startPointer, mode, dir) => {
    if (!containerData) return;
    store.setSelectedContainer(containerId);

    const startRect = toRectFromContainer(containerData);
    const pageElement = containerRef.current?.parentElement;
    const pageRect = pageElement?.getBoundingClientRect();
    const safeWidth = Math.max(pageRect?.width || 0, 1);
    const safeHeight = Math.max(pageRect?.height || 0, 1);

    const onPointerMove = (nextEvent) => {
      nextEvent.preventDefault();

      const deltaX = (nextEvent.clientX - startPointer.x) / safeWidth;
      const deltaY = (nextEvent.clientY - startPointer.y) / safeHeight;
      let nextRect = { ...startRect };

      if (mode === 'move') {
        nextRect.left = startRect.left + deltaX;
        nextRect.top = startRect.top + deltaY;
      } else {
        const hasN = dir.includes('n');
        const hasS = dir.includes('s');
        const hasE = dir.includes('e');
        const hasW = dir.includes('w');

        let left = startRect.left;
        let top = startRect.top;
        let right = startRect.left + startRect.width;
        let bottom = startRect.top + startRect.height;

        if (hasW) left = startRect.left + deltaX;
        if (hasE) right = startRect.left + startRect.width + deltaX;
        if (hasN) top = startRect.top + deltaY;
        if (hasS) bottom = startRect.top + startRect.height + deltaY;

        const width = right - left;
        const height = bottom - top;
        nextRect = {
          left,
          top,
          width,
          height,
        };

        if (nextEvent.shiftKey) {
          nextRect = applyAspectByDirection(startRect, nextRect, dir);
        }
      }

      const safeRect = normalizeRect(nextRect);
      store.requestContainerRectUpdate(containerId, fromRectToContainer(safeRect));
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      interactionRef.current = null;
      document.body.style.userSelect = '';
    };

    interactionRef.current = { onPointerMove, onPointerUp };
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const beginInteraction = (event, mode, dir) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    startInteraction({ x: event.clientX, y: event.clientY }, mode, dir);
  };

  const Comp = useMemo(() => {
    if (!containerData) return null;
    const compData = store.getCompData(containerData.compId);
    if (!compData) return null;
    return getComp(compData.compName);
  }, [containerData, getComp, store]);

  if (!containerData || !Comp) return null;
  const compData = store.getCompData(containerData.compId);
  if (!compData) return null;

  const containerStyle = {
    left: `${containerData.pos.x * 100}%`,
    top: `${containerData.pos.y * 100}%`,
    width: `${containerData.size.x * 100}%`,
    height: `${containerData.size.y * 100}%`,
  };

  const requestContainerMoveByPointer = (event) => {
    beginInteraction(event, 'move', '');
  };

  const requestContainerMoveByPoint = (point) => {
    if (!point) return;
    startInteraction({ x: point.x, y: point.y }, 'move', '');
  };

  return (
    <div
      ref={containerRef}
      className={`slide-comp-wrap ${isSelected ? 'is-selected' : ''}`}
      style={containerStyle}
      onPointerDown={(event) => {
        event.stopPropagation();
        store.setSelectedContainer(containerId);
      }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <div className={`slide-comp-toolbar ${isHovering || isSelected ? 'is-visible' : ''}`}>
        <button
          className="slide-comp-drag-btn"
          onPointerDown={(event) => beginInteraction(event, 'move', '')}
          type="button"
        >
          <DragIcon size={12} />
        </button>
      </div>

      <div className="slide-comp-content">
        <Comp
          data={compData.compData}
          containerId={containerId}
          compId={compData.id}
          requestContainerMoveByPointer={requestContainerMoveByPointer}
          requestContainerMoveByPoint={requestContainerMoveByPoint}
        />
      </div>

      {isSelected &&
        HANDLE_DIRS.map((dir) => (
          <button
            key={dir}
            className={`slide-comp-handle handle-${dir} ${resolveCursorClass(dir)}`}
            type="button"
            onPointerDown={(event) => beginInteraction(event, 'resize', dir)}
          />
        ))}
    </div>
  );
});

export default CompContainer;
