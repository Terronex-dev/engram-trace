# Contributing to Engram Trace

## Development

```bash
git clone https://github.com/Terronex-dev/engram-trace.git
cd engram-trace
npm install
npm test
npm run build
```

## Structure

```
src/
  index.ts          Main exports
  trace.ts          MemoryTrace class (autonomous agent memory)
  classifier.ts     Heuristic importance classification
  consolidator.ts   5-phase consolidation pipeline
  embedder.ts       Embedding provider interface
  types.ts          TypeScript interfaces
tests/
  classifier.test.ts
  trace.test.ts
```

## Code Style

- TypeScript strict mode, ESM (NodeNext)
- Named exports only

## License

MIT. Contributions licensed under MIT.
