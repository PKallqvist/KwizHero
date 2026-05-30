/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

export interface ActiveQuizSession {
  quizName: string;
  progressLabel: string;
}

export interface PlayerAmbientProfile {
  xpTotal: number;
  streakDays: number;
  firstDiscoverySeen: boolean;
  discoveredBadgeIds: string[];
}

const DEFAULT_PROFILE: PlayerAmbientProfile = {
  xpTotal: 1240,
  streakDays: 7,
  firstDiscoverySeen: false,
  discoveredBadgeIds: [],
};

interface QuizSessionContextValue {
  session: ActiveQuizSession | null;
  setSession: Dispatch<SetStateAction<ActiveQuizSession | null>>;
  profile: PlayerAmbientProfile;
  setProfile: Dispatch<SetStateAction<PlayerAmbientProfile>>;
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
