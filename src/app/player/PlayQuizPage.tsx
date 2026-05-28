import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { latLngBounds } from "leaflet";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Polyline,
  TileLayer,
  Tooltip as LeafletTooltip,
  useMap,
} from "react-leaflet";
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconCurrentLocation,
  IconFlag,
  IconPlayerSkipForward,
  IconPlayerTrackPrev,
  IconRoute,
  IconShieldCheck,
} from "@tabler/icons-react";
import { useQuizSession } from "../../platform/context/QuizSessionContext";
import { firebaseConfigError } from "../../platform/firebase/firebase";
import { kwizTokens } from "../../platform/theme/kwizTokens";
import {
  getCurrentUserUid,
  getPlayerBadgeProgress,
  getQuizWalk,
  getQuizSummary,
  markFirstDiscoverySeen,
  savePlayerBadgeProgress,
  startSession,
  storePlayerBadgeUnlocks,
  submitFirstAnswer,
} from "../../platform/firebase/quizRepository";
import { distanceMeters, formatDistanceMeters, getCurrentCoordinates, routeDistanceMeters } from "../../platform/map/geolocation";
import { evaluateBadgeUnlocks, type BadgeUnlockEvent, type BadgeLocale } from "../../domain/badges";
import type { AnswerResult, QuizSummary, QuizWalk, QuizWalkQuestion, QuizWalkWaypoint } from "../../domain/types";
import type { Coordinates } from "../../platform/map/geolocation";

type QuestionCardPhase = "back" | "pre_countdown" | "front";

interface DiscoveryQueueItem {
  event: BadgeUnlockEvent;
  showFirstHint: boolean;
}

interface JourneyMapProps {
  waypoints: QuizWalkWaypoint[];
  targetWaypointIndex: number;
  completedWaypointIndexes: ReadonlySet<number>;
  current: Coordinates | null;
  radius: number;
  currentLabel: string;
  orderedRoute: boolean;
}

function FitJourneyBounds(props: { waypoints: QuizWalkWaypoint[]; current: Coordinates | null }): null {
  const map = useMap();

  useEffect(() => {
    if (props.waypoints.length === 0) return;

    const points: Array<[number, number]> = props.waypoints.map((waypoint) => [waypoint.lat, waypoint.lng]);
    if (props.current) {
      points.push([props.current.lat, props.current.lng]);
    }

    if (points.length === 1) {
      map.setView(points[0], 15, { animate: false });
      return;
    }

    map.fitBounds(latLngBounds(points), { padding: [30, 30], animate: false });
  }, [map, props.current, props.waypoints]);

  return null;
}

function resolveBadgeImageSrc(imageKey: string | null): string | null {
  if (!imageKey) return null;
  return `/branding/trophies/${imageKey}`;
}

function JourneyMap(props: JourneyMapProps): JSX.Element {
  const target = props.waypoints[props.targetWaypointIndex] ?? props.waypoints[0] ?? null;

  if (!target) {
    return (
      <Paper withBorder radius="md" p="lg">
        <Text c="dimmed">No waypoint</Text>
      </Paper>
    );
  }

  return (
    <MapContainer
      center={[target.lat, target.lng]}
      zoom={15}
      scrollWheelZoom
      className="kwiz-map-container kwiz-player-fill-stack"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitJourneyBounds waypoints={props.waypoints} current={props.current} />

      {props.orderedRoute && props.waypoints.length > 1 ? (
        <>
          {props.waypoints.slice(0, -1).map((waypoint, fromIndex) => {
            const toIndex = fromIndex + 1;
            const isCurrent = toIndex === props.targetWaypointIndex;
            const isCompleted = !isCurrent && props.completedWaypointIndexes.has(toIndex);
            return (
              <Polyline
                key={`leg-${fromIndex}-${toIndex}`}
                positions={[
                  [waypoint.lat, waypoint.lng],
                  [props.waypoints[toIndex].lat, props.waypoints[toIndex].lng],
                ] as [number, number][]}
                pathOptions={
                  isCompleted
                    ? { color: "#2F6F46", weight: 2, opacity: 0.3 }
                    : isCurrent
                      ? { color: "#F6C453", weight: 3.5, opacity: 1, dashArray: undefined }
                      : { color: "#1D4ED8", weight: 2, opacity: 0.45 }
                }
              />
            );
          })}
        </>
      ) : null}

      {props.waypoints.map((waypoint, index) => {
        const isTarget = index === props.targetWaypointIndex;
        const isStart = index === 0;
        const isCompleted = props.completedWaypointIndexes.has(index);

        const markerColor = isTarget
          ? "#F6C453"
          : isCompleted
            ? "#2F6F46"
            : isStart
              ? "#1D4ED8"
              : "#1C3A5A";
        const markerStroke = isTarget
          ? "#1D3355"
          : isCompleted
            ? "#54B36C"
            : "#2A4F78";

        return (
          <CircleMarker
            key={`journey-waypoint-${waypoint.id}`}
            center={[waypoint.lat, waypoint.lng]}
            radius={isTarget ? 10 : 8}
            pathOptions={{
              color: markerStroke,
              fillColor: markerColor,
              fillOpacity: 1,
            }}
          >
            {isStart ? (
              <LeafletTooltip permanent direction="center" offset={[0, 0]}>S</LeafletTooltip>
            ) : null}
            {isTarget ? (
              <LeafletTooltip permanent direction="top" offset={[0, -10]}>
                {`${index + 1}. ${waypoint.title}`}
              </LeafletTooltip>
            ) : null}
            {props.orderedRoute && index === props.waypoints.length - 1 && props.waypoints.length > 1 ? (
              <LeafletTooltip permanent direction="bottom" offset={[0, 20]}>END</LeafletTooltip>
            ) : null}
          </CircleMarker>
        );
      })}

      <Circle
        center={[target.lat, target.lng]}
        radius={props.radius}
        pathOptions={{ color: kwizTokens.map.selectedWaypoint, fillOpacity: 0.18 }}
      />

      {props.current ? (
        <CircleMarker
          center={[props.current.lat, props.current.lng]}
          radius={7}
          pathOptions={{ color: kwizTokens.map.playerPin, fillColor: kwizTokens.map.playerPin, fillOpacity: 1 }}
        >
          <LeafletTooltip permanent direction="top" offset={[0, -10]}>{props.currentLabel}</LeafletTooltip>
        </CircleMarker>
      ) : null}
    </MapContainer>
  );
}

