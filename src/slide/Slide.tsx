import { useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import CompContainer from './CompContainer';
import { useSlideStore } from './contentStore';

const useElementSize = () => {
  const elementRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return undefined;

    const resizeObserver = new ResizeObserver((entries) => {
      const nextRect = entries[0]?.contentRect;
      if (!nextRect) return;
      setSize({
        width: nextRect.width,
        height: nextRect.height,
      });
    });

    resizeObserver.observe(element);
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return { elementRef, size };
};

const Slide = observer(({ pageId, getComp }: any) => {
  const store = useSlideStore();
  const { elementRef, size } = useElementSize();
  const containers = store.getPageContainers(pageId);
  const pageAspectRatio = store.getPageAspectRatio();

  const styleVars = useMemo((): any => {
    return {
      '--slide-page-aspect-ratio': `${pageAspectRatio}`,
    };
  }, [pageAspectRatio]);

  return (
    <div className="slide-page-shell">
      <div className="slide-page-surface" ref={elementRef} style={styleVars}>
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
              pagePixelSize={size}
              getComp={getComp}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

export default Slide;
