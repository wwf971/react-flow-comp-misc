import { useMemo } from 'react';
import Slides from './Slides';
import CompMetadata from '../comp/CompMetadata';
import CompTextSingleline from '../comp/CompTextSingleline';
import CompTextMultline from '../comp/CompTextMultline';
import CompImage from '../comp/CompImage';
import CompExcalidraw from '../comp/CompExcalidraw';
import CompCode from '../comp/CompCode';
import CompIFrame from '../comp/CompIFrame';
import CompUrl from '../comp/CompUrl';
import { createDemoSlideStore } from '../contentStore';

const resolveComp = (compName) => {
  if (compName === 'CompTextSingleline') return CompTextSingleline;
  if (compName === 'CompTextMultline' || compName === 'CompTextMultiple') return CompTextMultline;
  if (compName === 'CompImage' || compName === 'CompImageExample') return CompImage;
  if (compName === 'CompExcalidraw') return CompExcalidraw;
  if (compName === 'CompCode') return CompCode;
  if (compName === 'CompIFrame') return CompIFrame;
  if (compName === 'CompUrl') return CompUrl;
  if (compName === 'CompMetadata') return CompMetadata;
  return CompMetadata;
};

const SlidesExample = () => {
  const store = useMemo(() => createDemoSlideStore(), []);
  const getComp = useMemo(() => resolveComp, []);

  return <Slides store={store} getComp={getComp} />;
};

export default SlidesExample;
