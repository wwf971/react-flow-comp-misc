import { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { useSlideStore } from '../contentStore';

const ZOOM_MIN = 0.1;
const ZOOM_MAX = 8;
const SAVE_DEBOUNCE_MS = 350;
const SLIDE_WIDTH_EPSILON = 0.5;

const clamp = (value: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, value));
};

const isFinitePositive = (value: unknown): value is number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
};

const parseSceneText = (text: string, sceneVersion: number) => {
  let parsed: any = null;
  if (text && text.trim()) {
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false as const };
    }
  }
  const scene = parsed && typeof parsed === 'object' ? parsed : {};
  const elements = Array.isArray(scene.elements) ? scene.elements : [];
  const files = scene.files && typeof scene.files === 'object' ? scene.files : {};
  const appStateRaw =
    scene.appState && typeof scene.appState === 'object' ? scene.appState : {};

  const {
    zoom: persistedZoom,
    scrollX: persistedScrollXRaw,
    scrollY: persistedScrollYRaw,
    collaborators: persistedCollaborators,
    ...appStateRest
  } = appStateRaw;

  let collaborators: any = persistedCollaborators;
  if (!(collaborators instanceof Map)) {
    if (Array.isArray(collaborators)) {
      collaborators = new Map(collaborators);
    } else if (collaborators && typeof collaborators === 'object') {
      collaborators = new Map(Object.entries(collaborators));
    } else {
      collaborators = new Map();
    }
  }

  const appStateForInitialData = {
    viewBackgroundColor: '#ffffff',
    ...appStateRest,
    collaborators,
  };

  const zoomBySlideWidthRaw = Number(scene?.viewportNormalized?.zoomBySlideWidth);
  const persistedZoomValueRaw = Number(persistedZoom?.value);
  const persistedScrollX = Number(persistedScrollXRaw);
  const persistedScrollY = Number(persistedScrollYRaw);

  const persistedViewport = {
    zoomBySlideWidth: isFinitePositive(zoomBySlideWidthRaw) ? zoomBySlideWidthRaw : null,
    persistedZoomValue: isFinitePositive(persistedZoomValueRaw) ? persistedZoomValueRaw : null,
    persistedScrollX: Number.isFinite(persistedScrollX) ? persistedScrollX : 0,
    persistedScrollY: Number.isFinite(persistedScrollY) ? persistedScrollY : 0,
  };

  return {
    ok: true as const,
    initialData: {
      elements,
      files,
      appState: appStateForInitialData,
      sceneVersion,
    },
    persistedViewport,
  };
};

const buildPersistSnapshot = ({
  elements,
  files,
  viewBackgroundColor,
  zoomValue,
  scrollX,
  scrollY,
  baseSlidePixelX,
  sceneVersion,
}: any) => {
  const hasValidSlide = isFinitePositive(baseSlidePixelX);
  const hasValidZoom = isFinitePositive(zoomValue);
  return {
    elements,
    files,
    appState: {
      viewBackgroundColor: viewBackgroundColor ?? '#ffffff',
      ...(hasValidZoom ? { zoom: { value: zoomValue } } : {}),
      ...(Number.isFinite(scrollX) ? { scrollX } : {}),
      ...(Number.isFinite(scrollY) ? { scrollY } : {}),
    },
    ...(hasValidSlide && hasValidZoom
      ? {
          viewportNormalized: {
            zoomBySlideWidth: zoomValue / baseSlidePixelX,
          },
        }
      : {}),
    sceneVersion,
  };
};

