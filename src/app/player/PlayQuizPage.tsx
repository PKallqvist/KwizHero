import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
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
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Image,
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
  IconClock,
  IconPlayerSkipForward,
  IconPlayerTrackPrev,
  IconTrophy,
  IconX,
} from "@tabler/icons-react";
import { firebaseConfigError } from "../../platform/firebase/firebase";
import { kwizTokens } from "../../platform/theme/kwizTokens";
import {
  getQuizWalk,
  getQuizSummary,
  startSession,
  submitFirstAnswer,
} from "../../platform/firebase/quizRepository";
import { distanceMeters, formatDistanceMeters, getCurrentCoordinates, routeDistanceMeters } from "../../platform/map/geolocation";
import { resolveRevealPhase } from "../../domain/reveal";
import type { AnswerResult, QuizSummary, QuizWalk, QuizWalkQuestion, QuizWalkWaypoint } from "../../domain/types";
import type { Coordinates } from "../../platform/map/geolocation";

type QuestionCardPhase = "back" | "pre_countdown" | "front";

interface JourneyMapProps {
  waypoints: QuizWalkWaypoint[];
  targetWaypointIndex: number;
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
      map.setView(points[0], 15);
      return;
    }

    map.fitBounds(latLngBounds(points), { padding: [30, 30] });
  }, [map, props.current, props.waypoints]);

  return null;
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
          <Polyline
            positions={props.waypoints.map((waypoint) => [waypoint.lat, waypoint.lng] as [number, number])}
            pathOptions={{ color: kwizTokens.map.routePath, weight: 3, opacity: 0.65 }}
          />
          {props.waypoints.slice(0, -1).map((waypoint, index) => {
            const next = props.waypoints[index + 1];
            if (!next) return null;
            return (
              <CircleMarker
                key={`journey-arrow-${waypoint.id}`}
                center={[(waypoint.lat + next.lat) / 2, (waypoint.lng + next.lng) / 2]}
                radius={1}
                pathOptions={{ color: kwizTokens.map.routePath, fillColor: kwizTokens.map.routePath, fillOpacity: 0 }}
              >
                <LeafletTooltip permanent direction="center" offset={[0, 0]}>-&gt;</LeafletTooltip>
              </CircleMarker>
            );
          })}
        </>
      ) : null}

      {props.waypoints.map((waypoint, index) => {
        const isTarget = index === props.targetWaypointIndex;
        return (
          <CircleMarker
            key={`journey-waypoint-${waypoint.id}`}
            center={[waypoint.lat, waypoint.lng]}
            radius={isTarget ? 8 : 6}
            pathOptions={{
              color: isTarget ? kwizTokens.map.selectedWaypoint : kwizTokens.map.waypointMuted,
              fillColor: isTarget ? kwizTokens.map.selectedWaypoint : kwizTokens.map.waypointDefault,
              fillOpacity: 1,
            }}
          >
            <LeafletTooltip permanent={isTarget} direction="top" offset={[0, -8]}>
              {`${index + 1}. ${waypoint.title}`}
            </LeafletTooltip>
            {props.orderedRoute && index === 0 ? (
              <LeafletTooltip permanent direction="bottom" offset={[0, 10]}>START</LeafletTooltip>
            ) : null}
            {props.orderedRoute && index === props.waypoints.length - 1 && props.waypoints.length > 1 ? (
              <LeafletTooltip permanent direction="bottom" offset={[0, 24]}>END</LeafletTooltip>
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
  const { t } = useTranslation();
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
  const [questionStartMs, setQuestionStartMs] = useState<number | null>(null);
  const [questionDeadlineMs, setQuestionDeadlineMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [questionTimedOut, setQuestionTimedOut] = useState(false);

  const [error, setError] = useState<string | null>(firebaseConfigError);
  const [loading, setLoading] = useState(false);
  const [debugBarDismissed, setDebugBarDismissed] = useState(false);

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

  const debugModeOnUrl = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("debug", "1");
    const query = params.toString();
    return `${window.location.pathname}${query ? `?${query}` : ""}`;
  }, []);

  const debugModeOffUrl = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    params.delete("debug");
    const query = params.toString();
    return `${window.location.pathname}${query ? `?${query}` : ""}`;
  }, []);

  const currentWaypoint = quizWalk?.waypoints[activeWaypointIndex] ?? null;
  const currentQuestion =
    lockedWaypointIndex !== null
      ? quizWalk?.waypoints[lockedWaypointIndex]?.questions[activeQuestionIndex] ?? null
      : null;

  const totalRouteDistance = useMemo(
    () => routeDistanceMeters((quizWalk?.waypoints ?? []).map((waypoint) => ({ lat: waypoint.lat, lng: waypoint.lng }))),
    [quizWalk]
  );

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
    setDebugBarDismissed(false);
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

  function renderQuestionInput(question: QuizWalkQuestion): JSX.Element | null {
    const questionType = question.questionType ?? "multiple_choice";

    if (questionType === "numeric") {
      return (
        <NumberInput
          label={t("player.numericAnswer")}
          value={numericAnswer ?? undefined}
          onChange={(value) => setNumericAnswer(typeof value === "number" ? value : null)}
        />
      );
    }

    if (questionType === "letter_order") {
      return (
        <TextInput
          label={t("player.letterOrderAnswer")}
          value={letterOrderAnswer}
          onChange={(e) => setLetterOrderAnswer(e.currentTarget.value)}
        />
      );
    }

    return (
      <Checkbox.Group value={selectedChoiceIds} onChange={setSelectedChoiceIds}>
        <Stack gap="xs">
          {question.choices.map((choice) => (
            <Checkbox key={choice.id} value={choice.id} label={choice.text} />
          ))}
        </Stack>
      </Checkbox.Group>
    );
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

  function renderAnswerFeedback(): JSX.Element | null {
    if (debugMode || !answerResult || !summary) return null;

    const phase = resolveRevealPhase(summary.revealMode, sessionComplete, summary.revealAt);

    if (phase === "full") {
      return (
        <Alert icon={<IconTrophy size={16} />} color={answerResult.isCorrect ? "teal" : "orange"} variant="light">
          {answerResult.isCorrect ? t("player.resultCorrect") : t("player.resultIncorrect")}
          {". "}
          {t("player.resultPoints", {
            points: answerResult.pointsAwarded,
            score: answerResult.score,
          })}
        </Alert>
      );
    }

    if (phase === "score_only") {
      return (
        <Alert icon={<IconTrophy size={16} />} color="teal" variant="light">
          {t("player.resultSubmitted", { score: answerResult.score })}
        </Alert>
      );
    }

    const revealDate = summary.revealAt ? new Date(summary.revealAt).toLocaleString() : "";
    return (
      <Alert icon={<IconClock size={16} />} color="blue" variant="light">
        {t("player.resultScheduled", { date: revealDate })}
      </Alert>
    );
  }

  const showGameplay = Boolean(sessionId && quizWalk && !debugMode && !sessionComplete);
  const journeyMode = showGameplay && lockedWaypointIndex === null;
  const cardMode = showGameplay && lockedWaypointIndex !== null && currentQuestion;
  const showDebugBar = !debugBarDismissed || !showGameplay;

  const currentWaypointQuestionCount =
    lockedWaypointIndex !== null ? quizWalk?.waypoints[lockedWaypointIndex]?.questions.length ?? 0 : 0;
  const currentQuestionGlobal =
    lockedWaypointIndex !== null ? getGlobalQuestionNumber(lockedWaypointIndex, activeQuestionIndex) : 0;

  return (
    <Paper withBorder shadow="sm" radius="md" p="lg">
      <Stack gap="md" className={showGameplay ? "kwiz-player-gameplay-root" : undefined}>
        {!showGameplay ? <Title order={2}>{t("player.joinTitle")}</Title> : null}

        {showDebugBar ? (
        <Alert color={debugMode ? "blue" : "gray"} variant="light">
          <Group justify="space-between" align="center" wrap="wrap" gap="xs">
            <Stack gap={2}>
              <Text size="sm">{debugMode ? t("player.debugMode") : t("player.debugToolsHint")}</Text>
              {showGameplay && mockGpsWalkEnabled ? (
                <Text size="xs" c="dimmed">{t("player.mockGpsWalkActive")}</Text>
              ) : null}
            </Stack>
            <Group gap="xs" wrap="wrap">
              {showGameplay ? (
                <Button
                  size="xs"
                  variant={mockGpsWalkEnabled ? "filled" : "light"}
                  color={mockGpsWalkEnabled ? "orange" : "gray"}
                  onClick={() => {
                    if (!mockGpsWalkEnabled) {
                      setMockGpsWalkEnabled(true);
                      setMockLocationToWaypoint(activeWaypointIndex);
                      return;
                    }
                    setMockGpsWalkEnabled(false);
                  }}
                >
                  {mockGpsWalkEnabled ? t("player.disableMockGpsWalk") : t("player.enableMockGpsWalk")}
                </Button>
              ) : null}
              <Button
                size="xs"
                variant="light"
                component="a"
                href={debugMode ? debugModeOffUrl : debugModeOnUrl}
              >
                {debugMode ? t("player.closeDebugTools") : t("player.openDebugTools")}
              </Button>
              {showGameplay ? (
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  aria-label={t("player.hideDebugBar")}
                  onClick={() => setDebugBarDismissed(true)}
                >
                  <IconX size={16} />
                </ActionIcon>
              ) : null}
            </Group>
          </Group>
        </Alert>
        ) : null}

        {!showGameplay ? (
        <Group>
          <Button onClick={loadQuiz} loading={loading} disabled={Boolean(firebaseConfigError)}>
            {t("player.loadQuiz")}
          </Button>
        </Group>
        ) : null}

        {summary && !sessionId ? (
          <Card withBorder radius="md">
            <Stack gap="sm">
              <Title order={3}>{summary.title}</Title>
              <Text>{summary.description}</Text>
              <Text c="dimmed" size="sm">
                {t("player.open")}: {new Date(summary.openAt).toLocaleString()} &nbsp;|&nbsp;
                {t("player.close")}: {new Date(summary.closeAt).toLocaleString()}
              </Text>
              <TextInput label={t("player.nickname")} value={nickname} onChange={(e) => setNickname(e.currentTarget.value)} />
              <Group>
                <Button onClick={joinQuiz}>{t("player.start")}</Button>
              </Group>
            </Stack>
          </Card>
        ) : null}

        {journeyMode && quizWalk && currentWaypoint ? (
          <Card withBorder radius="md" p="sm" className="kwiz-player-fill-card">
            <Stack gap="sm" className="kwiz-player-fill-stack">
              <Text fw={700}>{t("player.journeyTowards", { nickname: nickname || t("player.locationYou") })}</Text>
              <Text size="sm" c="dimmed">
                {t("player.routeDistance", { distance: formatDistanceMeters(totalRouteDistance) })}
              </Text>
              <Title order={4}>
                {t("player.journeyWaypointDistance", {
                  waypoint: currentWaypoint.title,
                  meters: Math.max(0, Math.round(distanceToWaypoint ?? 0)),
                })}
              </Title>
              <Text size="sm" c="dimmed">
                {t("player.nextTargetDistance", { distance: formatDistanceMeters(nextTargetDistance ?? 0) })}
              </Text>

              <div className="kwiz-player-fill-pane">
                <JourneyMap
                  waypoints={quizWalk.waypoints}
                  targetWaypointIndex={activeWaypointIndex}
                  current={playerCoordinates}
                  radius={getGateRadiusMeters()}
                  currentLabel={nickname || t("player.locationYou")}
                  orderedRoute={summary?.requireSequentialWaypoints ?? true}
                />
              </div>

              <Group justify="space-between" align="center" wrap="wrap">
                <Text size="sm" c="dimmed">
                  {playerCoordinates
                    ? t("player.locationTracking", {
                        lat: playerCoordinates.lat.toFixed(5),
                        lng: playerCoordinates.lng.toFixed(5),
                      })
                    : t("player.locationCurrentUnknown")}
                </Text>
                <Button
                  size="xs"
                  variant="light"
                  onClick={refreshCurrentLocation}
                  loading={locationRefreshing}
                  disabled={mockGpsWalkEnabled}
                >
                  {t("player.locationRefresh")}
                </Button>
              </Group>
            </Stack>
          </Card>
        ) : null}

        {cardMode && currentQuestion && quizWalk && lockedWaypointIndex !== null ? (
          <Card withBorder radius="md" p="sm" className="kwiz-player-fill-card-hidden">
            <Stack gap="sm" align="stretch" className="kwiz-player-fill-stack">
              <Text fw={700}>
                {t("player.atWaypoint", { nickname: nickname || t("player.locationYou"), waypoint: quizWalk.waypoints[lockedWaypointIndex].title })}
              </Text>

              {currentWaypointQuestionCount > 1 ? (
                <Text c="dimmed" size="sm">
                  {t("player.questionProgress", {
                    global: currentQuestionGlobal,
                    inWaypoint: activeQuestionIndex + 1,
                    totalInWaypoint: currentWaypointQuestionCount,
                  })}
                </Text>
              ) : null}

              <div className="kwiz-player-fill-pane-hidden">
                <Stack gap="sm" align="stretch">
                  {cardPhase !== "front" ? (
                    <Paper
                      withBorder
                      radius="md"
                      p="md"
                      className="kwiz-card-back kwiz-card-back-clickable kwiz-card-back-min"
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        if (cardPhase === "pre_countdown") return;
                        revealQuestionCard();
                      }}
                      onKeyDown={(event) => {
                        if (cardPhase === "pre_countdown") return;
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        revealQuestionCard();
                      }}
                    >
                      {cardPhase === "pre_countdown" ? (
                        <div className="kwiz-countdown-overlay" aria-live="polite">
                          <Text size="xs" c="dimmed">{t("player.countdownReady")}</Text>
                          <Title order={2} className="kwiz-countdown-number">{preRevealCountdown ?? 0}</Title>
                        </div>
                      ) : null}

                      <Stack gap="sm" align="center" justify="center" className="kwiz-card-back-content">
                        <Image
                          src="/branding/card-backside.png"
                          alt="KwizHero"
                          h={64}
                          w="100%"
                          className="kwiz-card-back-logo"
                          fit="contain"
                        />
                        <Text fw={700}>{t("player.cardBackTitle")}</Text>
                        <Text c="dimmed">{t("player.cardBackHint")}</Text>
                        {effectiveQuestionTimerSeconds !== null ? (
                          <Alert color="orange" variant="light" w="100%">
                            {t("player.questionTimedNotice", { seconds: effectiveQuestionTimerSeconds })}
                          </Alert>
                        ) : null}
                      </Stack>
                    </Paper>
                  ) : null}

                  {cardPhase === "front" ? (
                    <div className="kwiz-reveal-enter">
                      <Stack gap="sm">
                        <Title order={5}>{currentQuestion.text}</Title>
                        {remainingSeconds !== null ? (
                          <Badge color={remainingSeconds <= 5 ? "red" : "teal"} size="lg">
                            {t("player.timeRemaining", { seconds: remainingSeconds })}
                          </Badge>
                        ) : null}
                        {renderQuestionInput(currentQuestion)}
                        <Group>
                          <Button onClick={submitAnswer} disabled={questionTimedOut}>
                            {t("player.submitAnswer")}
                          </Button>
                        </Group>
                      </Stack>
                    </div>
                  ) : null}
                </Stack>
              </div>
            </Stack>
          </Card>
        ) : null}

        {sessionComplete ? (
          <Alert icon={<IconTrophy size={16} />} color="teal" variant="light">
            {t("player.journeyComplete")}
          </Alert>
        ) : null}

        {renderAnswerFeedback()}

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
    </Paper>
  );
}
