import { useCallback, useEffect, useMemo } from 'react';
import { ReactFlow, Background, Controls, MiniMap, Handle, Position, addEdge } from 'reactflow';
import {
  EdgeRecMenuContext,
  editableRecEdgeTypes,
  createDefaultEditableRecEdgeData,
} from './edge-rec/EdgeRec.jsx';
import { useEditableRecEdgeInteractions } from './edge-rec/interaction.js';
import {
  EdgeBezierMenuContext,
  editableBezierEdgeTypes,
  createDefaultEditableBezierEdgeData,
  useEditableBezierEdgeInteractions,
} from './edge-bezier/EdgeBezier.jsx';
import { EdgeSwitcher, createDefaultEdgeSwitcherData } from './edge-switcher/EdgeSwitcher.jsx';
import { useNodesState, useEdgesState, useGraphDataApi } from '../storeMobx';
import 'reactflow/dist/style.css';
import './edge-rec/EdgeRec.css';
import './example.css';

const edgeExampleModeRec = 'editableRec';
const edgeExampleModeBezier = 'editableBezier';
const edgeExampleModeSwitcher = 'edgeSwitcher';

const initialNodes = [
  { id: '1', type: 'recEdgeNode', position: { x: 80, y: 120 }, data: { label: 'Node A' } },
  { id: '2', type: 'recEdgeNode', position: { x: 360, y: 120 }, data: { label: 'Node B' } },
];

const edgeTypeSwitchOptions = [
  { value: edgeExampleModeRec, label: 'right-angle' },
  { value: edgeExampleModeBezier, label: 'bezier' },
  { value: 'default', label: 'default' },
];

function clonePlainData(data) {
  if (!data || typeof data !== 'object') return {};
  return JSON.parse(JSON.stringify(data));
}

