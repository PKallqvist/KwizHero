export type RevealMode = "instant" | "on_completion" | "scheduled";
export type QuestionType = "multiple_choice" | "numeric" | "letter_order";

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
  scoringStrategy: "binary_correct_1_point";
}

export interface DraftQuestionInput {
  questionType: QuestionType;
  text: string;
  choices: string[];
  correctChoiceIndexes: number[];
  numericAnswer: number | null;
  letterOrderAnswer: string | null;
  config: QuestionConfig;
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
  locale: "en" | "sv";
  waypoints: DraftWaypointInput[];
  ruleset: Ruleset;
}

export interface QuizSummary {
  id: string;
  title: string;
  description: string;
  status: "draft" | "published";
  openAt: string;
  closeAt: string;
  questionTimeLimitSeconds: number | null;
  interQuestionTimeLimitSeconds: number | null;
  revealMode: RevealMode;
  revealAt: string | null;
  waypointGateRadiusMeters: number;
  requireSequentialWaypoints: boolean;
}

export interface QuizWalkQuestion {
  id: string;
  order: number;
  questionType: QuestionType;
  text: string;
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