const CompExcalidraw = observer(({ data, containerId, isReadOnly }: any) => {
  const store = useSlideStore();
  const slidePagePixelSize = store.getSlidePagePixelSize();
  const isPlayMode = store.getIsPlayMode();
  const [initialDataForExcalidraw, setInitialDataForExcalidraw] = useState<any>(null);
  const [isApiReady, setIsApiReady] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [isEditEnabled, setIsEditEnabled] = useState(true);
  const [isPanEnabled, setIsPanEnabled] = useState(true);
  const [isZoomEnabled, setIsZoomEnabled] = useState(true);

  const excalidrawApiRef = useRef<any>(null);
  const saveTimerRef = useRef<any>(null);
  const lastSceneSnapshotRef = useRef<string>('');
  const slideWidthBaseRef = useRef<number>(0);
  const persistedViewportRef = useRef<any>(null);
  const isViewportInitializedRef = useRef(false);
  const lockedViewportRef = useRef<any>(null);
  const isApplyingViewportRef = useRef(false);
  const prevIsPlayModeRef = useRef(false);

  const sceneResourceId = data?.sceneResourceId ?? '';
  const sceneVersion = data?.sceneVersion ?? 1;

  useEffect(() => {
    let isCancelled = false;

    const applyParsed = (text: string) => {
      const parsed = parseSceneText(text, sceneVersion);
      if (!parsed.ok) {
        persistedViewportRef.current = null;
        setInitialDataForExcalidraw({
          elements: [],
          files: {},
          appState: {
            viewBackgroundColor: '#ffffff',
            collaborators: new Map(),
          },
          sceneVersion,
        });
        return false;
      }
      persistedViewportRef.current = parsed.persistedViewport;
      setInitialDataForExcalidraw(parsed.initialData);
      return true;
    };

    const run = async () => {
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
        if (isCancelled) return;
        applyParsed('');
        return;
      }
      const loadResult = await store.requestGetResourceText(nextResourceId);
      if (isCancelled) return;
      if (!loadResult?.ok) {
        applyParsed('');
        setErrorText('Failed to load scene resource');
        return;
      }
      const ok = applyParsed(`${loadResult.text ?? ''}`);
      setErrorText(ok ? '' : 'Scene data is invalid');
    };
    run();
    return () => {
      isCancelled = true;
    };
  }, [sceneResourceId, isReadOnly, store, containerId, sceneVersion]);

  useEffect(() => {
    slideWidthBaseRef.current = 0;
    isViewportInitializedRef.current = false;
    lockedViewportRef.current = null;
    lastSceneSnapshotRef.current = '';
  }, [containerId, sceneResourceId]);

  useEffect(() => {
    return () => {
      if (!saveTimerRef.current) return;
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const isEntered = isPlayMode && !prevIsPlayModeRef.current;
    prevIsPlayModeRef.current = isPlayMode;
    if (!isEntered) return;
    const api = excalidrawApiRef.current;
    if (api) {
      const appState = api.getAppState();
      lockedViewportRef.current = {
        zoomValue: appState?.zoom?.value ?? 1,
        scrollX: appState?.scrollX ?? 0,
        scrollY: appState?.scrollY ?? 0,
      };
    }
    setIsEditEnabled(false);
    setIsPanEnabled(false);
    setIsZoomEnabled(false);
  }, [isPlayMode]);

  useEffect(() => {
    const api = excalidrawApiRef.current;
    if (!api) return;
    if (!isViewportInitializedRef.current) return;
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
  }, [isPanEnabled, isZoomEnabled, isApiReady]);

  useEffect(() => {
    if (isViewportInitializedRef.current) return;
    if (!isApiReady) return;
    const api = excalidrawApiRef.current;
    if (!api) return;
    if (!initialDataForExcalidraw) return;
    const slidePixelX = Number(slidePagePixelSize?.pixelX);
    if (!isFinitePositive(slidePixelX)) return;

    const persisted = persistedViewportRef.current ?? {};

    let nextZoomValue = 1;
    if (isFinitePositive(persisted.zoomBySlideWidth)) {
      nextZoomValue = clamp(persisted.zoomBySlideWidth * slidePixelX, ZOOM_MIN, ZOOM_MAX);
    } else if (isFinitePositive(persisted.persistedZoomValue)) {
      nextZoomValue = clamp(persisted.persistedZoomValue, ZOOM_MIN, ZOOM_MAX);
    }

    const nextScrollX = Number(persisted.persistedScrollX ?? 0);
    const nextScrollY = Number(persisted.persistedScrollY ?? 0);

    isApplyingViewportRef.current = true;
    api.updateScene({
      appState: {
        zoom: { value: nextZoomValue },
        scrollX: nextScrollX,
        scrollY: nextScrollY,
      },
    });
    requestAnimationFrame(() => {
      isApplyingViewportRef.current = false;
    });

    slideWidthBaseRef.current = slidePixelX;
    if (!isPanEnabled || !isZoomEnabled) {
      lockedViewportRef.current = {
        zoomValue: nextZoomValue,
        scrollX: nextScrollX,
        scrollY: nextScrollY,
      };
    }

    const snapshot = buildPersistSnapshot({
      elements: initialDataForExcalidraw.elements,
      files: initialDataForExcalidraw.files,
      viewBackgroundColor: initialDataForExcalidraw.appState?.viewBackgroundColor,
      zoomValue: nextZoomValue,
      scrollX: nextScrollX,
      scrollY: nextScrollY,
      baseSlidePixelX: slidePixelX,
      sceneVersion,
    });
    lastSceneSnapshotRef.current = JSON.stringify(snapshot);
    isViewportInitializedRef.current = true;
  }, [
    isApiReady,
    initialDataForExcalidraw,
    slidePagePixelSize.pixelX,
    isPanEnabled,
    isZoomEnabled,
    sceneVersion,
  ]);

  useEffect(() => {
    if (!isViewportInitializedRef.current) return;
    const api = excalidrawApiRef.current;
    if (!api) return;
    const nextSlidePixelX = Number(slidePagePixelSize?.pixelX);
    if (!isFinitePositive(nextSlidePixelX)) return;
    const baseSlidePixelX = slideWidthBaseRef.current;
    if (!isFinitePositive(baseSlidePixelX)) return;
    if (Math.abs(nextSlidePixelX - baseSlidePixelX) < SLIDE_WIDTH_EPSILON) return;

    const appState = api.getAppState();
    const currentZoomValue = Number(appState?.zoom?.value ?? 1);
    const currentScrollX = Number(appState?.scrollX ?? 0);
    const currentScrollY = Number(appState?.scrollY ?? 0);
    const resizeScale = nextSlidePixelX / baseSlidePixelX;
    if (!isFinitePositive(resizeScale)) return;
    const nextZoomValue = clamp(currentZoomValue * resizeScale, ZOOM_MIN, ZOOM_MAX);

    isApplyingViewportRef.current = true;
    api.updateScene({
      appState: {
        zoom: { value: nextZoomValue },
        scrollX: currentScrollX,
        scrollY: currentScrollY,
      },
    });
    requestAnimationFrame(() => {
      isApplyingViewportRef.current = false;
    });

    slideWidthBaseRef.current = nextSlidePixelX;
    if (!isPanEnabled || !isZoomEnabled) {
      lockedViewportRef.current = {
        zoomValue: nextZoomValue,
        scrollX: currentScrollX,
        scrollY: currentScrollY,
      };
    }
  }, [slidePagePixelSize.pixelX, isPanEnabled, isZoomEnabled]);

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

  const queueSaveScene = (sceneData: any) => {
    if (!sceneResourceId) return;
    if (isReadOnly) return;
    if (!isViewportInitializedRef.current) return;
    const baseSlidePixelX = Number(
      slideWidthBaseRef.current || slidePagePixelSize?.pixelX || 0,
    );
    const snapshot = buildPersistSnapshot({
      elements: Array.isArray(sceneData?.elements) ? sceneData.elements : [],
      files: sceneData?.files && typeof sceneData.files === 'object' ? sceneData.files : {},
      viewBackgroundColor: sceneData?.appState?.viewBackgroundColor ?? '#ffffff',
      zoomValue: Number(sceneData?.appState?.zoom?.value),
      scrollX: Number(sceneData?.appState?.scrollX),
      scrollY: Number(sceneData?.appState?.scrollY),
      baseSlidePixelX,
      sceneVersion,
    });
    const nextSnapshotJson = JSON.stringify(snapshot);
    if (nextSnapshotJson === lastSceneSnapshotRef.current) return;
    lastSceneSnapshotRef.current = nextSnapshotJson;
    store.markCompDirtyByContainerId(containerId, 'updated');
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(async () => {
      const saveResult = await store.requestSetResourceText(
        sceneResourceId,
        nextSnapshotJson,
      );
      if (!saveResult?.ok) {
        setErrorText('Failed to save scene resource');
        return;
      }
      setErrorText('');
    }, SAVE_DEBOUNCE_MS);
  };

  if (!initialDataForExcalidraw) {
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
        initialData={initialDataForExcalidraw}
        viewModeEnabled={isReadOnly || !isEditEnabled}
        excalidrawAPI={(api) => {
          excalidrawApiRef.current = api;
          setIsApiReady(true);
        }}
        onChange={(elements, appState, files) => {
          const currentZoomValue = Number(appState?.zoom?.value ?? 1);
          const currentScrollX = Number(appState?.scrollX ?? 0);
          const currentScrollY = Number(appState?.scrollY ?? 0);

          let appliedZoomValue = currentZoomValue;
          let appliedScrollX = currentScrollX;
          let appliedScrollY = currentScrollY;

          if (
            (!isPanEnabled || !isZoomEnabled) &&
            lockedViewportRef.current &&
            !isApplyingViewportRef.current
          ) {
            const locked = lockedViewportRef.current;
            const hasViewportChange =
              (!isZoomEnabled && Math.abs(currentZoomValue - locked.zoomValue) > 0.0001) ||
              (!isPanEnabled && Math.abs(currentScrollX - locked.scrollX) > 0.1) ||
              (!isPanEnabled && Math.abs(currentScrollY - locked.scrollY) > 0.1);
            if (hasViewportChange && excalidrawApiRef.current) {
              const targetZoomValue = isZoomEnabled ? currentZoomValue : locked.zoomValue;
              const targetScrollX = isPanEnabled ? currentScrollX : locked.scrollX;
              const targetScrollY = isPanEnabled ? currentScrollY : locked.scrollY;
              appliedZoomValue = targetZoomValue;
              appliedScrollX = targetScrollX;
              appliedScrollY = targetScrollY;
              isApplyingViewportRef.current = true;
              excalidrawApiRef.current.updateScene({
                appState: {
                  zoom: { value: targetZoomValue },
                  scrollX: targetScrollX,
                  scrollY: targetScrollY,
                },
              });
              requestAnimationFrame(() => {
                isApplyingViewportRef.current = false;
              });
            }
          }

          if (isReadOnly) return;
          queueSaveScene({
            elements,
            appState: {
              viewBackgroundColor: appState?.viewBackgroundColor ?? '#ffffff',
              zoom: { value: appliedZoomValue },
              scrollX: appliedScrollX,
              scrollY: appliedScrollY,
            },
            files,
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
