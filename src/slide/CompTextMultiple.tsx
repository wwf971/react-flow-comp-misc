import { useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { useSlideStore } from './contentStore';

const CompTextMultiple = observer(
  ({ data, containerId, compId, requestContainerMoveByPoint }: any) => {
  const store = useSlideStore();
  const textareaRef = useRef(null);
  const dragStateRef = useRef<any>(null);
  const textValue = data?.text ?? '';
  const isSelected = store.selectedContainerId === containerId;
  const isEditing = store.isCompEditing(compId);

  const requestFit = () => {
    const element = textareaRef.current;
    if (!element) return;
    const prevHeight = element.style.height;
    const prevOverflowY = element.style.overflowY;
    element.style.height = '0px';
    element.style.overflowY = 'hidden';
    const measuredPixelY = Math.ceil(element.scrollHeight) + 2;
    element.style.height = prevHeight;
    element.style.overflowY = prevOverflowY;

    const currentContainerSize = store.getContainerSize(containerId);
    const initialPixelX = data?.initialPixelSize?.pixelX ?? 0;
    const initialPixelY = data?.initialPixelSize?.pixelY ?? 0;
    store.requestContainerFitToPixelSize(containerId, {
      pixelX: Math.max(currentContainerSize.pixelX, initialPixelX),
      pixelY: Math.max(measuredPixelY, initialPixelY),
    });
  };

  useEffect(() => {
    requestFit();
  }, [textValue]);

  useEffect(() => {
    if (!isSelected && isEditing) {
      store.clearEditingComp();
    }
  }, [isSelected, isEditing, store]);

  useEffect(() => {
    if (!isEditing) return;
    const element = textareaRef.current;
    if (!element) return;
    element.focus();
  }, [isEditing]);

  useEffect(() => {
    return () => {
      const dragState = dragStateRef.current;
      if (!dragState) return;
      if (dragState.onPointerMove) {
        window.removeEventListener('pointermove', dragState.onPointerMove);
      }
      if (dragState.onPointerUp) {
        window.removeEventListener('pointerup', dragState.onPointerUp);
      }
    };
  }, []);

  return (
    <div className="slide-text-root">
      {isEditing ? (
        <textarea
          ref={textareaRef}
          className="slide-textarea"
          value={textValue}
          onChange={(event) => {
            store.requestContainerCompDataUpdate(containerId, {
              text: event.target.value,
            });
          }}
        />
      ) : (
        <div
          className="slide-text-view"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            const startX = event.clientX;
            const startY = event.clientY;
            const onPointerMove = (nextEvent) => {
              const deltaX = nextEvent.clientX - startX;
              const deltaY = nextEvent.clientY - startY;
              const isDragStart = Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3;
              if (!isDragStart) return;
              if (dragStateRef.current?.isStarted) return;
              dragStateRef.current.isStarted = true;
              if (!requestContainerMoveByPoint) return;
              requestContainerMoveByPoint({ x: startX, y: startY });
            };
            const onPointerUp = () => {
              window.removeEventListener('pointermove', onPointerMove);
              window.removeEventListener('pointerup', onPointerUp);
              dragStateRef.current = null;
            };
            dragStateRef.current = { isStarted: false, onPointerMove, onPointerUp };
            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);
          }}
          onDoubleClick={() => {
            store.setSelectedContainer(containerId);
            if (compId) {
              store.setEditingComp(compId);
            } else {
              store.clearEditingComp();
            }
          }}
        >
          {textValue}
        </div>
      )}
    </div>
  );
  },
);

export default CompTextMultiple;
