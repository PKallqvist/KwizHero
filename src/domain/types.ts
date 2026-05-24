export type RevealMode = "instant" | "on_completion" | "scheduled";

export interface Ruleset {
  openAt: string;
  closeAt: string;
  questionTimeLimitSeconds: number;
  revealMode: RevealMode;
  revealAt: string | null;
  waypointGateRadiusMeters: number;
  scoringStrategy: "binary_correct_1_point";
}

export interface DraftQuestionInput {
  text: string;
  choices: [string, string, string, string];
  correctIndex: number;
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
  text: string;
  choices: QuestionChoice[];
  pointsIfCorrect: number;
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