function BasicNode({ data }) {
  return (
    <div className="rec-edge-demo-node-root">
      <Handle type="target" position={Position.Left} />
      <div className="rec-edge-demo-node-label">{data?.basicData?.label ?? ''}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = {
  recEdgeNode: BasicNode,
};
const edgeTypesByMode = {
  [edgeExampleModeRec]: editableRecEdgeTypes,
  [edgeExampleModeBezier]: editableBezierEdgeTypes,
  [edgeExampleModeSwitcher]: { edgeSwitcher: EdgeSwitcher },
};

function buildInitialEdges(mode, onEdgeTypeSwitch) {
  const baseEdge = { id: 'edge-1-2', source: '1', target: '2' };
  if (mode === edgeExampleModeBezier) {
    return [
      {
        ...baseEdge,
        type: 'editableBezier',
        data: createDefaultEditableBezierEdgeData(),
      },
    ];
  }
  if (mode === edgeExampleModeSwitcher) {
    return [
      {
        ...baseEdge,
        type: 'edgeSwitcher',
        data: {
          ...createDefaultEditableRecEdgeData(),
          ...createDefaultEdgeSwitcherData({
            currentEdgeType: edgeExampleModeRec,
            edgeTypeOptions: edgeTypeSwitchOptions,
            onEdgeTypeSwitch,
          }),
        },
      },
    ];
  }
  return [
    {
      ...baseEdge,
      type: 'editableRec',
      data: createDefaultEditableRecEdgeData(),
    },
  ];
}

function buildEdgeTypeByMode(mode) {
  return edgeTypesByMode[mode] ?? editableRecEdgeTypes;
}

function buildEdgeDataByType(nextEdgeType) {
  if (nextEdgeType === edgeExampleModeBezier) return createDefaultEditableBezierEdgeData();
  if (nextEdgeType === edgeExampleModeRec) return createDefaultEditableRecEdgeData();
  return {};
}

function extractDataSnapshotByType(edgeType, edgeData) {
  if (edgeType === edgeExampleModeBezier) {
    return {
      controlPoints: clonePlainData(edgeData?.controlPoints ?? []),
    };
  }
  if (edgeType === edgeExampleModeRec) {
    return {
      controlPoints: clonePlainData(edgeData?.controlPoints ?? []),
      minimumEndpointLegLength:
        typeof edgeData?.minimumEndpointLegLength === 'number'
          ? edgeData.minimumEndpointLegLength
          : undefined,
      directionPreferences: clonePlainData(edgeData?.directionPreferences ?? {}),
      isDebugInfoVisible: edgeData?.isDebugInfoVisible !== false,
    };
  }
  return {};
}

function EdgeDemoViewport({ demoKey, title, mode }) {
  const flowId = `edgeExampleFlowId-${demoKey}`;
  const [nodes, , onNodesChange] = useNodesState(flowId, initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowId, []);
  const { getExtraData, setExtraData } = useGraphDataApi(flowId);

  const onEdgeTypeSwitch = useCallback(
    ({ edgeId, toEdgeType }) => {
      if (!toEdgeType) return;
      setExtraData('edge', edgeId, (existingExtraData) => {
        const currentEdgeType =
          existingExtraData?.edgeSwitcher?.currentEdgeType ??
          existingExtraData?.edgeSwitcher?.ownEdgeType ??
          'default';
        const existingTypeData = existingExtraData?.edgeSwitcher?.edgeDataByType ?? {};
        const nextEdgeDataByType = {
          ...existingTypeData,
          [currentEdgeType]: {
            ...extractDataSnapshotByType(currentEdgeType, existingExtraData),
          },
        };
        if (!nextEdgeDataByType[toEdgeType]) {
          nextEdgeDataByType[toEdgeType] = buildEdgeDataByType(toEdgeType);
        }
        const nextEdgeData = clonePlainData(nextEdgeDataByType[toEdgeType]);
        return {
          ...existingExtraData,
          ...nextEdgeData,
          edgeSwitcher: {
            ...existingExtraData?.edgeSwitcher,
            isEnabled: true,
            currentEdgeType: toEdgeType,
            ownEdgeType: toEdgeType,
            edgeTypeOptions: edgeTypeSwitchOptions,
            edgeDataByType: nextEdgeDataByType,
            onEdgeTypeSwitch: existingExtraData?.edgeSwitcher?.onEdgeTypeSwitch ?? null,
          },
        };
      });
    },
    [setExtraData]
  );

  const initialEdges = useMemo(() => buildInitialEdges(mode, onEdgeTypeSwitch), [mode, onEdgeTypeSwitch]);
  const edgeTypes = useMemo(() => buildEdgeTypeByMode(mode), [mode]);

  const recInteractions = useEditableRecEdgeInteractions({
    edges,
    setEdges,
    getExtraData,
    setExtraData,
  });
  const bezierInteractions = useEditableBezierEdgeInteractions({
    edges,
    setEdges,
    getExtraData,
    setExtraData,
  });
  const isBezierMode = mode === edgeExampleModeBezier;
  const activeInteractions = isBezierMode ? bezierInteractions : recInteractions;
  const {
    edgeMenuContextValue,
    isControlPointDragging,
    handlePaneClick,
    handleNodeClick,
    menuOverlay,
  } = activeInteractions;

  useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  const onConnect = useCallback(
    (params) =>
      setEdges((existingEdges) =>
        addEdge(
          {
            ...params,
            type:
              mode === edgeExampleModeBezier
                ? 'editableBezier'
                : mode === edgeExampleModeSwitcher
                  ? 'edgeSwitcher'
                  : 'editableRec',
            data:
              mode === edgeExampleModeBezier
                ? createDefaultEditableBezierEdgeData()
                : mode === edgeExampleModeSwitcher
                  ? {
                      ...createDefaultEditableRecEdgeData(),
                      ...createDefaultEdgeSwitcherData({
                        currentEdgeType: edgeExampleModeRec,
                        edgeTypeOptions: edgeTypeSwitchOptions,
                        edgeDataByType: {
                          [edgeExampleModeRec]: createDefaultEditableRecEdgeData(),
                          [edgeExampleModeBezier]: createDefaultEditableBezierEdgeData(),
                          default: {},
                        },
                        onEdgeTypeSwitch,
                      }),
                    }
                  : createDefaultEditableRecEdgeData(),
          },
          existingEdges
        )
      ),
    [mode, onEdgeTypeSwitch, setEdges]
  );

  const flowBody = (
    <div className="edge-example-viewport">
      <div className="flow-wrapper">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onPaneClick={handlePaneClick}
        onNodeClick={handleNodeClick}
        panOnDrag={!isControlPointDragging}
        zoomOnScroll={false}
        zoomOnPinch={false}
        panOnScroll={false}
        preventScrolling={false}
        fitView
      >
        <Controls />
        <MiniMap />
        <Background gap={12} size={1} />
      </ReactFlow>
      </div>
    </div>
  );
  const wrappedFlowBody =
    mode === edgeExampleModeBezier ? (
      <EdgeBezierMenuContext.Provider value={edgeMenuContextValue}>{flowBody}</EdgeBezierMenuContext.Provider>
    ) : mode === edgeExampleModeSwitcher ? (
      <EdgeRecMenuContext.Provider value={edgeMenuContextValue}>
        <EdgeBezierMenuContext.Provider value={edgeMenuContextValue}>
          {flowBody}
        </EdgeBezierMenuContext.Provider>
      </EdgeRecMenuContext.Provider>
    ) : (
      <EdgeRecMenuContext.Provider value={edgeMenuContextValue}>{flowBody}</EdgeRecMenuContext.Provider>
    );

  return (
    <div className="edge-example-block">
      <div className="edge-example-block-title">{title}</div>
      {wrappedFlowBody}
      {menuOverlay}
    </div>
  );
}

export default function EdgeExample() {
  return (
    <div className="edge-example-root">
      <EdgeDemoViewport demoKey="rec" title="right-angle edge" mode={edgeExampleModeRec} />
      <EdgeDemoViewport demoKey="bezier" title="bezier edge" mode={edgeExampleModeBezier} />
      <EdgeDemoViewport demoKey="switcher" title="edge switcher" mode={edgeExampleModeSwitcher} />
    </div>
  );
}
