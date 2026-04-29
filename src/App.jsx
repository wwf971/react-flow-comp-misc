import { useMemo, useState } from 'react';
import { PanelDual } from '@wwf971/react-comp-misc';
import './App.css';
import './examples/examples.css';
import BasicFlow from './examples/0-basic';
import HandleCustomFlow from './examples/1-handle-custom';
import NodeDragResizeFlow from './examples/2-node-drag-to-resize.jsx';
import NodeTextEditableFlow from './examples/3-node-text-editable.jsx';
import InteractiveFlow from './examples/4-interactive.jsx';
import LayoutFlow from './examples/5-layouting.jsx';
import EdgeExample from './edges/example.jsx';
import ERChartExample from './er-chart/example.jsx';
import SlidesExample from './slides/slides/example.jsx';
import { GraphStoreProvider } from './storeMobx';

const exampleItems = [
  {
    key: 'basic',
    label: 'Basic Flow',
    description: 'Basic nodes and edges.',
    component: BasicFlow,
  },
  {
    key: 'handles',
    label: 'Handles',
    description: 'Custom handles and connections.',
    component: HandleCustomFlow,
  },
  {
    key: 'resize-node',
    label: 'Node Resize',
    description: 'Resize nodes by dragging their border handles.',
    component: NodeDragResizeFlow,
  },
  {
    key: 'editable',
    label: 'Editable Nodes',
    description: 'Edit node text inline.',
    component: NodeTextEditableFlow,
  },
  {
    key: 'interactive',
    label: 'Interactive',
    description: 'Add, select, and remove nodes.',
    component: InteractiveFlow,
  },
  {
    key: 'layouting',
    label: 'Layouting',
    description: 'Apply graph layout patterns.',
    component: LayoutFlow,
  },
  {
    key: 'edges',
    label: 'Edges',
    description: 'Bezier, right-angle, and per-edge switcher demos.',
    component: EdgeExample,
  },
  {
    key: 'er-table',
    label: 'ER Chart',
    description: 'Database tables with row-level custom handles and relationships.',
    component: ERChartExample,
  },
  {
    key: 'slide-system',
    label: 'Slide + MobX',
    description: 'Slides -> Slide -> Container -> Comp render hierarchy.',
    component: SlidesExample,
  },
];

function App() {
  const [selectedExampleKey, setSelectedExampleKey] = useState('basic');
  const [searchText, setSearchText] = useState('');
  const selectedExample =
    exampleItems.find((item) => item.key === selectedExampleKey) ?? exampleItems[0];

  const filteredItems = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) return exampleItems;
    return exampleItems.filter((item) => {
      return (
        item.label.toLowerCase().includes(keyword) ||
        item.description.toLowerCase().includes(keyword)
      );
    });
  }, [searchText]);
  const SelectedComponent = selectedExample.component;

  return (
    <div className="dev-page">
      <PanelDual orientation="vertical" initialWidth={280}>
        <div className="dev-sidebar">
          <div className="dev-sidebar-header">
            <div className="dev-title">React Flow Examples</div>
          </div>
          <div className="dev-search-wrap">
            <input
              className="dev-search-input"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search examples..."
            />
          </div>
          <div className="dev-item-list">
            {filteredItems.map((item) => {
              const isSelected = item.key === selectedExample.key;
              return (
                <button
                  key={item.key}
                  className={`dev-item-btn ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => setSelectedExampleKey(item.key)}
                >
                  <div className="dev-item-label">{item.label}</div>
                  <div className="dev-item-desc">{item.description}</div>
                </button>
              );
            })}
          </div>
        </div>
        <div className="dev-content">
          <div className="dev-content-header">
            <div className="dev-content-title">{selectedExample.label}</div>
            <div className="dev-content-desc">{selectedExample.description}</div>
          </div>
          <div className="dev-content-demo">
            <GraphStoreProvider>
              <SelectedComponent />
            </GraphStoreProvider>
          </div>
        </div>
      </PanelDual>
    </div>
  );
}

export default App;
