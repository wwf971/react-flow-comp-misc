import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { SlideStoreProvider } from './contentStore';
import Slide from './Slide';
import './slide.css';

const Slides = observer(({ store, getComp }: any) => {
  const [renameInput, setRenameInput] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const currentPage = store.getCurrentPageData() ?? store.getFirstPageData();
  const currentPageId = currentPage?.id ?? '';
  const totalPage = store.getTotalPageIndex();
  const currentPageIndex = store.getCurrentPageIndex(currentPageId);
  const currentPageOrderIndex = Math.max(0, currentPageIndex - 1);
  const isCurrentPageDirty = store.isPageDirty(currentPageId);
  const isPersisting = store.isPersisting;
  const isSlidesInitializing = store.isSlidesInitializing;
  const isSlideSwitching = store.isSlideSwitching;
  const slideItems = store.slideItems ?? [];
  const currentSlideId = store.currentSlideId ?? '';
  const currentSlide = slideItems.find((item: any) => item.id === currentSlideId) ?? null;
  const persistFailureMessage = store.persistFailureMessage ?? '';
  const isSettingBusy = isSlidesInitializing || isSlideSwitching;
  const [isFullWindow, setIsFullWindow] = useState(false);

  useEffect(() => {
    store.requestInitializeSlides();
  }, [store]);

  useEffect(() => {
    setRenameInput(currentSlide?.name ?? '');
    setIsRenaming(false);
  }, [currentSlideId, currentSlide?.name]);
  const requestCommitRename = () => {
    const nextName = `${renameInput ?? ''}`.trim();
    if (!nextName) {
      setRenameInput(currentSlide?.name ?? '');
      setIsRenaming(false);
      return;
    }
    store.requestRenameCurrentSlide(nextName);
    setIsRenaming(false);
  };


  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isSaveShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's';
      if (!isSaveShortcut) return;
      event.preventDefault();
      event.stopPropagation();
      store.requestPersistDirtyPages();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [store]);

  useEffect(() => {
    if (!isFullWindow) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsFullWindow(false);
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [isFullWindow]);

  const prevPage = store.getPrevPageData(currentPageId);
  const nextPage = store.getNextPageData(currentPageId);
  const canMovePageUp = currentPageId && currentPageOrderIndex > 0;
  const canMovePageDown = currentPageId && currentPageOrderIndex < totalPage - 1;

  return (
    <SlideStoreProvider store={store}>
      <div className={`slide-system-root ${isFullWindow ? 'is-full-window' : ''}`}>
        <div className={`slide-system-toolbar ${isFullWindow ? 'is-hidden' : ''}`}>
          <button
            className="slide-toolbar-btn"
            disabled={!prevPage}
            onClick={() => {
              if (!prevPage) return;
              store.setCurrentPage(prevPage.id);
              store.clearSelectedContainer();
            }}
          >
            Prev
          </button>
          <div className="slide-toolbar-settings">
            <select
              className="slide-settings-select"
              value={currentSlideId}
              disabled={isSettingBusy || slideItems.length === 0}
              onChange={(event) => {
                store.requestSwitchSlide(event.target.value);
              }}
            >
              {slideItems.map((item: any) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <div className="slide-rename-root">
              {isRenaming ? (
                <>
                  <input
                    className="slide-rename-input"
                    value={renameInput}
                    disabled={isSettingBusy || !currentSlideId}
                    onChange={(event) => setRenameInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        requestCommitRename();
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        setRenameInput(currentSlide?.name ?? '');
                        setIsRenaming(false);
                      }
                    }}
                  />
                  <button
                    className="slide-rename-action-btn"
                    type="button"
                    disabled={isSettingBusy || !currentSlideId}
                    onClick={requestCommitRename}
                  >
                    Save
                  </button>
                  <button
                    className="slide-rename-action-btn"
                    type="button"
                    disabled={isSettingBusy}
                    onClick={() => {
                      setRenameInput(currentSlide?.name ?? '');
                      setIsRenaming(false);
                    }}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  className="slide-rename-display-btn"
                  type="button"
                  disabled={isSettingBusy || !currentSlideId}
                  onClick={() => {
                    setRenameInput(currentSlide?.name ?? '');
                    setIsRenaming(true);
                  }}
                >
                  {currentSlide?.name ?? 'Untitled'}
                </button>
              )}
            </div>
            <button
              className="slide-toolbar-btn"
              type="button"
              disabled={isSettingBusy}
              onClick={() => {
                store.requestCreateSlide('Untitled');
              }}
            >
              New
            </button>
            <button
              className="slide-toolbar-btn"
              type="button"
              disabled={isSettingBusy || !currentSlideId}
              onClick={() => {
                store.requestDeleteCurrentSlide();
              }}
            >
              Delete Slide
            </button>
            <button
              className="slide-toolbar-btn"
              type="button"
              disabled={isSettingBusy || isPersisting || !canMovePageUp}
              onClick={() => {
                store.requestMoveCurrentPageByOffset(-1);
              }}
            >
              Page Up
            </button>
            <button
              className="slide-toolbar-btn"
              type="button"
              disabled={isSettingBusy || isPersisting || !canMovePageDown}
              onClick={() => {
                store.requestMoveCurrentPageByOffset(1);
              }}
            >
              Page Down
            </button>
            <button
              className="slide-toolbar-btn"
              type="button"
              disabled={isSettingBusy}
              onClick={() => {
                store.requestReinitDatabase();
              }}
            >
              Reinit DB
            </button>
          </div>
          <div className="slide-toolbar-page">
            <span className="slide-toolbar-page-value">{currentPageIndex}</span>
            <span className="slide-toolbar-page-value">{isCurrentPageDirty ? '*' : ''}</span>
            <span className="slide-toolbar-page-sep">/</span>
            <span className="slide-toolbar-page-value">{totalPage}</span>
            <span className={`slide-toolbar-saving ${isPersisting ? 'is-visible' : ''}`}>
              saving
            </span>
            <span className="slide-toolbar-save-fail">{persistFailureMessage}</span>
          </div>
          <button
            className="slide-toolbar-btn"
            disabled={!nextPage}
            onClick={() => {
              if (!nextPage) return;
              store.setCurrentPage(nextPage.id);
              store.clearSelectedContainer();
            }}
          >
            Next
          </button>
        </div>
        <div className="slide-system-canvas-wrap">
          {currentPage ? (
            <Slide
              {...({
                pageId: currentPage.id,
                getComp,
                isPrevEnabled: Boolean(prevPage),
                isNextEnabled: Boolean(nextPage),
                onGoPrev: () => {
                  if (!prevPage) return;
                  store.setCurrentPage(prevPage.id);
                  store.clearSelectedContainer();
                },
                onGoNext: () => {
                  if (!nextPage) return;
                  store.setCurrentPage(nextPage.id);
                  store.clearSelectedContainer();
                },
                isFullWindow,
                onToggleFullWindow: () => {
                  setIsFullWindow((isPrevFullWindow) => {
                    const isNextFullWindow = !isPrevFullWindow;
                    if (isNextFullWindow) {
                      store.setPlayMode(true);
                    }
                    return isNextFullWindow;
                  });
                },
              } as any)}
            />
          ) : (
            <div className="slide-system-empty">No page data</div>
          )}
        </div>
      </div>
    </SlideStoreProvider>
  );
});

export default Slides;
