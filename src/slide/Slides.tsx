import { observer } from 'mobx-react-lite';
import { SlideStoreProvider } from './contentStore';
import Slide from './Slide';
import './slide.css';

const Slides = observer(({ store, getComp }: any) => {
  const currentPage = store.getCurrentPageData() ?? store.getFirstPageData();
  const currentPageId = currentPage?.id ?? '';
  const totalPage = store.getTotalPageIndex();
  const currentPageIndex = store.getCurrentPageIndex(currentPageId);

  const prevPage = store.getPrevPageData(currentPageId);
  const nextPage = store.getNextPageData(currentPageId);

  return (
    <SlideStoreProvider store={store}>
      <div className="slide-system-root">
        <div className="slide-system-toolbar">
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
          <div className="slide-toolbar-page">
            <span className="slide-toolbar-page-value">{currentPageIndex}</span>
            <span className="slide-toolbar-page-sep">/</span>
            <span className="slide-toolbar-page-value">{totalPage}</span>
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
            <Slide {...({ pageId: currentPage.id, getComp } as any)} />
          ) : (
            <div className="slide-system-empty">No page data</div>
          )}
        </div>
      </div>
    </SlideStoreProvider>
  );
});

export default Slides;
