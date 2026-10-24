// Turns raw text into atomic memories and decides how a new memory relates to old ones.
// ClaudeJudge uses structured outputs; HeuristicJudge keeps Déjà useful without an API key.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { KINDS, type Kind } from './types.ts';

export const RELATIONS = ['same', 'updates', 'contradicts', 'supports', 'unrelated'] as const;
export type Relation = (typeof RELATIONS)[number];

export interface Atom {
  content: string;
  kind: Kind;
}

export interface Candidate {
  id: string;
  content: string;
  createdAt: string;
  distance: number;
}

export interface Verdict {
  id: string;
  relation: Relation;
  reason: string;
  confidence: number;
}

export interface Judge {
  readonly name: string;
  extract(text: string, hintKind?: Kind): Promise<Atom[]>;
  relate(incoming: string, candidates: Candidate[]): Promise<Verdict[]>;
}

// ---------- heuristics ----------

const KIND_PATTERNS: [Kind, RegExp][] = [
  ['preference', /\b(prefer|prefers|like|likes|hate|hates|dislike|want|wants|favou?rite|always|never)\b/i],
  ['decision', /\b(decided|decide|chose|choose|going with|we will|we'll|agreed|picked|switched|moved|migrated)\b/i],
  ['convention', /\b(we use|use|uses|convention|naming|style|format|lint|must|should|run|runs)\b/i],
  ['person', /\b(is our|is the|works on|owns|maintainer|teammate|manager|lead)\b/i],
  ['event', /\b(yesterday|today|tomorrow|last week|deployed|released|shipped|broke|incident|meeting)\b/i],
];

export function guessKind(text: string): Kind {
  for (const [kind, re] of KIND_PATTERNS) if (re.test(text)) return kind;
  return 'fact';
}

const CHANGE_WORDS = /\b(switched|switch|moved|move|migrated|migrate|replaced|replace|instead|no longer|not anymore|anymore|now use|now uses|now|deprecated|dropped|changed|renamed)\b/i;
const NEGATION = /\b(not|never|no|don't|doesn't|didn't|stop|stopped|avoid)\b/i;

/** Cosine-distance cutoffs. Calibrated for nomic-embed-text; tests pass looser ones for the hash embedder. */
export interface Thresholds {
  /** Below this, two memories are the same memory. */
  duplicate: number;
  /** Below this, a memory is a candidate for the relation judge. */
  candidate: number;
  /** Heuristic judge only: below this, change language means "updates". */
  update: number;
  /** Heuristic judge only: below this, memories are closely related. */
  related: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = { duplicate: 0.06, candidate: 0.35, update: 0.3, related: 0.25 };

export class HeuristicJudge implements Judge {
  readonly name: string = 'heuristic';
  constructor(private t: Thresholds = DEFAULT_THRESHOLDS) {}

  async extract(text: string, hintKind?: Kind): Promise<Atom[]> {
    const content = text.trim().replace(/\s+/g, ' ');
    return content ? [{ content, kind: hintKind ?? guessKind(content) }] : [];
  }

  async relate(incoming: string, candidates: Candidate[]): Promise<Verdict[]> {
    return candidates.map((c) => {
      if (c.distance < this.t.duplicate) {
        return { id: c.id, relation: 'same', reason: 'Near-identical wording.', confidence: 0.9 };
      }
      if (c.distance < this.t.update && CHANGE_WORDS.test(incoming)) {
        return { id: c.id, relation: 'updates', reason: 'Newer statement signals a change.', confidence: 0.6 };
      }
      if (c.distance < this.t.related && NEGATION.test(incoming) !== NEGATION.test(c.content)) {
        return { id: c.id, relation: 'contradicts', reason: 'One statement negates the other.', confidence: 0.5 };
      }
      if (c.distance < this.t.related) {
        return { id: c.id, relation: 'supports', reason: 'Closely related.', confidence: 0.5 };
      }
      return { id: c.id, relation: 'unrelated', reason: '', confidence: 0.5 };
    });
  }
}

// ---------- Claude ----------

const AtomsSchema = z.object({
  memories: z.array(
    z.object({
      content: z.string().describe('One self-contained sentence that will still make sense months later.'),
      kind: z.enum(KINDS),
    }),
  ),
});

const VerdictsSchema = z.object({
  verdicts: z.array(
    z.object({
      id: z.string(),
      relation: z.enum(RELATIONS),
      reason: z.string().describe('One short sentence a human can read in a UI.'),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

const EXTRACT_SYSTEM = `You are the memory encoder for an AI coding agent's long-term memory.
Split the input into atomic, durable memories: facts about the project or user, preferences,
decisions, conventions, people, and notable events. Each memory is one self-contained sentence
written in the third person or as a team statement ("The team uses pnpm", "Yash prefers tabs").
Resolve pronouns and relative references so the sentence stands alone. Drop chit-chat, transient
task state, and anything that will not matter in a week. Never invent facts. If nothing is worth
remembering, return an empty list.
Kinds: fact (true statement about the world/project), preference (what a person likes or wants),
decision (a choice that was made), convention (how things are done here), person (who someone is),
event (something that happened at a point in time).`;

const RELATE_SYSTEM = `You maintain an AI agent's long-term memory and decide how a NEW memory relates
to each EXISTING memory. For every existing memory return exactly one relation:
- same: says the same thing (possibly reworded). Nothing new.
- updates: the new memory replaces the old one because something changed (a migration, a new
  decision, a renamed thing, a changed preference). The old one is no longer true.
- contradicts: they conflict and it is genuinely unclear which is true (no signal of change).
- supports: compatible and closely related; adds detail.
- unrelated: different topics even if they share words.
Prefer "updates" over "contradicts" whenever the new memory implies a change over time.
Existing memories include when they were stored.`;

export class ClaudeJudge implements Judge {
  readonly name = 'claude';
  private client: Anthropic;
  private fallback = new HeuristicJudge();

  constructor(apiKey: string, private model: string) {
    this.client = new Anthropic({ apiKey });
  }

  async extract(text: string, hintKind?: Kind): Promise<Atom[]> {
    // One short sentence is already atomic; don't spend a model call on it.
    if (text.length < 140 && !/[.;!?]\s+\S/.test(text.trim())) return this.fallback.extract(text, hintKind);
    try {
      const res = await this.client.messages.parse({
        model: this.model,
        max_tokens: 4000,
        output_config: { effort: 'low', format: zodOutputFormat(AtomsSchema) },
        system: EXTRACT_SYSTEM,
        messages: [{ role: 'user', content: `<input>\n${text}\n</input>` }],
      });
      if (res.stop_reason === 'refusal' || !res.parsed_output) return this.fallback.extract(text, hintKind);
      const atoms = res.parsed_output.memories.filter((m) => m.content.trim());
      return hintKind && atoms.length === 1 ? [{ ...atoms[0]!, kind: hintKind }] : atoms;
    } catch (err) {
      console.error('[deja] extract failed, using heuristic:', (err as Error).message);
      return this.fallback.extract(text, hintKind);
    }
  }

  async relate(incoming: string, candidates: Candidate[]): Promise<Verdict[]> {
    if (candidates.length === 0) return [];
    const existing = candidates
      .map((c) => `<memory id="${c.id}" stored="${c.createdAt}">${c.content}</memory>`)
      .join('\n');
    try {
      const res = await this.client.messages.parse({
        model: this.model,
        max_tokens: 4000,
        output_config: { effort: 'low', format: zodOutputFormat(VerdictsSchema) },
        system: RELATE_SYSTEM,
        messages: [
          {
            role: 'user',
            content: `<new stored="${new Date().toISOString()}">${incoming}</new>\n<existing>\n${existing}\n</existing>`,
          },
        ],
      });
      if (res.stop_reason === 'refusal' || !res.parsed_output) return this.fallback.relate(incoming, candidates);
      const byId = new Map(res.parsed_output.verdicts.map((v) => [v.id, v]));
      // Keep only verdicts for ids we asked about; heuristic-fill anything the model skipped.
      const heuristic = await this.fallback.relate(incoming, candidates);
      return candidates.map((c, i) => byId.get(c.id) ?? heuristic[i]!);
    } catch (err) {
      console.error('[deja] relate failed, using heuristic:', (err as Error).message);
      return this.fallback.relate(incoming, candidates);
    }
  }
}
