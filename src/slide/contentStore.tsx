import { createContext, useContext } from 'react';
import { makeAutoObservable, observable } from 'mobx';

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

  pageById = observable.map();

  containerById = observable.map();

  containerSizeById = observable.map();

  selectedContainerId = '';

  constructor(seedData) {
    this.metadata = {
      ...this.metadata,
      ...seedData.metadata,
    };

    (seedData.pages ?? []).forEach((pageItem) => {
      this.pageById.set(pageItem.id, {
        ...pageItem,
      });
    });

    (seedData.containers ?? []).forEach((containerItem) => {
      this.containerById.set(containerItem.id, {
        ...containerItem,
      });
      this.containerSizeById.set(containerItem.id, {
        pixelX: 0,
        pixelY: 0,
      });
    });

    makeAutoObservable(this, {}, { autoBind: true });
  }

  getCurrentPageData() {
    return this.getPageData(this.metadata.currentPageId);
  }

  getPageData(pageId) {
    return this.pageById.get(pageId) ?? null;
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
      .map((containerId) => this.containerById.get(containerId))
      .filter(Boolean);
  }

  getContainerData(containerId) {
    return this.containerById.get(containerId) ?? null;
  }

  getContainerSize(containerId) {
    return this.containerSizeById.get(containerId) ?? { pixelX: 0, pixelY: 0 };
  }

  setCurrentPage(pageId) {
    if (!this.pageById.has(pageId)) return;
    this.metadata.currentPageId = pageId;
  }

  setSelectedContainer(containerId) {
    this.selectedContainerId = containerId;
  }

  clearSelectedContainer() {
    this.selectedContainerId = '';
  }

  requestContainerRectUpdate(containerId, nextRect) {
    const prevContainer = this.getContainerData(containerId);
    if (!prevContainer) return;
    const safeRect = normalizeRect(nextRect);
    this.containerById.set(containerId, {
      ...prevContainer,
      pos: {
        x: safeRect.left,
        y: safeRect.top,
      },
      size: {
        x: safeRect.width,
        y: safeRect.height,
      },
    });
  }

  setContainerPixelSize(containerId, nextPixelSize) {
    const prevSize = this.getContainerSize(containerId);
    if (
      prevSize.pixelX === nextPixelSize.pixelX &&
      prevSize.pixelY === nextPixelSize.pixelY
    ) {
      return;
    }
    this.containerSizeById.set(containerId, {
      pixelX: Math.max(0, nextPixelSize.pixelX),
      pixelY: Math.max(0, nextPixelSize.pixelY),
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
  return new SlideContentStore({
    metadata: {
      pageIds: ['page-cover', 'page-body', 'page-end'],
      currentPageId: 'page-cover',
      aspectRatio: { x: 16, y: 9 },
    },
    pages: [
      {
        id: 'page-cover',
        containerIds: ['container-title', 'container-meta'],
      },
      {
        id: 'page-body',
        containerIds: ['container-body-left', 'container-body-right'],
      },
      {
        id: 'page-end',
        containerIds: ['container-end'],
      },
    ],
    containers: [
      {
        id: 'container-title',
        pos: { x: 0.08, y: 0.14 },
        size: { x: 0.84, y: 0.25 },
        compName: 'CompMetadata',
        compData: { title: 'Cover', note: 'Move and resize me' },
      },
      {
        id: 'container-meta',
        pos: { x: 0.08, y: 0.44 },
        size: { x: 0.4, y: 0.22 },
        compName: 'CompMetadata',
        compData: { title: 'Metadata', note: 'Container uses pixel size from store' },
      },
      {
        id: 'container-body-left',
        pos: { x: 0.08, y: 0.14 },
        size: { x: 0.4, y: 0.72 },
        compName: 'CompMetadata',
        compData: { title: 'Left', note: 'Page body left area' },
      },
      {
        id: 'container-body-right',
        pos: { x: 0.52, y: 0.14 },
        size: { x: 0.4, y: 0.72 },
        compName: 'CompMetadata',
        compData: { title: 'Right', note: 'Page body right area' },
      },
      {
        id: 'container-end',
        pos: { x: 0.2, y: 0.3 },
        size: { x: 0.6, y: 0.32 },
        compName: 'CompMetadata',
        compData: { title: 'Thanks', note: 'Final page sample' },
      },
    ],
  });
};

export {
  SlideContentStore,
  SlideStoreProvider,
  useSlideStore,
  createDemoSlideStore,
};
