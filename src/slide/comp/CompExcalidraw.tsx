import { useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { useSlideStore } from '../contentStore';

const CompExcalidraw = observer(({ data, containerId, isReadOnly }: any) => {
  const store = useSlideStore();
  const containerSize = store.getContainerSize(containerId);
  const isPlayMode = store.getIsPlayMode();
  const [initialData, setInitialData] = useState<any>(null);
  const [errorText, setErrorText] = useState('');
  const [isEditEnabled, setIsEditEnabled] = useState(true);
  const [isPanEnabled, setIsPanEnabled] = useState(true);
  const [isZoomEnabled, setIsZoomEnabled] = useState(true);
  const saveTimerRef = useRef<any>(null);
  const lastSceneSnapshotRef = useRef('');
  const excalidrawApiRef = useRef<any>(null);
  const prevContainerSizeRef = useRef<any>(null);
  const lockedViewportRef = useRef<any>(null);
  const isApplyingLockedViewportRef = useRef(false);
  const prevIsPlayModeRef = useRef(false);
  const sceneResourceId = data?.sceneResourceId ?? '';
  const sceneVersion = data?.sceneVersion ?? 1;

  const lockViewportToCurrent = () => {
    const api = excalidrawApiRef.current;
    if (!api) return;
    const appState = api.getAppState();
    lockedViewportRef.current = {
      zoomValue: appState?.zoom?.value ?? 1,
      scrollX: appState?.scrollX ?? 0,
      scrollY: appState?.scrollY ?? 0,
    };
  };

  const defaultSceneData = useMemo(() => {
    return {
      elements: [],
      appState: {
        viewBackgroundColor: '#ffffff',
        collaborators: new Map(),
      },
      files: {},
      sceneVersion,
    };
  }, [sceneVersion]);

  const normalizeSceneData = (value) => {
    const scene = value && typeof value === 'object' ? { ...value } : {};
    const appStateRaw = scene.appState && typeof scene.appState === 'object' ? scene.appState : {};
    let collaborators = appStateRaw.collaborators;
    if (!(collaborators instanceof Map)) {
      if (Array.isArray(collaborators)) {
        collaborators = new Map(collaborators);
      } else if (collaborators && typeof collaborators === 'object') {
        collaborators = new Map(Object.entries(collaborators));
      } else {
        collaborators = new Map();
      }
    }
    return {
      elements: Array.isArray(scene.elements) ? scene.elements : [],
      files: scene.files && typeof scene.files === 'object' ? scene.files : {},
      appState: {
        viewBackgroundColor: '#ffffff',
        ...appStateRaw,
        collaborators,
      },
      sceneVersion,
    };
  };

  const toPersistSceneData = (value) => {
    const normalized = normalizeSceneData(value);
    return {
      elements: normalized.elements,
      files: normalized.files,
      appState: {
        viewBackgroundColor: normalized.appState?.viewBackgroundColor ?? '#ffffff',
      },
      sceneVersion,
    };
  };

  useEffect(() => {
    let isCancelled = false;
    const ensureResourceAndLoad = async () => {
      let nextResourceId = sceneResourceId;
      if (!nextResourceId && !isReadOnly) {
        const createResult = await store.requestCreateTextResource();
        if (!createResult?.ok || !createResult.resourceId) {
          if (!isCancelled) setErrorText('Failed to allocate scene resource');
          return;
        }
        nextResourceId = createResult.resourceId;
        store.requestContainerCompDataUpdate(containerId, {
          sceneResourceId: nextResourceId,
          sceneVersion: 1,
        });
      }
      if (!nextResourceId) {
        if (!isCancelled) {
          const defaultData = normalizeSceneData(defaultSceneData);
          setInitialData(defaultData);
          lastSceneSnapshotRef.current = JSON.stringify(toPersistSceneData(defaultData));
        }
        return;
      }
      const loadResult = await store.requestGetResourceText(nextResourceId);
      if (!loadResult?.ok) {
        if (!isCancelled) {
          const defaultData = normalizeSceneData(defaultSceneData);
          setInitialData(defaultData);
          lastSceneSnapshotRef.current = JSON.stringify(toPersistSceneData(defaultData));
          setErrorText('Failed to load scene resource');
        }
        return;
      }
      const text = `${loadResult.text ?? ''}`.trim();
      if (!text) {
        if (!isCancelled) {
          const defaultData = normalizeSceneData(defaultSceneData);
          setInitialData(defaultData);
          lastSceneSnapshotRef.current = JSON.stringify(toPersistSceneData(defaultData));
          setErrorText('');
        }
        return;
      }
      try {
        const parsed = JSON.parse(text);
        if (!isCancelled) {
          const normalizedScene = normalizeSceneData(parsed);
          setInitialData(normalizedScene);
          lastSceneSnapshotRef.current = JSON.stringify(toPersistSceneData(normalizedScene));
          setErrorText('');
        }
      } catch {
        if (!isCancelled) {
          const defaultData = normalizeSceneData(defaultSceneData);
          setInitialData(defaultData);
          lastSceneSnapshotRef.current = JSON.stringify(toPersistSceneData(defaultData));
          setErrorText('Scene data is invalid');
        }
      }
    };
    ensureResourceAndLoad();
    return () => {
      isCancelled = true;
    };
  }, [sceneResourceId, isReadOnly, store, containerId, defaultSceneData]);

  useEffect(() => {
    return () => {
      if (!saveTimerRef.current) return;
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const isPlayModeEntered = isPlayMode && !prevIsPlayModeRef.current;
    prevIsPlayModeRef.current = isPlayMode;
    if (!isPlayModeEntered) return;
    lockViewportToCurrent();
    setIsEditEnabled(false);
    setIsPanEnabled(false);
    setIsZoomEnabled(false);
  }, [isPlayMode]);

  useEffect(() => {
    const api = excalidrawApiRef.current;
    if (!api) return;
    if (isPanEnabled && isZoomEnabled) {
      lockedViewportRef.current = null;
      return;
    }
    const appState = api.getAppState();
    lockedViewportRef.current = {
      zoomValue: appState?.zoom?.value ?? 1,
      scrollX: appState?.scrollX ?? 0,
      scrollY: appState?.scrollY ?? 0,
    };
  }, [isPanEnabled, isZoomEnabled, initialData, containerId]);

  useEffect(() => {
    const api = excalidrawApiRef.current;
    if (!api) return;
    const nextPixelX = containerSize.pixelX;
    const nextPixelY = containerSize.pixelY;
    if (nextPixelX <= 0 || nextPixelY <= 0) return;

    const prevSize = prevContainerSizeRef.current;
    if (!prevSize) {
      prevContainerSizeRef.current = { pixelX: nextPixelX, pixelY: nextPixelY };
      return;
    }
    if (prevSize.pixelX <= 0 || prevSize.pixelY <= 0) {
      prevContainerSizeRef.current = { pixelX: nextPixelX, pixelY: nextPixelY };
      return;
    }
    if (prevSize.pixelX === nextPixelX && prevSize.pixelY === nextPixelY) return;

    const ratioX = nextPixelX / prevSize.pixelX;
    const ratioY = nextPixelY / prevSize.pixelY;
    const resizeScale = Math.min(ratioX, ratioY);
    if (!Number.isFinite(resizeScale) || resizeScale <= 0) {
      prevContainerSizeRef.current = { pixelX: nextPixelX, pixelY: nextPixelY };
      return;
    }

    const appState = api.getAppState();
    const currentZoom = appState?.zoom?.value ?? 1;
    const nextZoom = Math.max(0.1, Math.min(8, currentZoom * resizeScale));
    const currentScrollX = appState?.scrollX ?? 0;
    const currentScrollY = appState?.scrollY ?? 0;
    const nextScrollX = currentScrollX * resizeScale;
    const nextScrollY = currentScrollY * resizeScale;
    if (!isPanEnabled || !isZoomEnabled) {
      lockedViewportRef.current = {
        zoomValue: nextZoom,
        scrollX: nextScrollX,
        scrollY: nextScrollY,
      };
    }
    isApplyingLockedViewportRef.current = true;
    api.updateScene({
      appState: {
        zoom: { value: nextZoom },
        scrollX: nextScrollX,
        scrollY: nextScrollY,
      },
    });
    requestAnimationFrame(() => {
      isApplyingLockedViewportRef.current = false;
    });
    prevContainerSizeRef.current = { pixelX: nextPixelX, pixelY: nextPixelY };
  }, [containerSize.pixelX, containerSize.pixelY, isPanEnabled, isZoomEnabled]);

  const queueSaveScene = (sceneData) => {
    if (!sceneResourceId) return;
    if (isReadOnly) return;
    const stableSceneData = toPersistSceneData(sceneData);
    const nextSnapshot = JSON.stringify(stableSceneData);
    if (nextSnapshot === lastSceneSnapshotRef.current) return;
    lastSceneSnapshotRef.current = nextSnapshot;
    store.markCompDirtyByContainerId(containerId, 'updated');
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(async () => {
      const saveResult = await store.requestSetResourceText(
        sceneResourceId,
        nextSnapshot,
      );
      if (!saveResult?.ok) {
        setErrorText('Failed to save scene resource');
        return;
      }
      setErrorText('');
    }, 350);
  };

  if (!initialData) {
    return <div className="slide-excalidraw-loading">Loading whiteboard...</div>;
  }

  return (
    <div
      className="slide-excalidraw-root"
      onContextMenuCapture={(event) => {
        event.stopPropagation();
      }}
    >
      <Excalidraw
        initialData={initialData}
        viewModeEnabled={isReadOnly || !isEditEnabled}
        excalidrawAPI={(api) => {
          excalidrawApiRef.current = api;
          prevContainerSizeRef.current =
            containerSize.pixelX > 0 && containerSize.pixelY > 0
              ? { pixelX: containerSize.pixelX, pixelY: containerSize.pixelY }
              : null;
        }}
        onChange={(elements, appState, files) => {
          if (
            (!isPanEnabled || !isZoomEnabled) &&
            lockedViewportRef.current &&
            !isApplyingLockedViewportRef.current
          ) {
            const lockedViewport = lockedViewportRef.current;
            const nextZoomValue = appState?.zoom?.value ?? 1;
            const nextScrollX = appState?.scrollX ?? 0;
            const nextScrollY = appState?.scrollY ?? 0;
            const hasViewportChange =
              (!isZoomEnabled &&
                Math.abs(nextZoomValue - lockedViewport.zoomValue) > 0.0001) ||
              (!isPanEnabled && Math.abs(nextScrollX - lockedViewport.scrollX) > 0.1) ||
              (!isPanEnabled && Math.abs(nextScrollY - lockedViewport.scrollY) > 0.1);
            if (hasViewportChange && excalidrawApiRef.current) {
              isApplyingLockedViewportRef.current = true;
              const targetZoomValue = isZoomEnabled ? nextZoomValue : lockedViewport.zoomValue;
              const targetScrollX = isPanEnabled ? nextScrollX : lockedViewport.scrollX;
              const targetScrollY = isPanEnabled ? nextScrollY : lockedViewport.scrollY;
              excalidrawApiRef.current.updateScene({
                appState: {
                  zoom: { value: targetZoomValue },
                  scrollX: targetScrollX,
                  scrollY: targetScrollY,
                },
              });
              requestAnimationFrame(() => {
                isApplyingLockedViewportRef.current = false;
              });
            }
          }
          if (isReadOnly) return;
          queueSaveScene({
            elements,
            appState,
            files,
            sceneVersion,
          });
        }}
      />
      {isPanEnabled || isZoomEnabled ? null : (
        <div
          className="slide-excalidraw-pan-blocker"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onPointerMove={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onPointerUp={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        />
      )}
      <div
        className="slide-excalidraw-lock-panel"
        onWheelCapture={(event) => {
          if (isZoomEnabled) return;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <button
          className={`slide-excalidraw-mode-btn ${isEditEnabled ? 'is-play' : ''}`}
          type="button"
          disabled={isReadOnly}
          onClick={() => {
            setIsEditEnabled((isPrevEnabled) => !isPrevEnabled);
          }}
        >
          Edit
        </button>
        <button
          className={`slide-excalidraw-mode-btn ${isPanEnabled ? 'is-play' : ''}`}
          type="button"
          disabled={isReadOnly}
          onClick={() => {
            setIsPanEnabled((isPrevEnabled) => {
              const isNextEnabled = !isPrevEnabled;
              if (!isNextEnabled) {
                lockViewportToCurrent();
              }
              return isNextEnabled;
            });
          }}
        >
          Pan
        </button>
        <button
          className={`slide-excalidraw-mode-btn ${isZoomEnabled ? 'is-play' : ''}`}
          type="button"
          disabled={isReadOnly}
          onClick={() => {
            setIsZoomEnabled((isPrevEnabled) => {
              const isNextEnabled = !isPrevEnabled;
              if (!isNextEnabled) {
                lockViewportToCurrent();
              }
              return isNextEnabled;
            });
          }}
        >
          Zoom
        </button>
      </div>
      {errorText ? <div className="slide-excalidraw-error">{errorText}</div> : null}
    </div>
  );
});

export default CompExcalidraw;
