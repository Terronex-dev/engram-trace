# Engram Trace -- Roadmap

Development roadmap for `@terronex/engram-trace`, the autonomous memory intelligence SDK for AI agents.

## Current Status: v0.1.0 (Foundation)

Core architecture implemented. Heuristic classifier, consolidation engine, multi-provider embedding and LLM support. Not yet published to NPM.

---

## v0.1.0 -- Foundation (Current)

**Status:** In Development

- [x] Core `EngramTrace` class with full lifecycle (init, process, recall, close)
- [x] Heuristic importance classifier (regex patterns, no LLM dependency)
- [x] Embedding deduplication before storage
- [x] Multi-provider embedder (local/Ollama/OpenAI)
- [x] Multi-provider LLM (Ollama/Anthropic/OpenAI)
- [x] Consolidation engine (decay, dedup, cluster, summarize, archive)
- [x] Bootstrap context generation (4-query session start)
- [x] Forget API (GDPR compliance, corrections)
- [x] Memory tier system (HOT/WARM/COLD/ARCHIVE)
- [x] Stats and export utilities
- [x] TypeScript with full type definitions
- [ ] Test suite (unit + integration)
- [ ] Verify @terronex/engram save/load compatibility
- [ ] First integration test with a real agent

## v0.2.0 -- Hardening

**Goal:** Production-ready reliability

- [ ] Comprehensive test suite (>90% coverage)
  - [ ] Classifier accuracy tests against labeled conversation corpus
  - [ ] Consolidation correctness (no data loss, proper merging)
  - [ ] Persistence round-trip (save -> load -> verify all fields)
  - [ ] Edge cases (empty file, corrupt file, concurrent access)
- [ ] Write buffering (batch disk writes, don't write on every remember)
- [ ] Graceful degradation when engram format import fails (JSON fallback)
- [ ] Error recovery (corrupt .engram file detection + repair)
- [ ] Memory compaction during save (remove archived embeddings to shrink file)
- [ ] Configurable logging (structured, levels, pluggable)
- [ ] Performance benchmarks as part of CI

## v0.3.0 -- Classification Intelligence

**Goal:** Smarter importance detection without requiring an LLM

- [ ] Contextual importance scoring (same fact has higher importance if user repeats it)
- [ ] Contradiction detection (new memory contradicts existing one -> flag for review)
- [ ] Entity extraction (detect names, dates, URLs, code identifiers)
- [ ] Structured memory types (decision, preference, fact, lesson, identity, task)
- [ ] Configurable pattern sets (users can add domain-specific patterns)
- [ ] Optional LLM classifier mode (`classifier: 'llm'` config option)
- [ ] Classifier accuracy benchmarking tool

## v0.4.0 -- Agent Integration Kit

**Goal:** Drop-in integration for popular agent frameworks

- [ ] OpenClaw plugin (replace markdown memory system)
  - [ ] Auto-remember hook in conversation loop
  - [ ] Bootstrap replaces MEMORY.md / daily log reads
  - [ ] Consolidation on heartbeat
  - [ ] Migration tool: markdown + aifbin -> .engram
- [ ] LangChain memory adapter
- [ ] LlamaIndex memory adapter
- [ ] Generic webhook interface (POST /process, GET /recall)
- [ ] CLI tool for inspecting/querying .engram files from terminal

## v0.5.0 -- Advanced Consolidation

**Goal:** Human-level memory curation quality

- [ ] Multi-pass consolidation (summarize, then re-cluster summaries)
- [ ] Importance promotion (memories recalled frequently auto-promote to permanent)
- [ ] Temporal narrative (consolidation preserves chronological story, not just facts)
- [ ] Selective forgetting (consolidator identifies genuinely obsolete memories)
- [ ] Consolidation preview (dry-run mode that shows what would change)
- [ ] Consolidation hooks (pre/post callbacks for custom logic)
- [ ] A/B testing framework for consolidation strategies

## v0.6.0 -- Multi-Brain

**Goal:** Shared knowledge across agents

- [ ] Read-only shared brains (agent mounts a team brain for reference)
- [ ] Brain merging (combine two .engram files intelligently)
- [ ] Scoped memories (tag memories as private vs shareable)
- [ ] Brain diffing (compare two .engram files, show what's different)
- [ ] Import from external sources (markdown, JSON, CSV, SQLite)

## v1.0.0 -- Production Release

**Goal:** Stable, documented, battle-tested

- [ ] Stable API (no breaking changes after 1.0)
- [ ] Published to NPM as @terronex/engram-trace
- [ ] Full documentation with examples for 5+ frameworks
- [ ] Performance guarantees (latency SLAs for recall, process, consolidate)
- [ ] Security audit (no PII leaks, embedding inversion resistance)
- [ ] Migration guides from common memory systems (Mem0, Zep, ChromaDB)
- [ ] Logo and branding

---

## Future (Post 1.0)

### Engram Trace Cloud

Hosted consolidation service. Agents send memories to the cloud for GPU-accelerated consolidation and cross-device sync. Privacy-first: zero-knowledge encryption option.

### Engram Trace Studio

Desktop GUI for inspecting, editing, and visualizing agent memories. Brain explorer with cluster visualization, timeline view, importance heatmaps.

### Marketplace Integration

Agent brain marketplace where developers publish and sell curated .engram knowledge bases. Domain-specific brains (legal, medical, engineering) that any agent can mount as reference memory.

---

## Design Principles

1. **Zero config by default.** `new EngramTrace({ file: 'x.engram' })` must work with no other setup.

2. **No external services required.** Everything runs locally. Cloud providers are optional upgrades.

3. **Graceful degradation.** No LLM? Consolidation still works (dedup + decay, no summarization). No internet? Local embeddings still work. Corrupt file? JSON fallback.

4. **Single file, portable.** One .engram file contains everything. Copy it to another machine and the agent picks up where it left off.

5. **Privacy first.** Data never leaves the machine unless explicitly configured. No telemetry, no analytics, no phone-home.

6. **Agent-agnostic.** Works with any framework, any LLM, any language (via the .engram format spec). The TypeScript SDK is the reference implementation.
