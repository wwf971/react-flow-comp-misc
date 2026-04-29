import { useMemo, useState } from 'react';
import { SegmentedControl } from '@wwf971/react-comp-misc';
import ERChart from './ERChart.jsx';
import { BaseGraphStore, GraphStoreProvider } from '../storeMobx';

const sampleTables = [
  {
    id: 'users',
    tableName: 'users',
    position: { x: 560, y: 80 },
    rows: [
      { id: 'id', keyMark: 'PK', name: 'id', type: 'uuid' },
      { id: 'email', keyMark: '', name: 'email', type: 'varchar' },
      { id: 'displayName', keyMark: '', name: 'display_name', type: 'varchar' },
    ],
  },
  {
    id: 'orders',
    tableName: 'orders',
    position: { x: 140, y: 200 },
    rows: [
      { id: 'id', keyMark: 'PK', name: 'id', type: 'uuid' },
      { id: 'userId', keyMark: 'FK', name: 'user_id', type: 'uuid' },
      { id: 'status', keyMark: '', name: 'status', type: 'varchar' },
      { id: 'createdAt', keyMark: '', name: 'created_at', type: 'timestamp' },
    ],
  },
  {
    id: 'orderItems',
    tableName: 'order_items',
    position: { x: 560, y: 360 },
    rows: [
      { id: 'id', keyMark: 'PK', name: 'id', type: 'uuid' },
      { id: 'orderId', keyMark: 'FK', name: 'order_id', type: 'uuid' },
      { id: 'sku', keyMark: '', name: 'sku', type: 'varchar' },
      { id: 'quantity', keyMark: '', name: 'quantity', type: 'int' },
    ],
  },
];

const sampleRelationships = [
  {
    id: 'rel-orders-user',
    from: { tableId: 'orders', rowId: 'userId', side: 'left' },
    to: { tableId: 'users', rowId: 'id', side: 'right' },
  },
  {
    id: 'rel-orderItems-order',
    from: { tableId: 'orderItems', rowId: 'orderId', side: 'left' },
    to: { tableId: 'orders', rowId: 'id', side: 'right' },
  },
];

class ERChartGraphStore extends BaseGraphStore {}

function ERChartExample() {
  const [edgeMode, setEdgeMode] = useState('edge-rec');
  const edgeModeOptions = useMemo(
    () => [
      { value: 'default', label: 'default' },
      { value: 'edge-bezier', label: 'edge-bezier' },
      { value: 'edge-rec', label: 'edge-rec' },
    ],
    []
  );
  const getComp = useMemo(() => {
    return (name) => {
      if (name === 'edgeMode') return edgeMode;
      return null;
    };
  }, [edgeMode]);

  return (
    <GraphStoreProvider storeFactory={() => new ERChartGraphStore()}>
      <div className="er-chart-example-root">
        <div className="er-chart-example-control">
          <SegmentedControl
            data={edgeMode}
            onChange={setEdgeMode}
            options={edgeModeOptions}
            widthMode="auto"
          />
        </div>
        <ERChart
          key={edgeMode}
          flowId={`erChartExampleFlowId-${edgeMode}`}
          tables={sampleTables}
          relationships={sampleRelationships}
          getComp={getComp}
        />
      </div>
    </GraphStoreProvider>
  );
}

export default ERChartExample;