export function PlayQuizPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { setSession, setProfile } = useQuizSession();
  const { quizId = "" } = useParams();
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const debugMode = searchParams.get("debug") === "1";

  const [nickname, setNickname] = useState("");
  const [summary, setSummary] = useState<QuizSummary | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [quizWalk, setQuizWalk] = useState<QuizWalk | null>(null);

  const [debugWalk, setDebugWalk] = useState<QuizWalk | null>(null);
  const [debugWaypointIndex, setDebugWaypointIndex] = useState(0);
  const [debugQuestionIndex, setDebugQuestionIndex] = useState(0);

  const [activeWaypointIndex, setActiveWaypointIndex] = useState(0);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [lockedWaypointIndex, setLockedWaypointIndex] = useState<number | null>(null);
  const [answeredQuestionIds, setAnsweredQuestionIds] = useState<string[]>([]);

  const [distanceToWaypoint, setDistanceToWaypoint] = useState<number | null>(null);
  const [playerCoordinates, setPlayerCoordinates] = useState<Coordinates | null>(null);
  const [locationRefreshing, setLocationRefreshing] = useState(false);
  const [mockGpsWalkEnabled, setMockGpsWalkEnabled] = useState(false);
  const [cardPhase, setCardPhase] = useState<QuestionCardPhase>("back");
  const [preRevealCountdown, setPreRevealCountdown] = useState<number | null>(null);

  const [selectedChoiceIds, setSelectedChoiceIds] = useState<string[]>([]);
  const [numericAnswer, setNumericAnswer] = useState<number | null>(null);
  const [letterOrderAnswer, setLetterOrderAnswer] = useState("");

  const [answerResult, setAnswerResult] = useState<AnswerResult | null>(null);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [correctAnswersCount, setCorrectAnswersCount] = useState(0);
  const [currentScore, setCurrentScore] = useState(0);
  const [completionRevealOpen, setCompletionRevealOpen] = useState(false);
  const [completionToast, setCompletionToast] = useState<string | null>(null);
  const [tieredBadgeQueue, setTieredBadgeQueue] = useState<BadgeUnlockEvent[]>([]);
  const [activeTieredBadgeToast, setActiveTieredBadgeToast] = useState<BadgeUnlockEvent | null>(null);
  const [discoveryBadgeQueue, setDiscoveryBadgeQueue] = useState<DiscoveryQueueItem[]>([]);
  const [activeDiscoveryBadge, setActiveDiscoveryBadge] = useState<DiscoveryQueueItem | null>(null);
  const [animatedXpEarned, setAnimatedXpEarned] = useState(0);
  const [completionReplayKey, setCompletionReplayKey] = useState(0);
  const [countdownNow, setCountdownNow] = useState(Date.now());
  const [questionStartMs, setQuestionStartMs] = useState<number | null>(null);
  const [questionDeadlineMs, setQuestionDeadlineMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [questionTimedOut, setQuestionTimedOut] = useState(false);

  const [error, setError] = useState<string | null>(firebaseConfigError);
  const [loading, setLoading] = useState(false);
  const [currentUserUid, setCurrentUserUid] = useState<string | null>(null);

  const [cardPressed, setCardPressed] = useState(false);
  const [flipTransitioning, setFlipTransitioning] = useState(false);

  const debugWaypoint = debugWalk?.waypoints[debugWaypointIndex] ?? null;
  const debugQuestion = debugWaypoint?.questions[debugQuestionIndex] ?? null;

  const debugQuestions =
    debugWalk?.waypoints.flatMap((waypoint, waypointIndex) =>
      waypoint.questions.map((question, questionIndex) => ({
        waypointIndex,
        questionIndex,
        waypoint,
        question,
      }))
    ) ?? [];

  const flatDebugIndex = debugQuestions.findIndex(
    (entry) => entry.waypointIndex === debugWaypointIndex && entry.questionIndex === debugQuestionIndex
  );

  const currentWaypoint = quizWalk?.waypoints[activeWaypointIndex] ?? null;
  const currentQuestion =
    lockedWaypointIndex !== null
      ? quizWalk?.waypoints[lockedWaypointIndex]?.questions[activeQuestionIndex] ?? null
      : null;

  const totalRouteDistance = useMemo(
    () => routeDistanceMeters((quizWalk?.waypoints ?? []).map((waypoint) => ({ lat: waypoint.lat, lng: waypoint.lng }))),
    [quizWalk]
  );
  const joinQuizType = quizWalk && quizWalk.waypoints.length > 1 ? t("player.quizTypeLocation") : t("player.quizTypeTrivia");
  const organizerDisplayName = summary?.organizerName?.trim() || t("player.anonymousOrganizer");
  const organizerInitials = organizerDisplayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "KH";
  const totalQuestions = useMemo(
    () => (quizWalk?.waypoints ?? []).reduce((sum, waypoint) => sum + waypoint.questions.length, 0),
    [quizWalk]
  );
  const baseXp = 1240;
  const baseStreak = 7;
  const xpEarned = Math.max(currentScore, correctAnswersCount) * 96;
  const updatedXpTotal = baseXp + xpEarned;
  const updatedStreak = baseStreak + (sessionComplete ? 1 : 0);

  const nextTargetDistance = useMemo(() => {
    if (!currentWaypoint || !playerCoordinates) return null;
    return distanceMeters(playerCoordinates, { lat: currentWaypoint.lat, lng: currentWaypoint.lng });
  }, [currentWaypoint, playerCoordinates]);

  const effectiveQuestionTimerSeconds = useMemo(() => {
    if (!currentQuestion || !summary) return null;
    return currentQuestion.config.timerSeconds ?? summary.questionTimeLimitSeconds ?? null;
  }, [currentQuestion, summary]);

  const remainingSeconds =
    questionDeadlineMs && cardPhase === "front"
      ? Math.max(0, Math.ceil((questionDeadlineMs - nowMs) / 1000))
      : null;
  const isCreator = Boolean(summary?.creatorUid && currentUserUid && summary.creatorUid === currentUserUid);

  useEffect(() => {
    let mounted = true;

    async function hydrateCurrentUser(): Promise<void> {
      try {
        const uid = await getCurrentUserUid();
        if (mounted) {
          setCurrentUserUid(uid);
        }
      } catch {
        if (mounted) {
          setCurrentUserUid(null);
        }
      }
    }

    hydrateCurrentUser().catch(() => {
      if (mounted) {
        setCurrentUserUid(null);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!sessionId || !quizWalk || debugMode) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [debugMode, quizWalk, sessionId]);

  useEffect(() => {
    if (cardPhase !== "pre_countdown" || preRevealCountdown === null) return;

    if (preRevealCountdown <= 0) {
      setCardPhase("front");
      setQuestionStartMs(Date.now());
      setQuestionTimedOut(false);
      if (effectiveQuestionTimerSeconds !== null) {
        setQuestionDeadlineMs(Date.now() + effectiveQuestionTimerSeconds * 1000);
      } else {
        setQuestionDeadlineMs(null);
      }
      return;
    }

    const timeout = setTimeout(() => {
      setPreRevealCountdown((prev) => (prev === null ? null : prev - 1));
    }, 1000);

    return () => clearTimeout(timeout);
  }, [cardPhase, effectiveQuestionTimerSeconds, preRevealCountdown]);

  useEffect(() => {
    if (cardPhase !== "front" || questionDeadlineMs === null || questionTimedOut) return;

    const interval = setInterval(() => {
      const now = Date.now();
      setNowMs(now);
      if (now >= questionDeadlineMs) {
        setQuestionTimedOut(true);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [cardPhase, questionDeadlineMs, questionTimedOut]);

  useEffect(() => {
    if (!questionTimedOut || answerResult) return;
    setError(t("player.errorTimeExpired"));
  }, [answerResult, questionTimedOut, t]);

  function getFirstUnansweredQuestionIndex(waypoint: QuizWalkWaypoint): number {
    return waypoint.questions.findIndex((question) => !answeredQuestionIds.includes(question.id));
  }

  function getNextWaypointIndex(nextAnsweredQuestionIds: string[]): number | null {
    if (!quizWalk) return null;

    const unansweredIndexes = quizWalk.waypoints
      .map((waypoint, index) => ({
        index,
        answeredCount: waypoint.questions.filter((question) => nextAnsweredQuestionIds.includes(question.id)).length,
        total: waypoint.questions.length,
      }))
      .filter((entry) => entry.answeredCount < entry.total);

    if (unansweredIndexes.length === 0) return null;

    if (summary?.requireSequentialWaypoints ?? true) {
      return unansweredIndexes[0]?.index ?? null;
    }

    if (!playerCoordinates) {
      return unansweredIndexes[0]?.index ?? null;
    }

    const nearest = unansweredIndexes.reduce((best, entry) => {
      const waypoint = quizWalk.waypoints[entry.index];
      const d = distanceMeters(playerCoordinates, { lat: waypoint.lat, lng: waypoint.lng });
      if (!best || d < best.distance) {
        return { index: entry.index, distance: d };
      }
      return best;
    }, null as { index: number; distance: number } | null);

    return nearest?.index ?? unansweredIndexes[0]?.index ?? null;
  }

  function getGlobalQuestionNumber(waypointIndex: number, questionIndex: number): number {
    if (!quizWalk) return 1;
    return quizWalk.waypoints
      .slice(0, waypointIndex)
      .reduce((sum, waypoint) => sum + waypoint.questions.length, 0) + questionIndex + 1;
  }

  async function loadQuiz(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const q = await getQuizSummary(quizId);
      setSummary(q);
      if (!q) {
        setError(t("player.noQuiz"));
        return;
      }

      const walk = await getQuizWalk(quizId);
      if (!walk) {
        setError(t("player.errorNoPlayable"));
        return;
      }
      setQuizWalk(walk);

      if (debugMode) {
        setDebugWalk(walk);
        setDebugWaypointIndex(0);
        setDebugQuestionIndex(0);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (summary || loading) return;
    loadQuiz().catch(() => {
      // loadQuiz already pushes user-visible error state
    });
  }, [quizId]);

  async function joinQuiz(): Promise<void> {
    if (debugMode) {
      await loadQuiz();
      return;
    }

    if (!summary) {
      setError(t("player.errorLoadFirst"));
      return;
    }
    if (!nickname.trim()) {
      setError(t("player.errorNicknameRequired"));
      return;
    }

    const openAt = new Date(summary.openAt).getTime();
    const closeAt = new Date(summary.closeAt).getTime();
    const now = Date.now();
    if (now < openAt) {
      setError(t("player.errorQuizNotOpen"));
      return;
    }
    if (now > closeAt) {
      setError(t("player.errorQuizClosed"));
      return;
    }
    if (!quizWalk || quizWalk.waypoints.length === 0) {
      setError(t("player.errorNoPlayable"));
      return;
    }

    setError(null);
    const sid = await startSession(quizId, nickname.trim());
    setSessionId(sid);

    const firstWaypoint = getNextWaypointIndex([]) ?? 0;
    const firstQuestion = getFirstUnansweredQuestionIndex(quizWalk.waypoints[firstWaypoint]);

    setActiveWaypointIndex(firstWaypoint);
    setActiveQuestionIndex(Math.max(0, firstQuestion));
    setLockedWaypointIndex(null);
    setCardPhase("back");
    setAnswerResult(null);
    setSessionComplete(false);
    setSelectedChoiceIds([]);
    setNumericAnswer(null);
    setLetterOrderAnswer("");
    setQuestionTimedOut(false);
    setQuestionDeadlineMs(null);
    setPreRevealCountdown(null);
    setAnsweredQuestionIds([]);
    setMockGpsWalkEnabled(false);
    setCorrectAnswersCount(0);
    setCurrentScore(0);
    setCompletionRevealOpen(false);
    setAnimatedXpEarned(0);
    setCompletionReplayKey(0);
    setCountdownNow(Date.now());
  }

  async function startDebugQuiz(): Promise<void> {
    if (!summary || !quizWalk) {
      await loadQuiz();
      return;
    }
    if (!isCreator) return;
    if (quizWalk.waypoints.length === 0) {
      setError(t("player.errorNoPlayable"));
      return;
    }

    const debugNickname = nickname.trim().length > 0 ? nickname.trim() : "Creator Debug";
    setError(null);
    const sid = await startSession(quizId, debugNickname);

    const firstWaypoint = getNextWaypointIndex([]) ?? 0;
    const firstQuestion = getFirstUnansweredQuestionIndex(quizWalk.waypoints[firstWaypoint]);

    setNickname(debugNickname);
    setSessionId(sid);
    setActiveWaypointIndex(firstWaypoint);
    setActiveQuestionIndex(Math.max(0, firstQuestion));
    setLockedWaypointIndex(null);
    setCardPhase("back");
    setAnswerResult(null);
    setSessionComplete(false);
    setSelectedChoiceIds([]);
    setNumericAnswer(null);
    setLetterOrderAnswer("");
    setQuestionTimedOut(false);
    setQuestionDeadlineMs(null);
    setPreRevealCountdown(null);
    setAnsweredQuestionIds([]);
    setMockGpsWalkEnabled(true);
    setCorrectAnswersCount(0);
    setCurrentScore(0);
    setCompletionRevealOpen(false);
    setAnimatedXpEarned(0);
    setCompletionReplayKey(0);
    setCountdownNow(Date.now());
  }

  function setMockLocationToWaypoint(waypointIndex: number): void {
    if (!quizWalk) return;
    const waypoint = quizWalk.waypoints[waypointIndex];
    if (!waypoint) return;

    setPlayerCoordinates({ lat: waypoint.lat, lng: waypoint.lng });
    setDistanceToWaypoint(0);
    setError(null);
  }

  async function refreshCurrentLocation(): Promise<void> {
    if (debugMode || mockGpsWalkEnabled || !currentWaypoint || sessionComplete) return;
    setLocationRefreshing(true);
    setError(null);

    try {
      const current = await getCurrentCoordinates();
      setPlayerCoordinates(current);
      const distance = distanceMeters(current, {
        lat: currentWaypoint.lat,
        lng: currentWaypoint.lng,
      });
      setDistanceToWaypoint(distance);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLocationRefreshing(false);
    }
  }

  useEffect(() => {
    if (debugMode || mockGpsWalkEnabled || !currentWaypoint || sessionComplete) return;
    if (!("geolocation" in navigator)) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const current = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setPlayerCoordinates(current);
        const distance = distanceMeters(current, {
          lat: currentWaypoint.lat,
          lng: currentWaypoint.lng,
        });
        setDistanceToWaypoint(distance);
      },
      () => {
        // keep manual refresh available
      },
      {
        enableHighAccuracy: true,
        maximumAge: 4000,
        timeout: 12000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [currentWaypoint, debugMode, mockGpsWalkEnabled, sessionComplete]);

  useEffect(() => {
    if (!mockGpsWalkEnabled || !quizWalk || sessionComplete) return;
    if (lockedWaypointIndex !== null) return;
    setMockLocationToWaypoint(activeWaypointIndex);
  }, [activeWaypointIndex, lockedWaypointIndex, mockGpsWalkEnabled, quizWalk, sessionComplete]);

  function getGateRadiusMeters(): number {
    return summary?.waypointGateRadiusMeters ?? 40;
  }

  useEffect(() => {
    if (!currentWaypoint || lockedWaypointIndex !== null || distanceToWaypoint === null || sessionComplete) return;
    if (distanceToWaypoint > getGateRadiusMeters()) return;
    setLockedWaypointIndex(activeWaypointIndex);
    setCardPhase("back");
    setError(null);
  }, [activeWaypointIndex, currentWaypoint, distanceToWaypoint, lockedWaypointIndex, sessionComplete]);

  function revealQuestionCard(): void {
    if (!currentQuestion) return;

    setError(null);
    setQuestionTimedOut(false);
    setSelectedChoiceIds([]);
    setNumericAnswer(null);
    setLetterOrderAnswer("");

    if (effectiveQuestionTimerSeconds !== null) {
      setCardPhase("pre_countdown");
      setPreRevealCountdown(3);
      return;
    }

    setCardPhase("front");
    setQuestionStartMs(Date.now());
    setQuestionDeadlineMs(null);
  }

  function beginRevealInteraction(): void {
    if (cardPhase === "pre_countdown") return;
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(40);
    }

    if (effectiveQuestionTimerSeconds === null) {
      setFlipTransitioning(true);
    }
    revealQuestionCard();
  }

  function leaveQuestionScreen(): void {
    setLockedWaypointIndex(null);
    setCardPhase("back");
    setPreRevealCountdown(null);
    setQuestionDeadlineMs(null);
    setQuestionTimedOut(false);
    setSelectedChoiceIds([]);
    setNumericAnswer(null);
    setLetterOrderAnswer("");
    setError(null);
  }

  useEffect(() => {
    if (cardPhase !== "front") return;
    if (!flipTransitioning) return;

    const timeout = setTimeout(() => setFlipTransitioning(false), 520);
    return () => clearTimeout(timeout);
  }, [cardPhase, flipTransitioning]);

  useEffect(() => {
    if (cardPhase !== "pre_countdown") return;
    setFlipTransitioning(false);
  }, [cardPhase]);

  function renderQuestionInput(question: QuizWalkQuestion): JSX.Element | null {
    const questionType = question.questionType ?? "multiple_choice";

    if (questionType === "numeric") {
      return (
        <NumberInput
          label={t("player.numericAnswer")}
          className="kwiz-adventure-input"
          value={numericAnswer ?? undefined}
          onChange={(value) => setNumericAnswer(typeof value === "number" ? value : null)}
        />
      );
    }

    if (questionType === "letter_order") {
      return (
        <TextInput
          label={t("player.letterOrderAnswer")}
          className="kwiz-adventure-input"
          value={letterOrderAnswer}
          onChange={(e) => setLetterOrderAnswer(e.currentTarget.value)}
        />
      );
    }

    return (
      <Stack gap="sm">
        {question.choices.map((choice) => {
          const selected = selectedChoiceIds.includes(choice.id);
          return (
            <button
              key={choice.id}
              type="button"
              className={`kwiz-adventure-option${selected ? " is-selected" : ""}`}
              onClick={() => {
                setSelectedChoiceIds((previous) =>
                  previous.includes(choice.id)
                    ? previous.filter((id) => id !== choice.id)
                    : [...previous, choice.id]
                );
              }}
            >
              <span className={`kwiz-adventure-option-radio${selected ? " is-selected" : ""}`} aria-hidden="true" />
              <span>{choice.text}</span>
            </button>
          );
        })}
      </Stack>
    );
  }

  function resolveBadgeLocale(): BadgeLocale {
    const language = i18n.resolvedLanguage ?? i18n.language;
    return language.startsWith("sv") ? "sv" : "en";
  }

  function resolveCompletionTriggerEventKeys(completedAt: Date): string[] {
    const keys: string[] = [];
    const hour = completedAt.getHours();
    if (hour <= 4 || hour >= 23) {
      keys.push("dead_of_night");
    }
    return keys;
  }

  async function queueBadgeUnlocksForCompletion(): Promise<void> {
    const progress = await getPlayerBadgeProgress();
    const completionTriggerKeys = resolveCompletionTriggerEventKeys(new Date());
    const nextProgress = {
      ...progress,
      quizzesCompleted: progress.quizzesCompleted + 1,
      triggeredEventKeys: [...new Set([...progress.triggeredEventKeys, ...completionTriggerKeys])],
    };

    await savePlayerBadgeProgress(nextProgress);

    const unlockedEvents = evaluateBadgeUnlocks(nextProgress, resolveBadgeLocale());
    if (unlockedEvents.length === 0) {
      return;
    }

    await storePlayerBadgeUnlocks(unlockedEvents);

    const tieredEvents = unlockedEvents.filter((event) => event.type === "tiered");
    const discoveryEvents = unlockedEvents.filter((event) => event.type === "discovery");

    if (tieredEvents.length > 0) {
      setTieredBadgeQueue((previous) => [...previous, ...tieredEvents]);
    }

    if (discoveryEvents.length > 0) {
      const isFirstDiscoveryEver = !progress.firstDiscoverySeen && progress.earnedDiscoveryBadgeIds.length === 0;
      setDiscoveryBadgeQueue((previous) => [
        ...previous,
        ...discoveryEvents.map((event, index) => ({
          event,
          showFirstHint: isFirstDiscoveryEver && index === 0,
        })),
      ]);

      setProfile((previous) => ({
        ...previous,
        discoveredBadgeIds: [...new Set([...previous.discoveredBadgeIds, ...discoveryEvents.map((event) => event.badgeId)])],
      }));
    }
  }

  async function dismissActiveDiscoveryBadge(): Promise<void> {
    if (!activeDiscoveryBadge) return;
    const shouldMarkFirstSeen = activeDiscoveryBadge.showFirstHint;
    setActiveDiscoveryBadge(null);

    if (!shouldMarkFirstSeen) return;

    try {
      await markFirstDiscoverySeen();
      setProfile((previous) => ({
        ...previous,
        firstDiscoverySeen: true,
      }));
    } catch {
      // keep gameplay running even if profile marker write fails
    }
  }

  async function submitAnswer(): Promise<void> {
    if (debugMode || !sessionId || !quizWalk || lockedWaypointIndex === null || !currentQuestion) return;
    if (questionTimedOut) {
      setError(t("player.errorTimeExpired"));
      return;
    }

    const questionType = currentQuestion.questionType ?? "multiple_choice";
    if (questionType === "multiple_choice" && selectedChoiceIds.length === 0) {
      setError(t("player.errorSelectAnswer"));
      return;
    }
    if (questionType === "numeric" && typeof numericAnswer !== "number") {
      setError(t("player.errorNumericRequired"));
      return;
    }
    if (questionType === "letter_order" && !letterOrderAnswer.trim()) {
      setError(t("player.errorLetterOrderRequired"));
      return;
    }

    const elapsedMs = questionStartMs ? Date.now() - questionStartMs : 0;
    setError(null);
    try {
      const result = await submitFirstAnswer({
        quizId,
        sessionId,
        waypointId: quizWalk.waypoints[lockedWaypointIndex].id,
        questionId: currentQuestion.id,
        selectedChoiceIds: questionType === "multiple_choice" ? selectedChoiceIds : [],
        numericAnswer: questionType === "numeric" ? numericAnswer : null,
        letterOrderAnswer: questionType === "letter_order" ? letterOrderAnswer : null,
        elapsedMs,
      });
      setAnswerResult(result);
      setCurrentScore(result.score);
      if (result.isCorrect) {
        setCorrectAnswersCount((previous) => previous + 1);
      }

      const nextAnswered = [...answeredQuestionIds, currentQuestion.id];
      setAnsweredQuestionIds(nextAnswered);

      const lockedWaypoint = quizWalk.waypoints[lockedWaypointIndex];
      const nextQuestionIdx = lockedWaypoint.questions.findIndex(
        (question) => !nextAnswered.includes(question.id)
      );

      if (nextQuestionIdx >= 0) {
        setActiveQuestionIndex(nextQuestionIdx);
        setCardPhase("back");
        setQuestionDeadlineMs(null);
        setPreRevealCountdown(null);
        setSelectedChoiceIds([]);
        setNumericAnswer(null);
        setLetterOrderAnswer("");
        return;
      }

      const nextWaypointIndex = getNextWaypointIndex(nextAnswered);
      if (nextWaypointIndex === null) {
        try {
          await queueBadgeUnlocksForCompletion();
        } catch {
          // badge unlock processing should never block quiz completion
        }
        setSessionComplete(true);
        setLockedWaypointIndex(null);
        return;
      }

      const firstQuestionIdx = getFirstUnansweredQuestionIndex(quizWalk.waypoints[nextWaypointIndex]);
      setActiveWaypointIndex(nextWaypointIndex);
      setActiveQuestionIndex(Math.max(0, firstQuestionIdx));
      setLockedWaypointIndex(null);
      setCardPhase("back");
      setQuestionDeadlineMs(null);
      setPreRevealCountdown(null);
      setSelectedChoiceIds([]);
      setNumericAnswer(null);
      setLetterOrderAnswer("");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const showGameplay = Boolean(sessionId && quizWalk && !debugMode && !sessionComplete);
  const showCompletionScreen = Boolean(sessionComplete && summary && quizWalk && !debugMode);
  const showPreGame = !showGameplay && !showCompletionScreen;
  const showImmersivePlayerScreen = showGameplay || showCompletionScreen || showPreGame;
  const journeyMode = showGameplay && lockedWaypointIndex === null;
  const cardMode = showGameplay && lockedWaypointIndex !== null && currentQuestion;
  const completionMode = summary?.revealMode ?? "instant";
  const completionDateMs = useMemo(
    () => (summary?.revealAt ? new Date(summary.revealAt).getTime() : null),
    [summary?.revealAt]
  );
  const completionDate = completionDateMs !== null ? new Date(completionDateMs) : null;
  const countdownMs = completionDateMs !== null ? Math.max(0, completionDateMs - countdownNow) : 0;
  const countdownDays = Math.floor(countdownMs / (1000 * 60 * 60 * 24));
  const countdownHours = Math.floor((countdownMs / (1000 * 60 * 60)) % 24);
  const countdownMinutes = Math.floor((countdownMs / (1000 * 60)) % 60);

  const confettiParticles = useMemo(() => {
    if (!showCompletionScreen || completionMode === "scheduled") return [];
    return Array.from({ length: 36 }).map((_, index) => {
      const palette = ["#F6C453", "#1D4ED8", "#34d399", "#f472b6", "#c084fc"];
      const color = palette[Math.floor(Math.random() * palette.length)] ?? "#F6C453";
      return {
        id: `confetti-${index}`,
        left: Math.random() * 100,
        size: 4 + Math.random() * 4,
        delay: Math.random() * 160,
        duration: 1800 + Math.random() * 1400,
        drift: -30 + Math.random() * 60,
        rotate: -220 + Math.random() * 440,
        color,
      };
    });
  }, [completionMode, completionReplayKey, showCompletionScreen]);

  const completedWaypointIndexes = useMemo(() => {
    if (!quizWalk) return new Set<number>();
    const completed = new Set<number>();
    quizWalk.waypoints.forEach((waypoint, index) => {
      if (waypoint.questions.length > 0 && waypoint.questions.every((question) => answeredQuestionIds.includes(question.id))) {
        completed.add(index);
      }
    });
    return completed;
  }, [answeredQuestionIds, quizWalk]);

  const currentWaypointQuestionCount =
    lockedWaypointIndex !== null ? quizWalk?.waypoints[lockedWaypointIndex]?.questions.length ?? 0 : 0;
  const currentQuestionGlobal =
    lockedWaypointIndex !== null ? getGlobalQuestionNumber(lockedWaypointIndex, activeQuestionIndex) : 0;
  const anyOrderQuestionsEnabled = summary?.questionOrderMode === "any";
  const unansweredQuestionOptions = useMemo(() => {
    if (!quizWalk || lockedWaypointIndex === null) return [];
    return quizWalk.waypoints[lockedWaypointIndex].questions
      .map((question, index) => ({ question, index }))
      .filter(({ question }) => !answeredQuestionIds.includes(question.id))
      .map(({ question, index }) => ({
        value: String(index),
        label: `${index + 1}. ${question.text.slice(0, 42) || t("player.debugQuestion")}`,
      }));
  }, [answeredQuestionIds, lockedWaypointIndex, quizWalk, t]);

  // Publish active quiz session to global bottom bar
  useEffect(() => {
    if (!showGameplay || !summary || sessionComplete) {
      setSession(null);
      return;
    }
    const waypointName =
      lockedWaypointIndex !== null
        ? (quizWalk?.waypoints[lockedWaypointIndex]?.title ?? "")
        : (currentWaypoint?.title ?? "");
    const progressLabel =
      lockedWaypointIndex !== null
        ? `${waypointName} · Question ${activeQuestionIndex + 1} of ${currentWaypointQuestionCount}`
        : waypointName;
    setSession({ quizName: summary.title, progressLabel });
  }, [showGameplay, sessionComplete, summary, lockedWaypointIndex, activeQuestionIndex, currentWaypointQuestionCount, currentWaypoint, quizWalk, setSession]);

  useEffect(() => {
    if (!showCompletionScreen) return;
    setProfile((previous) => ({
      ...previous,
      xpTotal: updatedXpTotal,
      streakDays: updatedStreak,
    }));
  }, [setProfile, showCompletionScreen, updatedStreak, updatedXpTotal]);

  useEffect(() => {
    if (activeTieredBadgeToast || tieredBadgeQueue.length === 0) return;
    const [nextToast, ...remaining] = tieredBadgeQueue;
    setActiveTieredBadgeToast(nextToast ?? null);
    setTieredBadgeQueue(remaining);
  }, [activeTieredBadgeToast, tieredBadgeQueue]);

  useEffect(() => {
    if (!activeTieredBadgeToast) return;
    const timeout = window.setTimeout(() => {
      setActiveTieredBadgeToast(null);
    }, 3000);
    return () => window.clearTimeout(timeout);
  }, [activeTieredBadgeToast]);

  useEffect(() => {
    if (activeDiscoveryBadge || discoveryBadgeQueue.length === 0) return;
    const [nextDiscovery, ...remaining] = discoveryBadgeQueue;
    setActiveDiscoveryBadge(nextDiscovery ?? null);
    setDiscoveryBadgeQueue(remaining);
  }, [activeDiscoveryBadge, discoveryBadgeQueue]);

  useEffect(() => {
    if (!showCompletionScreen) return;
    setAnimatedXpEarned(0);

    const delay = window.setTimeout(() => {
      const startedAt = performance.now();
      const durationMs = 800;

      const tick = (timestamp: number) => {
        const elapsed = Math.min(timestamp - startedAt, durationMs);
        const progress = elapsed / durationMs;
        const eased = 1 - Math.pow(1 - progress, 3);
        setAnimatedXpEarned(Math.round(xpEarned * eased));
        if (elapsed < durationMs) {
          requestAnimationFrame(tick);
        }
      };

      requestAnimationFrame(tick);
    }, 400);

    return () => window.clearTimeout(delay);
  }, [completionReplayKey, showCompletionScreen, xpEarned]);

  useEffect(() => {
    if (!showCompletionScreen || completionMode !== "scheduled" || completionDateMs === null) return;

    setCountdownNow(Date.now());
    const interval = window.setInterval(() => {
      setCountdownNow(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [completionDateMs, completionMode, showCompletionScreen]);

  useEffect(() => {
    if (!completionToast) return;
    const timeout = window.setTimeout(() => setCompletionToast(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [completionToast]);

  const scheduledRevealFormatted = completionDate
    ? new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(completionDate).replace(",", " at")
    : "";

  function completionPrimaryAction(): void {
    if (!showCompletionScreen) return;
    if (completionMode === "scheduled") {
      setCompletionToast("We'll remind you when results are ready");
      return;
    }
    setCompletionRevealOpen(true);
  }

  function replayCompletionAnimation(): void {
    if (!showCompletionScreen) return;
    setCompletionReplayKey((previous) => previous + 1);
  }

  // Clear session when component unmounts
  useEffect(() => {
    return () => {
      setSession(null);
    };
  }, [setSession]);

  useEffect(() => {
    if (!anyOrderQuestionsEnabled || !quizWalk || lockedWaypointIndex === null) return;
    const waypoint = quizWalk.waypoints[lockedWaypointIndex];
    if (!waypoint) return;

    const activeQuestion = waypoint.questions[activeQuestionIndex];
    if (activeQuestion && !answeredQuestionIds.includes(activeQuestion.id)) return;

    const firstUnanswered = waypoint.questions.findIndex((question) => !answeredQuestionIds.includes(question.id));
    if (firstUnanswered >= 0) {
      setActiveQuestionIndex(firstUnanswered);
    }
  }, [activeQuestionIndex, anyOrderQuestionsEnabled, answeredQuestionIds, lockedWaypointIndex, quizWalk]);

  return (
    <Paper
      withBorder={!showImmersivePlayerScreen}
      shadow={showGameplay ? undefined : "sm"}
      radius={showImmersivePlayerScreen ? 0 : "md"}
      p={showImmersivePlayerScreen ? 0 : "lg"}
    >
      <Stack gap="md" className={showImmersivePlayerScreen ? "kwiz-player-gameplay-root" : undefined}>
        {showPreGame ? (
          <div className="kwiz-join-screen">
            <span className="kwiz-join-accent is-top-right" aria-hidden="true" />
            <span className="kwiz-join-accent is-bottom-left" aria-hidden="true" />
            <img src="/branding/kwizherologo.png" alt="KwizHero" className="kwiz-join-logo" />

            {summary ? (
              <div className="kwiz-join-card">
                <span className="kwiz-join-badge">{joinQuizType}</span>
                <Title order={2} className="kwiz-join-name">{summary.title}</Title>
                <Text className="kwiz-join-description">
                  {summary.description?.trim().length ? summary.description : t("player.joinScreenHelp")}
                </Text>
              </div>
            ) : (
              <div className="kwiz-join-card is-loading">
                <Text className="kwiz-join-loading">{loading ? t("player.loadQuiz") : t("player.retryLoadQuiz")}</Text>
              </div>
            )}

            {summary && !summary.isAnonymous ? (
              <button type="button" className="kwiz-join-organizer-row" onClick={() => {}}>
                {summary.organizerAvatarUrl ? (
                  <img src={summary.organizerAvatarUrl} alt={organizerDisplayName} className="kwiz-join-organizer-avatar-image" />
                ) : (
                  <span className="kwiz-join-organizer-avatar">{organizerInitials}</span>
                )}
                <div className="kwiz-join-organizer-copy">
                  <Text className="kwiz-join-organizer-label">{t("player.organizerLabel")}</Text>
                  <Text className={`kwiz-join-organizer-name${summary.organizerName ? "" : " is-anonymous"}`}>
                    {organizerDisplayName}
                  </Text>
                </div>
                <IconChevronRight size={16} className="kwiz-join-organizer-chevron" />
              </button>
            ) : null}

            {summary ? (
              <div className="kwiz-join-form">
                <TextInput
                  label={t("player.nickname")}
                  placeholder={t("player.joinPlaceholder")}
                  value={nickname}
                  onChange={(e) => setNickname(e.currentTarget.value)}
                  classNames={{ label: "kwiz-join-input-label", input: "kwiz-join-input-field" }}
                />
                <Button className="kwiz-join-submit" onClick={joinQuiz} leftSection={<IconShieldCheck size={18} />}>
                  {t("player.joinTitle")}
                </Button>
                {isCreator ? (
                  <Button variant="subtle" color="orange" onClick={startDebugQuiz} className="kwiz-join-debug-link">
                    {t("player.debugQuiz")}
                  </Button>
                ) : null}
                <Text className="kwiz-join-powered-by">{t("player.poweredBy")}</Text>
              </div>
            ) : (
              <Button onClick={loadQuiz} loading={loading} disabled={Boolean(firebaseConfigError)} className="kwiz-join-retry-button">
                {t("player.retryLoadQuiz")}
              </Button>
            )}
          </div>
        ) : null}

        {showCompletionScreen && summary && quizWalk ? (
          <div className={`kwiz-completion-screen is-${completionMode}`}>
            <div key={`completion-replay-${completionReplayKey}`} className="kwiz-completion-content">
              <div className="kwiz-completion-hero">
                <span className="kwiz-completion-glow" aria-hidden="true" />
                {confettiParticles.map((particle) => (
                  <span
                    key={particle.id}
                    className="kwiz-completion-confetti"
                    style={{
                      left: `${particle.left}%`,
                      width: `${particle.size}px`,
                      height: `${particle.size}px`,
                      backgroundColor: particle.color,
                      animationDelay: `${particle.delay}ms`,
                      animationDuration: `${particle.duration}ms`,
                      ["--kwiz-confetti-drift" as string]: `${particle.drift}px`,
                      ["--kwiz-confetti-rotate" as string]: `${particle.rotate}deg`,
                    }}
                    aria-hidden="true"
                  />
                ))}
                <button
                  type="button"
                  className="kwiz-completion-icon-ring"
                  onClick={replayCompletionAnimation}
                  aria-label="Replay celebration animation"
                >
                  <span className="kwiz-completion-icon">
                    {completionMode === "instant" ? "🏆" : completionMode === "on_completion" ? "🎯" : "⏳"}
                  </span>
                </button>
              </div>

              <Text className="kwiz-completion-mode-label kwiz-completion-enter delay-1">
                {completionMode === "on_completion" ? "JOURNEY COMPLETE!" : "QUEST COMPLETE!"}
              </Text>
              <Title order={2} className="kwiz-completion-title kwiz-completion-enter delay-2">
                {completionMode === "instant"
                  ? `${summary.title} conquered`
                  : completionMode === "on_completion"
                    ? "All waypoints reached"
                    : "Now the wait begins…"}
              </Title>
              {completionMode === "scheduled" ? (
                <Text className="kwiz-completion-subtext kwiz-completion-enter delay-3">
                  You've answered all questions. Results will be revealed on the scheduled date.
                </Text>
              ) : null}

              <div className="kwiz-completion-xp-pill">⚡ +{animatedXpEarned.toLocaleString("sv-SE")} XP earned</div>

              {completionMode !== "scheduled" ? (
                <div className="kwiz-completion-stats">
                  <div className="kwiz-completion-stat kwiz-completion-stat-enter" style={{ animationDelay: "600ms" }}>
                    <span className="kwiz-completion-stat-value">
                      {completionMode === "instant" ? `${correctAnswersCount}/${totalQuestions}` : totalQuestions}
                    </span>
                    <span className="kwiz-completion-stat-label">
                      {completionMode === "instant" ? "Correct" : "Questions"}
                    </span>
                  </div>
                  <div className="kwiz-completion-stat kwiz-completion-stat-enter" style={{ animationDelay: "660ms" }}>
                    <span className="kwiz-completion-stat-value">{(totalRouteDistance / 1000).toFixed(1)}</span>
                    <span className="kwiz-completion-stat-label">km walked</span>
                  </div>
                  <div className="kwiz-completion-stat kwiz-completion-stat-enter" style={{ animationDelay: "720ms" }}>
                    <span className="kwiz-completion-stat-value">🔥 {updatedStreak}</span>
                    <span className="kwiz-completion-stat-label">Streak</span>
                  </div>
                </div>
              ) : (
                <div className="kwiz-completion-countdown">
                  <div className="kwiz-completion-countdown-card" key={`days-${countdownDays}`}>
                    <span className="kwiz-completion-countdown-value">{String(countdownDays).padStart(2, "0")}</span>
                    <span className="kwiz-completion-countdown-label">DAYS</span>
                  </div>
                  <div className="kwiz-completion-countdown-card" key={`hours-${countdownHours}`}>
                    <span className="kwiz-completion-countdown-value">{String(countdownHours).padStart(2, "0")}</span>
                    <span className="kwiz-completion-countdown-label">HRS</span>
                  </div>
                  <div className="kwiz-completion-countdown-card" key={`minutes-${countdownMinutes}`}>
                    <span className="kwiz-completion-countdown-value">{String(countdownMinutes).padStart(2, "0")}</span>
                    <span className="kwiz-completion-countdown-label">MIN</span>
                  </div>
                </div>
              )}

              <div className={`kwiz-completion-reveal-card is-${completionMode}`}>
                <div className="kwiz-completion-reveal-icon">
                  {completionMode === "instant" ? "✅" : completionMode === "on_completion" ? "🎯" : "📅"}
                </div>
                <Text className="kwiz-completion-reveal-title">
                  {completionMode === "instant"
                    ? "Results revealed as you played"
                    : completionMode === "on_completion"
                      ? "Results are ready!"
                      : "Scheduled reveal"}
                </Text>
                <Text className="kwiz-completion-reveal-body">
                  {completionMode === "instant"
                    ? `You saw each answer right after answering. Final score: ${correctAnswersCount}/${totalQuestions}`
                    : completionMode === "on_completion"
                      ? completionRevealOpen
                        ? `Final score: ${currentScore}/${totalQuestions}. Your results are now revealed.`
                        : "The quiz has ended and your answers have been scored. Tap below to see how you did."
                      : `Results unlock on ${scheduledRevealFormatted}. Come back then to see how you did.`}
                </Text>
              </div>

              <div className="kwiz-completion-cta-stack">
                <Button
                  className={`kwiz-completion-primary is-${completionMode}`}
                  onClick={completionPrimaryAction}
                >
                  {completionMode === "instant"
                    ? "🏆 See full results"
                    : completionMode === "on_completion"
                      ? completionRevealOpen
                        ? "🎯 Results revealed"
                        : "🎯 Reveal my results"
                      : "🔔 Notify me when ready"}
                </Button>
                <Button variant="outline" className="kwiz-completion-secondary" onClick={() => navigate("/")}>
                  Back to home
                </Button>
              </div>
            </div>
          </div>
        ) : null}



        {journeyMode && quizWalk && currentWaypoint ? (
          <div className="kwiz-walk-shell kwiz-player-fill-card">
            <div className="kwiz-next-waypoint-card">
              <Text className="kwiz-walk-label">{t("player.nextWaypointLabel")}</Text>
              <Title order={3}>{currentWaypoint.title}</Title>
              <Group gap="xs" align="center" wrap="wrap">
                <Text className="kwiz-walk-muted">{`🚶 ${Math.max(0, Math.round(distanceToWaypoint ?? 0))} ${t("player.metersAway")}`}</Text>
                <span className="kwiz-walk-pill">{formatDistanceMeters(nextTargetDistance ?? 0)} {t("player.crowFlies")}</span>
              </Group>
            </div>

            <div className="kwiz-player-fill-pane kwiz-walk-map-shell">
              <JourneyMap
                waypoints={quizWalk.waypoints}
                targetWaypointIndex={activeWaypointIndex}
                completedWaypointIndexes={completedWaypointIndexes}
                current={playerCoordinates}
                radius={getGateRadiusMeters()}
                currentLabel={nickname || t("player.locationYou")}
                orderedRoute={summary?.requireSequentialWaypoints ?? true}
              />
            </div>

            <div className="kwiz-walk-stats-row">
              <div className="kwiz-walk-stat-card">
                <Text className="kwiz-walk-stat-label"><IconRoute size={14} /> {t("player.totalRoute")}</Text>
                <Text className="kwiz-walk-stat-value">{`${(totalRouteDistance / 1000).toFixed(1)} km`}</Text>
              </div>
              <div className="kwiz-walk-stat-card">
                <Text className="kwiz-walk-stat-label"><IconFlag size={14} /> {t("player.waypoints")}</Text>
                <Text className="kwiz-walk-stat-value">{`${Math.min(activeWaypointIndex + 1, quizWalk.waypoints.length)} / ${quizWalk.waypoints.length}`}</Text>
              </div>
            </div>

            <div className="kwiz-walk-route-list">
              <Text className="kwiz-walk-route-label">{t("player.routeSection")}</Text>
              {quizWalk.waypoints.map((waypoint, index) => {
                const isCurrent = index === activeWaypointIndex;
                const isCompleted = completedWaypointIndexes.has(index);
                const dotClassName = isCompleted
                  ? "kwiz-route-dot is-completed"
                  : isCurrent
                    ? "kwiz-route-dot is-current"
                    : "kwiz-route-dot";
                const cumulativeMeters = routeDistanceMeters(
                  quizWalk.waypoints.slice(0, index + 1).map((entry) => ({ lat: entry.lat, lng: entry.lng }))
                );

                return (
                  <div key={`route-row-${waypoint.id}`} className="kwiz-route-row">
                    <span className={dotClassName} aria-hidden="true">{isCompleted ? <IconCheck size={14} /> : index + 1}</span>
                    <div className="kwiz-route-row-text">
                      <Text className={`kwiz-route-row-title${isCurrent ? " is-current" : ""}${isCompleted ? " is-completed" : ""}`}>{waypoint.title}</Text>
                      <Text className="kwiz-route-row-subtitle">
                        {isCompleted
                          ? t("player.routeCompleted")
                          : isCurrent
                            ? `${Math.max(0, Math.round(distanceToWaypoint ?? 0))} ${t("player.metersAwayWalking")}`
                            : `~${formatDistanceMeters(cumulativeMeters)} ${t("player.total")}`}
                      </Text>
                    </div>
                  </div>
                );
              })}
            </div>

            <Button
              className="kwiz-walk-refresh-button"
              onClick={refreshCurrentLocation}
              loading={locationRefreshing}
              disabled={mockGpsWalkEnabled}
              leftSection={<IconCurrentLocation size={18} />}
            >
              {t("player.locationRefresh")}
            </Button>
          </div>
        ) : null}

        {cardMode && currentQuestion && quizWalk && lockedWaypointIndex !== null ? (
          <div className="kwiz-player-phone-shell">
            <div className="kwiz-adventure-shell kwiz-player-fill-card-hidden kwiz-player-phone-card">
              {cardPhase !== "front" ? (
                <>
                  <div className="kwiz-adventure-topline">BEFORE: TAP TO REVEAL</div>
                  <div className="kwiz-adventure-header">
                    <button type="button" className="kwiz-adventure-back" onClick={leaveQuestionScreen}>
                      <IconChevronLeft size={16} />
                      <span>{t("common.back")}</span>
                    </button>
                    <div className="kwiz-adventure-xp">+240 XP</div>
                  </div>

                  <div className="kwiz-adventure-waypoint">
                    <Title order={3}>{quizWalk.waypoints[lockedWaypointIndex].title}</Title>
                    <Text>
                      {`• Waypoint reached · ${currentWaypointQuestionCount} ${currentWaypointQuestionCount === 1 ? "question" : "questions"}`}
                    </Text>
                  </div>

                  <div className="kwiz-adventure-card-zone">
                    <div
                      className={`kwiz-adventure-backdrop${flipTransitioning ? " is-active" : ""}`}
                      aria-hidden="true"
                    />
                    <button
                      type="button"
                      className={`kwiz-adventure-card${cardPressed ? " is-pressed" : ""}${flipTransitioning ? " is-flipping" : ""}`}
                      onPointerDown={() => setCardPressed(true)}
                      onPointerUp={() => setCardPressed(false)}
                      onPointerCancel={() => setCardPressed(false)}
                      onPointerLeave={() => setCardPressed(false)}
                      onClick={beginRevealInteraction}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        beginRevealInteraction();
                      }}
                      disabled={cardPhase === "pre_countdown"}
                    >
                      <span className="kwiz-adventure-card-inset" aria-hidden="true" />
                      <span className="kwiz-adventure-card-badge" aria-hidden="true">⚡</span>
                      <span className="kwiz-adventure-stars" aria-hidden="true">
                        <span className="is-filled">•</span>
                        <span className="is-filled">•</span>
                        <span className="is-filled">•</span>
                        <span>•</span>
                        <span>•</span>
                      </span>
                      <span className="kwiz-adventure-brand">KWIZHERO</span>
                      {cardPhase === "pre_countdown" ? (
                        <span className="kwiz-countdown-overlay" aria-live="polite">
                          <span className="kwiz-adventure-countdown-label">{t("player.countdownReady")}</span>
                          <span className="kwiz-countdown-number">{preRevealCountdown ?? 0}</span>
                        </span>
                      ) : null}
                    </button>
                  </div>

                  <Text className="kwiz-adventure-tap-hint">● Tap card to reveal question</Text>

                  <div className="kwiz-adventure-dot-strip" aria-hidden="true">
                    {Array.from({ length: Math.max(currentWaypointQuestionCount, 1) }).map((_, index) => (
                      <span
                        key={`dot-pre-${index}`}
                        className={`kwiz-adventure-dot${index === activeQuestionIndex ? " is-active" : ""}`}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <div className="kwiz-adventure-question-shell kwiz-reveal-enter">
                  <div className="kwiz-adventure-question-header">
                    <div className="kwiz-adventure-header">
                      <button type="button" className="kwiz-adventure-back" onClick={leaveQuestionScreen}>
                        <IconChevronLeft size={16} />
                        <span>{t("common.back")}</span>
                      </button>
                      <div className="kwiz-adventure-xp">+240 XP</div>
                    </div>

                    <div className="kwiz-adventure-progress-track" aria-hidden="true">
                      <span
                        className="kwiz-adventure-progress-fill"
                        style={{ width: `${(Math.max(activeQuestionIndex + 1, 1) / Math.max(currentWaypointQuestionCount, 1)) * 100}%` }}
                      />
                    </div>

                    <div className="kwiz-adventure-question-meta">
                      <span className="kwiz-adventure-location-badge">📍 {quizWalk.waypoints[lockedWaypointIndex].title}</span>
                      <span>{`Question ${activeQuestionIndex + 1} of ${currentWaypointQuestionCount}`}</span>
                    </div>
                  </div>

                  <div className="kwiz-adventure-question-body">
                    <Text className="kwiz-adventure-question-title">{currentQuestion.text}</Text>
                    {remainingSeconds !== null ? (
                      <Badge color={remainingSeconds <= 5 ? "red" : "blue"} size="lg">
                        {t("player.timeRemaining", { seconds: remainingSeconds })}
                      </Badge>
                    ) : null}
                    {anyOrderQuestionsEnabled && unansweredQuestionOptions.length > 1 ? (
                      <Select
                        label={t("player.questionPicker")}
                        value={String(activeQuestionIndex)}
                        data={unansweredQuestionOptions}
                        onChange={(value) => setActiveQuestionIndex(Number(value ?? String(activeQuestionIndex)))}
                      />
                    ) : null}
                    {renderQuestionInput(currentQuestion)}
                    <Button className="kwiz-adventure-submit" onClick={submitAnswer} disabled={questionTimedOut}>
                      {t("player.submitAnswer")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {debugMode && debugWalk ? (
          <Card withBorder radius="md">
            <Stack gap="sm">
              <Group justify="space-between">
                <Title order={4}>{t("player.debugTitle", { title: debugWalk.title })}</Title>
                <Badge>{t("player.debugCounter", { current: flatDebugIndex + 1, total: debugQuestions.length })}</Badge>
              </Group>

              <Group>
                <Button
                  variant="light"
                  leftSection={<IconPlayerTrackPrev size={16} />}
                  onClick={() => {
                    const prev = Math.max(0, flatDebugIndex - 1);
                    const prevEntry = debugQuestions[prev];
                    if (prevEntry) {
                      setDebugWaypointIndex(prevEntry.waypointIndex);
                      setDebugQuestionIndex(prevEntry.questionIndex);
                    }
                  }}
                  disabled={flatDebugIndex <= 0}
                >
                  {t("player.debugPrevious")}
                </Button>
                <Button
                  variant="light"
                  leftSection={<IconPlayerSkipForward size={16} />}
                  onClick={() => {
                    const next = Math.min(debugQuestions.length - 1, flatDebugIndex + 1);
                    const nextEntry = debugQuestions[next];
                    if (nextEntry) {
                      setDebugWaypointIndex(nextEntry.waypointIndex);
                      setDebugQuestionIndex(nextEntry.questionIndex);
                    }
                  }}
                  disabled={flatDebugIndex >= debugQuestions.length - 1}
                >
                  {t("player.debugNext")}
                </Button>
              </Group>

              {debugWalk && debugWaypoint ? (
                <Select
                  label={t("player.debugWaypoint")}
                  data={debugWalk.waypoints.map((waypoint, index) => ({
                    value: String(index),
                    label: `${index + 1}. ${waypoint.title}`,
                  }))}
                  value={String(debugWaypointIndex)}
                  onChange={(value: string | null) => {
                    const nextWaypointIndex = Number(value ?? "0");
                    setDebugWaypointIndex(nextWaypointIndex);
                    setDebugQuestionIndex(0);
                  }}
                />
              ) : null}

              {debugWalk && debugWaypoint && debugQuestion ? (
                <Card withBorder radius="md" p="sm">
                  <Stack gap="sm">
                    <Text fw={600}>{debugWaypoint.title}</Text>
                    <Text>{debugQuestion.text}</Text>
                    <Text c="dimmed" size="sm">
                      {t("player.debugQuestionCount", {
                        current: debugQuestionIndex + 1,
                        total: debugWaypoint.questions.length,
                      })}
                    </Text>
                    <Group>
                      <Select
                        label={t("player.debugQuestion")}
                        data={debugWaypoint.questions.map((question, index) => ({
                          value: String(index),
                          label: `${index + 1}. ${question.text.slice(0, 40) || "Untitled"}`,
                        }))}
                        value={String(debugQuestionIndex)}
                        onChange={(value: string | null) => setDebugQuestionIndex(Number(value ?? "0"))}
                      />
                    </Group>
                    <Badge>{t("player.debugQuestionType", { type: debugQuestion.questionType })}</Badge>
                  </Stack>
                </Card>
              ) : null}
            </Stack>
          </Card>
        ) : null}

        {error ? (
          <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
            {error}
          </Alert>
        ) : null}

      </Stack>
      {completionToast ? <div className="kwiz-completion-toast">{completionToast}</div> : null}
      {activeTieredBadgeToast ? (
        <button
          type="button"
          className="kwiz-badge-toast"
          onClick={() => setActiveTieredBadgeToast(null)}
        >
          {resolveBadgeImageSrc(activeTieredBadgeToast.imageKey) ? (
            <img
              src={resolveBadgeImageSrc(activeTieredBadgeToast.imageKey) ?? ""}
              alt=""
              aria-hidden="true"
              className="kwiz-badge-toast-icon-image"
            />
          ) : (
            <span className="kwiz-badge-toast-icon" aria-hidden="true">🏅</span>
          )}
          <span className="kwiz-badge-toast-copy">
            <span className="kwiz-badge-toast-title">{activeTieredBadgeToast.displayName}</span>
            <span className="kwiz-badge-toast-subtitle">+{activeTieredBadgeToast.xpReward} XP</span>
          </span>
        </button>
      ) : null}
      {activeDiscoveryBadge ? (
        <div className="kwiz-discovery-overlay" role="dialog" aria-modal="true">
          <div className="kwiz-discovery-shell">
            <Text className="kwiz-discovery-label">{t("player.discoveryLabel")}</Text>
            <div className="kwiz-discovery-icon" aria-hidden="true">🌙</div>
            <Title order={2} className="kwiz-discovery-title">{activeDiscoveryBadge.event.displayName}</Title>
            <Text className="kwiz-discovery-text">{activeDiscoveryBadge.event.flavourText}</Text>
            <Button className="kwiz-discovery-cta" onClick={() => void dismissActiveDiscoveryBadge()}>
              {t("player.badgeKeepGoing")}
            </Button>
            {activeDiscoveryBadge.showFirstHint ? (
              <Text className="kwiz-discovery-hint">{t("player.discoveryFirstHint")}</Text>
            ) : null}
          </div>
        </div>
      ) : null}
    </Paper>
  );
}
