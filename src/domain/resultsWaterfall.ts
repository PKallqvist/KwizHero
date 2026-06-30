import type { ParticipantResult, TiebreakerResolutionRule } from "./types";

export interface ParticipantScoreInput {
  participantId: string;
  nickname: string;
  score: number;
  totalQuestions: number;
  tiebreakerGuess?: number | null;
}

export interface TiebreakerInput {
  correctValue: number;
  resolutionRule: TiebreakerResolutionRule;
}

export interface ResolveResultsInput {
  quizId: string;
  participants: ParticipantScoreInput[];
  tiebreaker: TiebreakerInput | null;
  lotterySeed: string;
}

interface ScoreGroup {
  score: number;
  participants: ParticipantScoreInput[];
}

/** Stage 1 — rank all participants by score, descending, grouping exact ties. */
export function stage1RankByScore(participants: ParticipantScoreInput[]): ScoreGroup[] {
  const groups = new Map<number, ParticipantScoreInput[]>();
  for (const participant of participants) {
    const list = groups.get(participant.score) ?? [];
    list.push(participant);
    groups.set(participant.score, list);
  }
  return Array.from(groups.entries())
    .sort(([scoreA], [scoreB]) => scoreB - scoreA)
    .map(([score, list]) => ({ score, participants: list }));
}

function displayDistance(guess: number, correctValue: number): number {
  return Math.abs(guess - correctValue);
}

/** Ranking eligibility distance — null means disqualified from tiebreak ordering (falls through to lottery). */
function rankingDistance(guess: number, tiebreaker: TiebreakerInput): number | null {
  if (tiebreaker.resolutionRule === "closest_under") {
    return guess > tiebreaker.correctValue ? null : tiebreaker.correctValue - guess;
  }
  return displayDistance(guess, tiebreaker.correctValue);
}

/**
 * Stage 2 — within a tied score group, order by closeness to the tiebreaker's correctValue.
 * Returns clusters in resolved order; a cluster with more than one participant is still tied
 * (identical guess, or no usable guess) and falls through to stage 3.
 */
export function stage2ResolveTiebreaker(
  group: ParticipantScoreInput[],
  tiebreaker: TiebreakerInput | null
): ParticipantScoreInput[][] {
  if (group.length <= 1 || !tiebreaker) return [group];

  const withDistance = group.map((participant) => ({
    participant,
    distance:
      participant.tiebreakerGuess === null || participant.tiebreakerGuess === undefined
        ? null
        : rankingDistance(participant.tiebreakerGuess, tiebreaker),
  }));

  const ranked = withDistance
    .filter((entry) => entry.distance !== null)
    .sort((a, b) => (a.distance as number) - (b.distance as number));
  const unranked = withDistance.filter((entry) => entry.distance === null).map((entry) => entry.participant);

  const clusters: ParticipantScoreInput[][] = [];
  let i = 0;
  while (i < ranked.length) {
    const distance = ranked[i].distance;
    const cluster = [ranked[i].participant];
    let j = i + 1;
    while (j < ranked.length && ranked[j].distance === distance) {
      cluster.push(ranked[j].participant);
      j += 1;
    }
    clusters.push(cluster);
    i = j;
  }
  if (unranked.length > 0) clusters.push(unranked);
  return clusters;
}

function hashStringToSeed(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return function next(): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stage 3 — deterministic, seeded random order for participants still tied after stage 2. */
export function stage3LotteryFallback<T>(group: T[], seed: string): T[] {
  if (group.length <= 1) return [...group];
  const rng = mulberry32(hashStringToSeed(seed));
  const shuffled = [...group];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function buildResult(params: {
  participant: ParticipantScoreInput;
  quizId: string;
  rank: number;
  tiebreaker: TiebreakerInput | null;
  resolvedByLottery: boolean;
  tiedGroupSize?: number;
}): ParticipantResult {
  const { participant, quizId, rank, tiebreaker, resolvedByLottery, tiedGroupSize } = params;
  const hasGuess = participant.tiebreakerGuess !== null && participant.tiebreakerGuess !== undefined;
  return {
    participantId: participant.participantId,
    quizId,
    nickname: participant.nickname,
    score: participant.score,
    totalQuestions: participant.totalQuestions,
    rank,
    tiebreakerGuess: hasGuess ? (participant.tiebreakerGuess as number) : undefined,
    tiebreakerDistance:
      hasGuess && tiebreaker ? displayDistance(participant.tiebreakerGuess as number, tiebreaker.correctValue) : undefined,
    resolvedByLottery,
    ...(tiedGroupSize !== undefined ? { tiedGroupSize } : {}),
  };
}

/**
 * Runs the full waterfall (score ranking -> tiebreaker -> lottery) and returns a unique,
 * fully-ordered rank per participant. A lottery-decided top spot is still a full win
 * (rank 1, resolvedByLottery: true) — the lottery only breaks ordering, never the score
 * or tiebreaker facts.
 */
export function resolveResults(input: ResolveResultsInput): ParticipantResult[] {
  const scoreGroups = stage1RankByScore(input.participants);
  const results: ParticipantResult[] = [];
  let rank = 1;

  for (const group of scoreGroups) {
    const tiedGroupSize = group.participants.length;

    if (tiedGroupSize === 1) {
      results.push(
        buildResult({
          participant: group.participants[0],
          quizId: input.quizId,
          rank,
          tiebreaker: input.tiebreaker,
          resolvedByLottery: false,
        })
      );
      rank += 1;
      continue;
    }

    const tiebreakClusters = stage2ResolveTiebreaker(group.participants, input.tiebreaker);

    for (const cluster of tiebreakClusters) {
      if (cluster.length === 1) {
        results.push(
          buildResult({
            participant: cluster[0],
            quizId: input.quizId,
            rank,
            tiebreaker: input.tiebreaker,
            resolvedByLottery: false,
            tiedGroupSize,
          })
        );
        rank += 1;
        continue;
      }

      const ordered = stage3LotteryFallback(cluster, `${input.lotterySeed}:${rank}`);
      for (const participant of ordered) {
        results.push(
          buildResult({
            participant,
            quizId: input.quizId,
            rank,
            tiebreaker: input.tiebreaker,
            resolvedByLottery: true,
            tiedGroupSize,
          })
        );
        rank += 1;
      }
    }
  }

  return results;
}
