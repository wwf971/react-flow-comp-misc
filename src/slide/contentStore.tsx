import { createContext, useContext } from 'react';
import { makeAutoObservable } from 'mobx';
import { createDemoPersistData } from './contentPersistStore';

const MIN_RATIO_SIZE = 0.03;

const clamp = (value, min, max) => {
  return Math.min(max, Math.max(min, value));
};

const normalizeRect = (nextRect) => {
  const width = clamp(nextRect.width, MIN_RATIO_SIZE, 1);
  const height = clamp(nextRect.height, MIN_RATIO_SIZE, 1);
  const left = clamp(nextRect.left, 0, 1 - width);
  const top = clamp(nextRect.top, 0, 1 - height);
  return { left, top, width, height };
};

class SlideContentStore {
  metadata = {
    pageIds: [],
    currentPageId: '',
    aspectRatio: { x: 16, y: 9 },
  };

  pageDataById = {};

  containerDataById = {};

  compDataById = {};

  selectedContainerId = '';

  selectedCompId = '';

  editingCompId = '';

  constructor(seedData: any) {
    this.metadata = {
      ...this.metadata,
      ...seedData.metadata,
    };

    Object.entries(seedData.pageDataById ?? {}).forEach(([pageId, pageData]: any) => {
      this.pageDataById[pageId] = { ...pageData };
    });

    Object.entries(seedData.containerDataById ?? {}).forEach(
      ([containerId, containerData]: any) => {
        this.containerDataById[containerId] = {
          ...containerData,
          containerSize: {
            pixelX: containerData.containerSize?.pixelX ?? 0,
            pixelY: containerData.containerSize?.pixelY ?? 0,
          },
        };
      },
    );

    Object.entries(seedData.compDataById ?? {}).forEach(([compId, compEntry]: any) => {
      this.compDataById[compId] = {
        ...compEntry,
        compData: {
          ...(compEntry.compData ?? {}),
        },
      };
    });

    makeAutoObservable(this, {}, { autoBind: true });
  }

  getCurrentPageData() {
    return this.getPageData(this.metadata.currentPageId);
  }

  getPageData(pageId) {
    return this.pageDataById[pageId] ?? null;
  }

  getFirstPageData() {
    const firstPageId = this.metadata.pageIds[0];
    if (!firstPageId) return null;
    return this.getPageData(firstPageId);
  }

  getCurrentPageIndex(pageId) {
    const currentIndex = this.metadata.pageIds.findIndex((id) => id === pageId);
    if (currentIndex < 0) return -1;
    return currentIndex + 1;
  }

  getTotalPageIndex(_pageId) {
    return this.metadata.pageIds.length;
  }

  getNextPageData(pageId) {
    const currentIndex = this.metadata.pageIds.findIndex((id) => id === pageId);
    if (currentIndex < 0) return null;
    return this.getPageData(this.metadata.pageIds[currentIndex + 1] ?? '');
  }

  getPrevPageData(pageId) {
    const currentIndex = this.metadata.pageIds.findIndex((id) => id === pageId);
    if (currentIndex < 0) return null;
    return this.getPageData(this.metadata.pageIds[currentIndex - 1] ?? '');
  }

  getPageAspectRatio() {
    const { x, y } = this.metadata.aspectRatio;
    if (!x || !y) return 1;
    return x / y;
  }

  getPageContainers(pageId) {
    const pageData = this.getPageData(pageId);
    if (!pageData) return [];
    return (pageData.containerIds ?? [])
      .map((containerId) => this.containerDataById[containerId])
      .filter(Boolean);
  }

  getContainerData(containerId) {
    return this.containerDataById[containerId] ?? null;
  }

  getCompData(compId) {
    return this.compDataById[compId] ?? null;
  }

  getContainerCompData(containerId) {
    const containerData = this.getContainerData(containerId);
    if (!containerData) return null;
    return this.getCompData(containerData.compId);
  }

  getContainerSize(containerId) {
    const containerData = this.getContainerData(containerId);
    if (!containerData) return { pixelX: 0, pixelY: 0 };
    return containerData.containerSize ?? { pixelX: 0, pixelY: 0 };
  }

  setCurrentPage(pageId) {
    if (!this.pageDataById[pageId]) return;
    this.metadata.currentPageId = pageId;
  }

