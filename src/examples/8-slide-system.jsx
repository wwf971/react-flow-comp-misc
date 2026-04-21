import { useMemo } from 'react';
import Slides from '../slide/Slides';
import CompMetadata from '../slide/CompMetadata';
import CompTextMultiple from '../slide/CompTextMultiple';
import CompImageExample from '../slide/CompImageExample';
import { createDemoSlideStore } from '../slide/contentStore';

const resolveComp = (compName) => {
  if (compName === 'CompTextMultiple') return CompTextMultiple;
  if (compName === 'CompImageExample') return CompImageExample;
  if (compName === 'CompMetadata') return CompMetadata;
  return CompMetadata;
};

const SlideSystemExample = () => {
  const store = useMemo(() => createDemoSlideStore(), []);
  const getComp = useMemo(() => resolveComp, []);

  return <Slides store={store} getComp={getComp} />;
};

export default SlideSystemExample;
