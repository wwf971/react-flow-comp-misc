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
  const viewportResizeBaseRef = useRef<any>(null);
  const initialViewportMetaRef = useRef<any>(null);
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

  const setViewportResizeBase = (nextViewport = null) => {
    const api = excalidrawApiRef.current;
    if (!api) return;
    const nextPixelX = Number(containerSize?.pixelX ?? 0);
    const nextPixelY = Number(containerSize?.pixelY ?? 0);
    if (nextPixelX <= 0 || nextPixelY <= 0) return;
    const appState = api.getAppState();
    const nextZoomValue = Number(nextViewport?.zoomValue ?? appState?.zoom?.value ?? 1);
    const nextScrollX = Number(nextViewport?.scrollX ?? appState?.scrollX ?? 0);
    const nextScrollY = Number(nextViewport?.scrollY ?? appState?.scrollY ?? 0);
    if (!Number.isFinite(nextZoomValue)) return;
    if (!Number.isFinite(nextScrollX)) return;
    if (!Number.isFinite(nextScrollY)) return;
    viewportResizeBaseRef.current = {
      zoomValue: nextZoomValue,
      scrollX: nextScrollX,
      scrollY: nextScrollY,
      pixelX: nextPixelX,
      pixelY: nextPixelY,
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
    const viewportMetaRaw =
      scene.viewportMeta && typeof scene.viewportMeta === 'object' ? scene.viewportMeta : {};
    const viewportPixelX = Number(viewportMetaRaw.pixelX);
    const viewportPixelY = Number(viewportMetaRaw.pixelY);
    const viewportMeta =
      Number.isFinite(viewportPixelX) &&
      viewportPixelX > 0 &&
      Number.isFinite(viewportPixelY) &&
      viewportPixelY > 0
        ? {
            pixelX: viewportPixelX,
            pixelY: viewportPixelY,
          }
        : null;
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
      viewportMeta,
      sceneVersion,
    };
  };

  const toPersistSceneData = (value) => {
    const normalized = normalizeSceneData(value);
    const zoomValue = Number(normalized.appState?.zoom?.value);
    const scrollX = Number(normalized.appState?.scrollX);
    const scrollY = Number(normalized.appState?.scrollY);
    const viewportBasePixelX = Number(
      viewportResizeBaseRef.current?.pixelX ?? containerSize?.pixelX ?? 0,
    );
    const viewportBasePixelY = Number(
      viewportResizeBaseRef.current?.pixelY ?? containerSize?.pixelY ?? 0,
    );
    return {
      elements: normalized.elements,
      files: normalized.files,
      appState: {
        viewBackgroundColor: normalized.appState?.viewBackgroundColor ?? '#ffffff',
        ...(Number.isFinite(zoomValue) ? { zoom: { value: zoomValue } } : {}),
        ...(Number.isFinite(scrollX) ? { scrollX } : {}),
        ...(Number.isFinite(scrollY) ? { scrollY } : {}),
      },
      ...(Number.isFinite(viewportBasePixelX) &&
      viewportBasePixelX > 0 &&
      Number.isFinite(viewportBasePixelY) &&
      viewportBasePixelY > 0
        ? {
            viewportMeta: {
              pixelX: viewportBasePixelX,
              pixelY: viewportBasePixelY,
            },
          }
        : {}),
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
          initialViewportMetaRef.current = defaultData.viewportMeta;
          setInitialData(defaultData);
          lastSceneSnapshotRef.current = JSON.stringify(toPersistSceneData(defaultData));
        }
        return;
      }
      const loadResult = await store.requestGetResourceText(nextResourceId);
      if (!loadResult?.ok) {
        if (!isCancelled) {
          const defaultData = normalizeSceneData(defaultSceneData);
          initialViewportMetaRef.current = defaultData.viewportMeta;
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
          initialViewportMetaRef.current = defaultData.viewportMeta;
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
          initialViewportMetaRef.current = normalizedScene.viewportMeta;
          setInitialData(normalizedScene);
          lastSceneSnapshotRef.current = JSON.stringify(toPersistSceneData(normalizedScene));
          setErrorText('');
        }
      } catch {
        if (!isCancelled) {
          const defaultData = normalizeSceneData(defaultSceneData);
          initialViewportMetaRef.current = defaultData.viewportMeta;
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
    viewportResizeBaseRef.current = null;
    initialViewportMetaRef.current = null;
  }, [containerId, sceneResourceId]);

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
    const resizeBase = viewportResizeBaseRef.current;
    if (!resizeBase) {
      setViewportResizeBase();
      return;
    }
    if (resizeBase.pixelX <= 0 || resizeBase.pixelY <= 0) {
      setViewportResizeBase();
      return;
    }
    if (resizeBase.pixelX === nextPixelX && resizeBase.pixelY === nextPixelY) return;

    const resizeScale = nextPixelX / resizeBase.pixelX;
    if (!Number.isFinite(resizeScale) || resizeScale <= 0) {
      return;
    }
    const nextZoom = Math.max(0.1, Math.min(8, resizeBase.zoomValue * resizeScale));
    const nextScrollX = resizeBase.scrollX * resizeScale;
    const nextScrollY = resizeBase.scrollY * resizeScale;
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
    store.setExcalidrawViewport(containerId, {
      zoomValue: nextZoom,
      scrollX: nextScrollX,
      scrollY: nextScrollY,
    });
    viewportResizeBaseRef.current = {
      zoomValue: nextZoom,
      scrollX: nextScrollX,
      scrollY: nextScrollY,
      pixelX: nextPixelX,
      pixelY: nextPixelY,
    };
  }, [containerSize.pixelX, containerSize.pixelY, isPanEnabled, isZoomEnabled, store, containerId]);

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
          const cachedViewport = store.getExcalidrawViewport(containerId);
          if (cachedViewport) {
            isApplyingLockedViewportRef.current = true;
            api.updateScene({
              appState: {
                zoom: { value: cachedViewport.zoomValue },
                scrollX: cachedViewport.scrollX,
                scrollY: cachedViewport.scrollY,
              },
            });
            requestAnimationFrame(() => {
              isApplyingLockedViewportRef.current = false;
            });
            if (!isPanEnabled || !isZoomEnabled) {
              lockedViewportRef.current = {
                zoomValue: cachedViewport.zoomValue,
                scrollX: cachedViewport.scrollX,
                scrollY: cachedViewport.scrollY,
              };
            }
            setViewportResizeBase(cachedViewport);
            return;
          }
          const initialViewportMeta = initialViewportMetaRef.current;
          const hasInitialViewportMeta =
            Number.isFinite(Number(initialViewportMeta?.pixelX)) &&
            Number(initialViewportMeta.pixelX) > 0 &&
            Number.isFinite(Number(initialViewportMeta?.pixelY)) &&
            Number(initialViewportMeta.pixelY) > 0 &&
            Number.isFinite(Number(containerSize?.pixelX)) &&
            Number(containerSize.pixelX) > 0 &&
            Number.isFinite(Number(containerSize?.pixelY)) &&
            Number(containerSize.pixelY) > 0;
          if (hasInitialViewportMeta) {
            const appState = api.getAppState();
            const initialZoomValue = Number(appState?.zoom?.value ?? 1);
            const initialScrollX = Number(appState?.scrollX ?? 0);
            const initialScrollY = Number(appState?.scrollY ?? 0);
            const ratioX = Number(containerSize.pixelX) / Number(initialViewportMeta.pixelX);
            const ratioY = Number(containerSize.pixelY) / Number(initialViewportMeta.pixelY);
            const resizeScale = Math.sqrt(ratioX * ratioY);
            if (
              Number.isFinite(initialZoomValue) &&
              Number.isFinite(initialScrollX) &&
              Number.isFinite(initialScrollY) &&
              Number.isFinite(resizeScale) &&
              resizeScale > 0 &&
              Math.abs(resizeScale - 1) > 0.0001
            ) {
              const nextZoomValue = Math.max(0.1, Math.min(8, initialZoomValue * resizeScale));
              const nextScrollX = initialScrollX * resizeScale;
              const nextScrollY = initialScrollY * resizeScale;
              isApplyingLockedViewportRef.current = true;
              api.updateScene({
                appState: {
                  zoom: { value: nextZoomValue as any },
                  scrollX: nextScrollX,
                  scrollY: nextScrollY,
                },
              });
              requestAnimationFrame(() => {
                isApplyingLockedViewportRef.current = false;
              });
              store.setExcalidrawViewport(containerId, {
                zoomValue: nextZoomValue,
                scrollX: nextScrollX,
                scrollY: nextScrollY,
              });
              setViewportResizeBase({
                zoomValue: nextZoomValue,
                scrollX: nextScrollX,
                scrollY: nextScrollY,
              });
              return;
            }
          }
          setViewportResizeBase();
        }}
        onChange={(elements, appState, files) => {
          let nextViewportZoomValue = appState?.zoom?.value ?? 1;
          let nextViewportScrollX = appState?.scrollX ?? 0;
          let nextViewportScrollY = appState?.scrollY ?? 0;
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
              nextViewportZoomValue = targetZoomValue;
              nextViewportScrollX = targetScrollX;
              nextViewportScrollY = targetScrollY;
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
          store.setExcalidrawViewport(containerId, {
            zoomValue: nextViewportZoomValue,
            scrollX: nextViewportScrollX,
            scrollY: nextViewportScrollY,
          });
          const resizeBase = viewportResizeBaseRef.current;
          const isViewportBaseMissing = !resizeBase;
          const isViewportChangedFromBase =
            !isViewportBaseMissing &&
            (Math.abs(nextViewportZoomValue - Number(resizeBase.zoomValue ?? 1)) > 0.0001 ||
              Math.abs(nextViewportScrollX - Number(resizeBase.scrollX ?? 0)) > 0.1 ||
              Math.abs(nextViewportScrollY - Number(resizeBase.scrollY ?? 0)) > 0.1);
          if (
            !isApplyingLockedViewportRef.current &&
            (isViewportBaseMissing || isViewportChangedFromBase)
          ) {
            setViewportResizeBase({
              zoomValue: nextViewportZoomValue,
              scrollX: nextViewportScrollX,
              scrollY: nextViewportScrollY,
            });
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
      {!isEditEnabled && !isPanEnabled && !isZoomEnabled ? (
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
      ) : null}
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
