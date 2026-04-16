import { useState } from 'react';
import './App.css';
import './examples/examples.css';
import BasicFlow from './examples/0-basic';
import HandleCustomFlow from './examples/1-handle-custom';
import JotaiFlow from './examples/0b-jotai.jsx';
import NodeTextEditableFlow from './examples/3-node-text-editable.jsx';
import InteractiveFlow from './examples/interactive/InteractiveFlow';
import LayoutFlow from './examples/layouting/LayoutFlow';

const examples = [
  { id: 'basic', name: 'Basic Flow', component: BasicFlow },
  { id: 'handles', name: 'Handles', component: HandleCustomFlow },
  { id: 'jotai', name: 'Jotai', component: JotaiFlow },
  { id: 'custom', name: 'Custom Nodes', component: NodeTextEditableFlow },
  { id: 'interactive', name: 'Interactive', component: InteractiveFlow },
  { id: 'layout', name: 'Layout', component: LayoutFlow },
];

function App() {
  const [activeExample, setActiveExample] = useState('basic');
  const ActiveComponent = examples.find((ex) => ex.id === activeExample)?.component;

  return (
    <div className="app-container">
      <div className="header">
        <div className="title">React Flow Examples</div>
        <div className="nav">
          {examples.map((example) => (
            <button
              key={example.id}
              className={activeExample === example.id ? 'nav-btn active' : 'nav-btn'}
              onClick={() => setActiveExample(example.id)}
            >
              {example.name}
            </button>
          ))}
        </div>
      </div>
      <div className="content">
        {ActiveComponent && <ActiveComponent />}
      </div>
    </div>
  );
}

export default App;
