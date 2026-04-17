# Scene Data Standard

All graph examples should use one scene object per example id in MobX, with this YAML shape.

```yaml
sceneById:
  basicFlowId:
    nodes:
      - id: "1"
        type: "default"
        position:
          x: 0
          y: 0
        data:
          label: "Start Node"
    edges:
      - id: "e1-2"
        type: "smoothstep"
        source: "1"
        target: "2"
        sourceHandle: null
        targetHandle: null
        data: {}
```

Node standard:

```yaml
id: "<string>"
type: "<node type string>" # default | custom | circle | tripleHandle | resizable | basicEdgeNode
position:
  x: <number>
  y: <number>
data: <object>
style: <object, optional>
```

Edge standard:

```yaml
id: "<string>"
type: "<edge type string>" # default | smoothstep | step | editableBezier
source: "<node id>"
target: "<node id>"
sourceHandle: "<string|null>"
targetHandle: "<string|null>"
data:
  controlPoints: # only for editableBezier
    - x: <number>
      y: <number>
```
