import { useMemo } from 'react';
import Slides from '../slide/Slides';
import CompMetadata from '../slide/CompMetadata';
import { createDemoSlideStore } from '../slide/contentStore';

const resolveComp = (compName) => {
  if (compName === 'CompMetadata') return CompMetadata;
  return CompMetadata;
};

const SlideSystemExample = () => {
  const store = useMemo(() => createDemoSlideStore(), []);
  const getComp = useMemo(() => resolveComp, []);

  return <Slides store={store} getComp={getComp} />;
};

export default SlideSystemExample;