  setSelectedContainer(containerId) {
    const containerData = this.getContainerData(containerId);
    if (!containerData) return;
    this.selectedContainerId = containerId;
    this.selectedCompId = containerData.compId ?? '';
    if (this.editingCompId && this.editingCompId !== this.selectedCompId) {
      this.editingCompId = '';
    }
  }

  clearSelectedContainer() {
    this.selectedContainerId = '';
    this.selectedCompId = '';
    this.editingCompId = '';
  }

  setEditingComp(compId) {
    const compData = this.getCompData(compId);
    if (!compData) return;
    this.editingCompId = compId;
  }

  clearEditingComp() {
    this.editingCompId = '';
  }

  isCompEditing(compId) {
    return this.editingCompId === compId;
  }

  requestContainerRectUpdate(containerId, nextRect) {
    const containerData = this.getContainerData(containerId);
    if (!containerData) return;
    const safeRect = normalizeRect(nextRect);
    this.containerDataById[containerId] = {
      ...containerData,
      pos: {
        x: safeRect.left,
        y: safeRect.top,
      },
      size: {
        x: safeRect.width,
        y: safeRect.height,
      },
    };
  }

  setContainerPixelSize(containerId, nextPixelSize) {
    const containerData = this.getContainerData(containerId);
    if (!containerData) return;
    const prevSize = this.getContainerSize(containerId);
    if (
      prevSize.pixelX === nextPixelSize.pixelX &&
      prevSize.pixelY === nextPixelSize.pixelY
    ) {
      return;
    }
    this.containerDataById[containerId] = {
      ...containerData,
      containerSize: {
        pixelX: Math.max(0, nextPixelSize.pixelX),
        pixelY: Math.max(0, nextPixelSize.pixelY),
      },
    };
  }

  requestContainerCompDataUpdate(containerId, nextCompDataPartial) {
    const containerData = this.getContainerData(containerId);
    if (!containerData) return;
    const compData = this.getCompData(containerData.compId);
    if (!compData) return;
    this.compDataById[containerData.compId] = {
      ...compData,
      compData: {
        ...(compData.compData ?? {}),
        ...(nextCompDataPartial ?? {}),
      },
    };
  }

  requestContainerFitToPixelSize(containerId, nextPixelSize) {
    const containerData = this.getContainerData(containerId);
    if (!containerData) return;
    const currentPixelSize = this.getContainerSize(containerId);
    const currentRatioWidth = containerData.size?.x ?? 0;
    const currentRatioHeight = containerData.size?.y ?? 0;

    let pagePixelWidth =
      currentRatioWidth > 0 ? currentPixelSize.pixelX / currentRatioWidth : 0;
    let pagePixelHeight =
      currentRatioHeight > 0 ? currentPixelSize.pixelY / currentRatioHeight : 0;

    const pageAspectRatio = this.getPageAspectRatio();
    if (pagePixelWidth <= 0 && pagePixelHeight > 0) {
      pagePixelWidth = pagePixelHeight * pageAspectRatio;
    }
    if (pagePixelHeight <= 0 && pagePixelWidth > 0) {
      pagePixelHeight = pagePixelWidth / pageAspectRatio;
    }
    if (pagePixelWidth <= 0 || pagePixelHeight <= 0) return;

    const nextRatioWidth = clamp(nextPixelSize.pixelX / pagePixelWidth, MIN_RATIO_SIZE, 1);
    const nextRatioHeight = clamp(
      nextPixelSize.pixelY / pagePixelHeight,
      MIN_RATIO_SIZE,
      1,
    );

    const nextLeft = clamp(containerData.pos.x, 0, 1 - nextRatioWidth);
    const nextTop = clamp(containerData.pos.y, 0, 1 - nextRatioHeight);

    this.requestContainerRectUpdate(containerId, {
      left: nextLeft,
      top: nextTop,
      width: nextRatioWidth,
      height: nextRatioHeight,
    });
  }
}

const SlideStoreContext = createContext(null);

const SlideStoreProvider = ({ store, children }) => {
  return (
    <SlideStoreContext.Provider value={store}>{children}</SlideStoreContext.Provider>
  );
};

const useSlideStore = () => {
  const store = useContext(SlideStoreContext);
  if (!store) {
    throw new Error('Slide store provider is missing.');
  }
  return store;
};

const createDemoSlideStore = () => {
  return new SlideContentStore(createDemoPersistData());
};

export {
  SlideContentStore,
  SlideStoreProvider,
  useSlideStore,
  createDemoSlideStore,
};
