# Changelog

## 0.1.0 (2026-02-22)

### Features

- Autonomous memory management: auto-remember, auto-consolidate, semantic recall
- Heuristic importance classifier (no LLM needed per turn)
- 5-phase consolidation pipeline: decay, dedup, cluster, summarize, archive
- Temporal decay with access frequency and importance modifiers
- Deduplication at cosine similarity > 0.92
- Clustering at similarity > 0.78 (min 3 per cluster)
- Optional LLM summarization for cluster merging
- Bootstrap from existing .engram files
- Memory statistics and health reporting
- TypeScript strict, ESM, full type exports
- 12/12 tests passing
