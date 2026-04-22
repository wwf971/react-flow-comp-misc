import { useMemo } from 'react';
import Slides from '../slide/slides/Slides';
import CompMetadata from '../slide/comp/CompMetadata';
import CompTextSingleline from '../slide/comp/CompTextSingleline';
import CompTextMultline from '../slide/comp/CompTextMultline';
import CompImage from '../slide/comp/CompImage';
import CompExcalidraw from '../slide/comp/CompExcalidraw';
import CompCode from '../slide/comp/CompCode';
import CompIFrame from '../slide/comp/CompIFrame';
import CompUrl from '../slide/comp/CompUrl';
import { createDemoSlideStore } from '../slide/contentStore';

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

const SlideSystemExample = () => {
  const store = useMemo(() => createDemoSlideStore(), []);
  const getComp = useMemo(() => resolveComp, []);

  return <Slides store={store} getComp={getComp} />;
};

export default SlideSystemExample;
