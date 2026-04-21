import { useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import CompContainer from './CompContainer';
import { useSlideStore } from './contentStore';

const Slide = observer(({ pageId, getComp }: any) => {
  const store = useSlideStore();
  const containers = store.getPageContainers(pageId);
  const pageAspectRatio = store.getPageAspectRatio();

  const styleVars = useMemo((): any => {
    return {
      '--slide-page-aspect-ratio': `${pageAspectRatio}`,
    };
  }, [pageAspectRatio]);

  return (
    <div className="slide-page-shell">
      <div className="slide-page-surface" style={styleVars}>
        <div
          className="slide-page-layer"
          onPointerDown={(event) => {
            if (event.target !== event.currentTarget) return;
            store.clearSelectedContainer();
          }}
        >
          {containers.map((containerData) => (
            <CompContainer
              key={containerData.id}
              containerId={containerData.id}
              getComp={getComp}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

export default Slide;
