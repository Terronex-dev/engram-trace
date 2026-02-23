import { describe, it, expect } from 'vitest';
import { Classifier } from '../src/classifier.js';

describe('Classifier', () => {
  const classifier = new Classifier();

  describe('skip patterns', () => {
    it('skips greetings', async () => {
      const r = await classifier.classify('hello there!', 'Hi! How can I help?');
      expect(r.shouldRemember).toBe(false);
    });

    it('skips acknowledgments', async () => {
      const r = await classifier.classify('ok', 'Got it.');
      expect(r.shouldRemember).toBe(false);
    });

    it('skips very short messages', async () => {
      const r = await classifier.classify('yes', 'Sure.');
      expect(r.shouldRemember).toBe(false);
    });

    it('skips filler', async () => {
      const r = await classifier.classify('let me check', 'Working on it.');
      expect(r.shouldRemember).toBe(false);
    });
  });

  describe('high importance', () => {
    it('detects explicit remember commands', async () => {
      const r = await classifier.classify(
        'Remember that my API key is sk-123',
        'Noted, I will remember your API key.'
      );
      expect(r.shouldRemember).toBe(true);
      expect(r.importance).toBeGreaterThanOrEqual(0.9);
      expect(r.suggestedTags).toContain('explicit');
    });

    it('detects decisions', async () => {
      const r = await classifier.classify(
        'We decided to use MIT license for all repos',
        'MIT license it is. Applied across the board.'
      );
      expect(r.shouldRemember).toBe(true);
      expect(r.importance).toBeGreaterThanOrEqual(0.8);
      expect(r.suggestedTags).toContain('decision');
    });

    it('detects lessons learned', async () => {
      const r = await classifier.classify(
        'The problem was that msgpackr corrupts Float32Array',
        'Good catch. We need to serialize as number[] instead.'
      );
      expect(r.shouldRemember).toBe(true);
      expect(r.suggestedTags).toContain('lesson');
    });

    it('detects preferences', async () => {
      const r = await classifier.classify(
        'I prefer concise responses without emoji',
        'Understood. I will keep things brief and clean.'
      );
      expect(r.shouldRemember).toBe(true);
      expect(r.suggestedTags).toContain('preference');
    });

    it('detects identity information', async () => {
      const r = await classifier.classify(
        'My name is Jason and I work at Terronex',
        'Nice to meet you, Jason.'
      );
      expect(r.shouldRemember).toBe(true);
      expect(r.suggestedTags).toContain('identity');
    });
  });

  describe('medium importance', () => {
    it('detects factual content', async () => {
      const r = await classifier.classify(
        'The API endpoint is https://api.terronex.dev/v2',
        'Got it, using v2 endpoint.'
      );
      expect(r.shouldRemember).toBe(true);
      expect(r.suggestedTags).toContain('factual');
    });

    it('detects technical discussion', async () => {
      const r = await classifier.classify(
        'What should the database schema look like for the users table?',
        'I would recommend a normalized schema with separate tables for profiles and preferences.'
      );
      expect(r.shouldRemember).toBe(true);
      expect(r.suggestedTags).toContain('technical');
    });
  });

  describe('deduplication', () => {
    it('rejects near-duplicate content', async () => {
      // Create a fake embedding
      const embedding = new Float32Array(384);
      for (let i = 0; i < 384; i++) embedding[i] = Math.random();

      // Same embedding = duplicate
      const r = await classifier.classify(
        'We use MIT license',
        'Yes, MIT for everything.',
        [embedding],
        embedding,
      );
      expect(r.shouldRemember).toBe(false);
      expect(r.reason).toContain('duplicate');
    });
  });
});
