import { memo, useMemo } from 'react';
import { BaseEdge, getBezierPath } from 'reactflow';
import { editableBezierEdgeTypes } from '../edge-bezier/EdgeBezier.jsx';
import { editableRecEdgeTypes } from '../edge-rec/EdgeRec.jsx';
import { useExtraData } from '../../storeMobx';

function normalizeEdgeTypeOption(option) {
  if (typeof option === 'string') {
    return { value: option, label: option };
  }
  if (!option || typeof option !== 'object') {
    return null;
  }
  const value = typeof option.value === 'string' ? option.value : null;
  if (!value) return null;
  const label = typeof option.label === 'string' ? option.label : value;
  return { value, label };
}

function FallbackEdge({ id, sourceX, sourceY, targetX, targetY }) {
  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY });
  return <BaseEdge id={id} path={path} />;
}

const defaultEdgeComponentByType = {
  default: FallbackEdge,
  editableBezier: editableBezierEdgeTypes.editableBezier,
  editableRec: editableRecEdgeTypes.editableRec,
};

function buildChildEdgeData(edgeData) {
  const edgeSwitcherData = edgeData?.edgeSwitcher;
  if (!edgeSwitcherData?.isEnabled) {
    return edgeData;
  }
  const ownEdgeType =
    typeof edgeSwitcherData.currentEdgeType === 'string'
      ? edgeSwitcherData.currentEdgeType
      : typeof edgeSwitcherData.ownEdgeType === 'string'
        ? edgeSwitcherData.ownEdgeType
        : 'default';
  const rawOptions = Array.isArray(edgeSwitcherData.edgeTypeOptions)
    ? edgeSwitcherData.edgeTypeOptions
    : [];
  const switchableEdgeTypes = rawOptions
    .map((option) => normalizeEdgeTypeOption(option))
    .filter((option) => option && option.value !== ownEdgeType);
  return {
    ...edgeData,
    edgeSwitcher: {
      ...edgeSwitcherData,
      isEnabled: true,
      ownEdgeType,
      switchableEdgeTypes,
    },
  };
}

export function createDefaultEdgeSwitcherData({
  currentEdgeType = 'editableRec',
  edgeTypeOptions = [],
  edgeDataByType = {},
  onEdgeTypeSwitch = null,
} = {}) {
  return {
    edgeSwitcher: {
      isEnabled: true,
      currentEdgeType,
      ownEdgeType: currentEdgeType,
      edgeTypeOptions,
      edgeDataByType,
      onEdgeTypeSwitch,
    },
  };
}

export function createEdgeSwitcherEdge(edgeComponentByType = {}) {
  const mergedEdgeComponentByType = {
    ...defaultEdgeComponentByType,
    ...edgeComponentByType,
  };
  return memo(function EdgeSwitcherEdge(props) {
    const basicData = props.data?.basicData ?? {};
    const edgeExtraData = useExtraData(basicData.graphId, 'edge', props.id) ?? {};
    const currentEdgeType = edgeExtraData?.edgeSwitcher?.currentEdgeType ?? 'default';
    const EdgeComp = mergedEdgeComponentByType[currentEdgeType] ?? mergedEdgeComponentByType.default;
    const childEdgeData = useMemo(
      () =>
        buildChildEdgeData({
          ...edgeExtraData,
          basicData,
        }),
      [edgeExtraData, basicData]
    );
    return <EdgeComp {...props} data={childEdgeData} />;
  });
}

export const EdgeSwitcher = createEdgeSwitcherEdge();

