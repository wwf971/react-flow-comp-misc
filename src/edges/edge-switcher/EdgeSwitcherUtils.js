function normalizeSwitchableEdgeOption(option) {
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

export function getEdgeSwitcherMenuOptions(edgeData) {
  const edgeSwitcherData = edgeData?.edgeSwitcher;
  if (!edgeSwitcherData?.isEnabled) {
    return [];
  }
  const ownEdgeType =
    typeof edgeSwitcherData.ownEdgeType === 'string'
      ? edgeSwitcherData.ownEdgeType
      : typeof edgeSwitcherData.currentEdgeType === 'string'
        ? edgeSwitcherData.currentEdgeType
        : null;
  const rawOptions = Array.isArray(edgeSwitcherData.switchableEdgeTypes)
    ? edgeSwitcherData.switchableEdgeTypes
    : Array.isArray(edgeSwitcherData.edgeTypeOptions)
      ? edgeSwitcherData.edgeTypeOptions
      : [];
  return rawOptions
    .map((option) => normalizeSwitchableEdgeOption(option))
    .filter((option) => option && option.value !== ownEdgeType);
}

export function invokeEdgeTypeSwitch(edgeData, payload) {
  const onEdgeTypeSwitch = edgeData?.edgeSwitcher?.onEdgeTypeSwitch;
  if (typeof onEdgeTypeSwitch !== 'function') {
    return;
  }
  onEdgeTypeSwitch(payload);
}

