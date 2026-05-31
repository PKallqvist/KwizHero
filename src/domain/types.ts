export type RevealMode = "instant" | "on_completion" | "scheduled";
export type QuestionType = "multiple_choice" | "numeric" | "letter_order";
export type RouteMode = "none" | "crow" | "urban" | "hiking" | "manual";
export type QuestionOrderMode = "fixed" | "any";

export interface QuestionConfig {
  timerSeconds: number | null;
  numericTolerance: number | null;
}

export interface Ruleset {
  openAt: string;
  closeAt: string;
  questionTimeLimitSeconds: number | null;
  interQuestionTimeLimitSeconds: number | null;
  revealMode: RevealMode;
  revealAt: string | null;
  waypointGateRadiusMeters: number;
  requireSequentialWaypoints: boolean;
  routeMode: RouteMode;
  routeLegModes: RouteMode[];
  routeLegCoordinates: Array<Array<{ lat: number; lng: number }>>;
  questionOrderMode: QuestionOrderMode;
  scoringStrategy: "binary_correct_1_point";
}

export interface DraftQuestionInput {
  questionType: QuestionType;
  text: string;
  choices: string[];
  correctChoiceIndexes: number[];
  numericAnswer: number | null;
  letterOrderAnswer: string | null;
  funFact?: string;
  sourceUrl?: string;
  config: QuestionConfig;
}

export interface UserTokens {
  aiTokens: number;
  aiTokensGranted: number;
  aiTokensPurchased: number;
  aiTokensUsed: number;
  aiTokensResetDate: string | null;
}

export interface DraftWaypointInput {
  name: string;
  lat: number;
  lng: number;
  questions: DraftQuestionInput[];
}

export interface QuizDraftInput {
  title: string;
  description: string;
  isPublic: boolean;
  accessCode: string | null;
  locale: "en" | "sv";
  organizerName: string | null;
  organizerAvatarUrl: string | null;
  organizerSwish: string | null;
  isAnonymous: boolean;
  waypoints: DraftWaypointInput[];
  ruleset: Ruleset;
}

export interface QuizSummary {
  id: string;
  title: string;
  description: string;
  status: "draft" | "published";
  isPublic: boolean;
  accessCode: string | null;
  validUntil: string;
  creatorUid?: string;
  organizerName: string | null;
  organizerAvatarUrl: string | null;
  organizerSwish: string | null;
  isAnonymous: boolean;
  openAt: string;
  closeAt: string;
  questionTimeLimitSeconds: number | null;
  interQuestionTimeLimitSeconds: number | null;
  revealMode: RevealMode;
  revealAt: string | null;
  waypointGateRadiusMeters: number;
  requireSequentialWaypoints: boolean;
  routeMode: RouteMode;
  questionOrderMode: QuestionOrderMode;
}

export interface QuizListItem {
  id: string;
  title: string;
  description: string;
  status: "draft" | "published";
  isPublic: boolean;
  accessCode: string | null;
  validUntil: string | null;
  waypointCount: number;
  routeDistanceKm?: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface LeaderboardEntry {
  id: string;
  nickname: string;
  score: number;
  completedAt: string | null;
}

export interface QuizWalkQuestion {
  id: string;
  order: number;
  questionType: QuestionType;
  text: string;
  funFact?: string;
  sourceUrl?: string;
  choices: QuestionChoice[];
  pointsIfCorrect: number;
  config: QuestionConfig;
}

export interface QuizWalkWaypoint {
  id: string;
  order: number;
  title: string;
  lat: number;
  lng: number;
  questions: QuizWalkQuestion[];
}

export interface QuizWalk {
  quizId: string;
  title: string;
  waypoints: QuizWalkWaypoint[];
}

export interface Waypoint {
  id: string;
  title: string;
  lat: number;
  lng: number;
  gateRadiusMeters: number;
}

export interface QuestionChoice {
  id: string;
  text: string;
}

export interface WaypointQuestion {
  id: string;
  questionType: QuestionType;
  text: string;
  funFact?: string;
  sourceUrl?: string;
  choices: QuestionChoice[];
  pointsIfCorrect: number;
  config: QuestionConfig;
}

export interface FirstPlayable {
  waypoint: Waypoint;
  question: WaypointQuestion;
}

export interface AnswerResult {
  isCorrect: boolean;
  pointsAwarded: number;
  score: number;
}

export interface PlayerEarnedBadge {
  id: string;
  badgeId: string;
  type: "tiered" | "discovery";
  tier: number | null;
  xpReward: number;
  imageKey: string | null;
  earnedAt: string | null;
}
