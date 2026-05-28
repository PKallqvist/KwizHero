import { createContext, useContext, useState, type ReactNode } from "react";

export interface ActiveQuizSession {
  quizName: string;
  progressLabel: string;
}

export interface PlayerAmbientProfile {
  xpTotal: number;
  streakDays: number;
}

const DEFAULT_PROFILE: PlayerAmbientProfile = {
  xpTotal: 1240,
  streakDays: 7,
};

interface QuizSessionContextValue {
  session: ActiveQuizSession | null;
  setSession: (session: ActiveQuizSession | null) => void;
  profile: PlayerAmbientProfile;
  setProfile: (profile: PlayerAmbientProfile) => void;
}

const QuizSessionContext = createContext<QuizSessionContextValue>({
  session: null,
  setSession: () => {},
  profile: DEFAULT_PROFILE,
  setProfile: () => {},
});

export function QuizSessionProvider({ children }: { children: ReactNode }): JSX.Element {
  const [session, setSession] = useState<ActiveQuizSession | null>(null);
  const [profile, setProfile] = useState<PlayerAmbientProfile>(DEFAULT_PROFILE);
  return (
    <QuizSessionContext.Provider value={{ session, setSession, profile, setProfile }}>
      {children}
    </QuizSessionContext.Provider>
  );
}

export function useQuizSession(): QuizSessionContextValue {
  return useContext(QuizSessionContext);
}
