# react-flow-comp-misc

this project is for miscellaneous react-flow based components and related demos.

## test examples for components

all demo entries are maintained in `./src/App.jsx` via `exampleItems`.

for a component series, keep one top-level example entry in `exampleItems`, and move scenario-specific data/config into the series folder, such as `./src/er-chart/example.jsx`.

to run dev examples, use `pnpm run dev`.

## component naming and structure

for each series folder, expose one external component with stable name, for example:

- `ERChart` is the external component used by other code: `<ERChart ... />`
- internal pieces like table node renderer can stay in the same file as named exports, such as `ERTable`

example-only mock data must stay out of the component implementation file.

## exports

if this project is used as package later, export components from root entry only, and importer should consume one component entry without importing css separately.
