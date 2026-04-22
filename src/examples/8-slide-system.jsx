import { useMemo } from 'react';
import Slides from '../slide/Slides';
import CompMetadata from '../slide/comp/CompMetadata';
import CompTextMultiple from '../slide/comp/CompTextMultiple';
import CompImageExample from '../slide/comp/CompImageExample';
import CompExcalidraw from '../slide/comp/CompExcalidraw';
import { createDemoSlideStore } from '../slide/contentStore';

const resolveComp = (compName) => {
  if (compName === 'CompTextMultiple') return CompTextMultiple;
  if (compName === 'CompImageExample') return CompImageExample;
  if (compName === 'CompExcalidraw') return CompExcalidraw;
  if (compName === 'CompMetadata') return CompMetadata;
  return CompMetadata;
};

const SlideSystemExample = () => {
  const store = useMemo(() => createDemoSlideStore(), []);
  const getComp = useMemo(() => resolveComp, []);

  return <Slides store={store} getComp={getComp} />;
};

export default SlideSystemExample;
