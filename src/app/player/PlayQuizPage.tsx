import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { latLngBounds } from "leaflet";
import { Circle, CircleMarker, MapContainer, TileLayer, Tooltip as LeafletTooltip, useMap } from "react-leaflet";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
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
  IconClock,
  IconMap2,
  IconMapPin,
  IconPlayerSkipForward,
  IconPlayerTrackPrev,
  IconTrophy,
} from "@tabler/icons-react";
import { firebaseConfigError } from "../../platform/firebase/firebase";
import {
  getQuizWalk,
  getFirstPlayable,
  getQuizSummary,
  startSession,
  submitFirstAnswer,
} from "../../platform/firebase/quizRepository";
import { distanceMeters, getCurrentCoordinates } from "../../platform/map/geolocation";
import { resolveRevealPhase } from "../../domain/reveal";
import type { AnswerResult, FirstPlayable, QuizSummary, QuizWalk } from "../../domain/types";
import type { Coordinates } from "../../platform/map/geolocation";

type QuestionCardPhase = "back" | "pre_countdown" | "front";

interface TravelMapProps {
  target: Coordinates;
  current: Coordinates | null;
  radius: number;
  targetLabel: string;
  currentLabel: string;
}

function FitTravelBounds(props: { target: Coordinates; current: Coordinates | null }): null {
  const map = useMap();

  useEffect(() => {
    if (props.current) {
      const bounds = latLngBounds([
        [props.target.lat, props.target.lng],
        [props.current.lat, props.current.lng],
      ]);
      map.fitBounds(bounds, { padding: [32, 32] });
      return;
    }

    map.setView([props.target.lat, props.target.lng], 15);
  }, [map, props.current, props.target]);

  return null;
}

function TravelMap(props: TravelMapProps): JSX.Element {
  return (
    <MapContainer
      center={[props.target.lat, props.target.lng]}
      zoom={15}
      scrollWheelZoom
      style={{ height: 240, width: "100%", borderRadius: 12, border: "1px solid var(--mantine-color-gray-4)" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitTravelBounds target={props.target} current={props.current} />
      <Circle
        center={[props.target.lat, props.target.lng]}
        radius={props.radius}
        pathOptions={{ color: "#0f6b5f", fillOpacity: 0.2 }}
      />
      <CircleMarker
        center={[props.target.lat, props.target.lng]}
        radius={7}
        pathOptions={{ color: "#0f6b5f", fillColor: "#0f6b5f", fillOpacity: 1 }}
      >
        <LeafletTooltip permanent direction="top" offset={[0, -10]}>{props.targetLabel}</LeafletTooltip>
      </CircleMarker>
      {props.current ? (
        <CircleMarker
          center={[props.current.lat, props.current.lng]}
          radius={7}
          pathOptions={{ color: "#1c7ed6", fillColor: "#1c7ed6", fillOpacity: 1 }}
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
  const [playable, setPlayable] = useState<FirstPlayable | null>(null);
  const [debugWalk, setDebugWalk] = useState<QuizWalk | null>(null);
  const [debugWaypointIndex, setDebugWaypointIndex] = useState(0);
  const [debugQuestionIndex, setDebugQuestionIndex] = useState(0);

  const [distanceToWaypoint, setDistanceToWaypoint] = useState<number | null>(null);
  const [playerCoordinates, setPlayerCoordinates] = useState<Coordinates | null>(null);
  const [locationRefreshing, setLocationRefreshing] = useState(false);
  const [waypointUnlocked, setWaypointUnlocked] = useState(false);
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

  const effectiveQuestionTimerSeconds = useMemo(() => {
    if (!playable || !summary) return null;
    return playable.question.config.timerSeconds ?? summary.questionTimeLimitSeconds ?? null;
  }, [playable, summary]);

  const remainingSeconds =
    questionDeadlineMs && cardPhase === "front"
      ? Math.max(0, Math.ceil((questionDeadlineMs - nowMs) / 1000))
      : null;

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

      if (debugMode) {
        const walk = await getQuizWalk(quizId);
        setDebugWalk(walk);
        setDebugWaypointIndex(0);
        setDebugQuestionIndex(0);
        if (!walk) {
          setError(t("player.errorNoPlayable"));
        }
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

    setError(null);
    const sid = await startSession(quizId, nickname.trim());
    setSessionId(sid);

    const firstPlayable = await getFirstPlayable(quizId);
    if (!firstPlayable) {
      setError(t("player.errorNoPlayable"));
      return;
    }

    setPlayable(firstPlayable);
    setCardPhase("back");
    setWaypointUnlocked(false);
    setAnswerResult(null);
    setSessionComplete(false);
    setSelectedChoiceIds([]);
    setNumericAnswer(null);
    setLetterOrderAnswer("");
    setQuestionTimedOut(false);
    setQuestionDeadlineMs(null);
    setPreRevealCountdown(null);
  }

  async function unlockWaypoint(): Promise<void> {
    if (debugMode || !playable) return;
    setError(null);

    try {
      const current = await getCurrentCoordinates();
      setPlayerCoordinates(current);
      const distance = distanceMeters(current, {
        lat: playable.waypoint.lat,
        lng: playable.waypoint.lng,
      });
      setDistanceToWaypoint(distance);

      if (distance <= playable.waypoint.gateRadiusMeters) {
        setWaypointUnlocked(true);
        setCardPhase("back");
      } else {
        setError(
          t("player.tooFarError", {
            actual: Math.round(distance),
            required: playable.waypoint.gateRadiusMeters,
          })
        );
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function refreshCurrentLocation(): Promise<void> {
    if (debugMode || !playable) return;
    setLocationRefreshing(true);
    setError(null);

    try {
      const current = await getCurrentCoordinates();
      setPlayerCoordinates(current);
      const distance = distanceMeters(current, {
        lat: playable.waypoint.lat,
        lng: playable.waypoint.lng,
      });
      setDistanceToWaypoint(distance);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLocationRefreshing(false);
    }
  }

  useEffect(() => {
    if (debugMode || !playable) return;
    if (!("geolocation" in navigator)) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const current = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setPlayerCoordinates(current);
        const distance = distanceMeters(current, {
          lat: playable.waypoint.lat,
          lng: playable.waypoint.lng,
        });
        setDistanceToWaypoint(distance);
      },
      () => {
        // Ignore watch errors and keep manual refresh available.
      },
      {
        enableHighAccuracy: true,
        maximumAge: 4000,
        timeout: 12000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [debugMode, playable]);

  function revealQuestionCard(): void {
    if (!playable) return;

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

  async function submitAnswer(): Promise<void> {
    if (debugMode || !sessionId || !playable) return;
    if (questionTimedOut) {
      setError(t("player.errorTimeExpired"));
      return;
    }

    const questionType = playable.question.questionType ?? "multiple_choice";
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
        waypointId: playable.waypoint.id,
        questionId: playable.question.id,
        selectedChoiceIds: questionType === "multiple_choice" ? selectedChoiceIds : [],
        numericAnswer: questionType === "numeric" ? numericAnswer : null,
        letterOrderAnswer: questionType === "letter_order" ? letterOrderAnswer : null,
        elapsedMs,
      });
      setAnswerResult(result);
      setSessionComplete(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function renderQuestionInput(): JSX.Element | null {
    if (!playable) return null;
    const questionType = playable.question.questionType ?? "multiple_choice";

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
          {playable.question.choices.map((choice) => (
            <Checkbox key={choice.id} value={choice.id} label={choice.text} />
          ))}
        </Stack>
      </Checkbox.Group>
    );
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

  return (
    <Paper withBorder shadow="sm" radius="md" p="lg">
      <Stack gap="md">
        <Title order={2}>{t("player.joinTitle")}</Title>

        <Alert color={debugMode ? "blue" : "gray"} variant="light">
          <Group justify="space-between" align="center" wrap="wrap">
            <Text size="sm">{debugMode ? t("player.debugMode") : t("player.debugToolsHint")}</Text>
            <Button
              size="xs"
              variant="light"
              component="a"
              href={debugMode ? debugModeOffUrl : debugModeOnUrl}
            >
              {debugMode ? t("player.closeDebugTools") : t("player.openDebugTools")}
            </Button>
          </Group>
        </Alert>

        <Group>
          <Button onClick={loadQuiz} loading={loading} disabled={Boolean(firebaseConfigError)}>
            {t("player.loadQuiz")}
          </Button>
        </Group>

        {summary ? (
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

        {playable ? (
          <Card withBorder radius="md">
            <Stack gap="sm">
              <Group gap="xs">
                <IconMapPin size={18} />
                <Title order={4}>{t("player.waypointLabel", { title: playable.waypoint.title })}</Title>
              </Group>
              <Text c="dimmed" size="sm">
                {t("player.waypointTarget", {
                  lat: playable.waypoint.lat.toFixed(5),
                  lng: playable.waypoint.lng.toFixed(5),
                })}
              </Text>
              <Card withBorder radius="md" p="sm">
                <Stack gap="xs">
                  <Group gap="xs" align="center">
                    <IconMap2 size={16} />
                    <Text size="sm" fw={600}>{t("player.locationPanelTitle")}</Text>
                  </Group>
                  <TravelMap
                    target={{ lat: playable.waypoint.lat, lng: playable.waypoint.lng }}
                    current={playerCoordinates}
                    radius={playable.waypoint.gateRadiusMeters}
                    targetLabel={playable.waypoint.title}
                    currentLabel={t("player.locationYou")}
                  />
                  <Group justify="space-between" align="center" wrap="wrap">
                    <Text size="sm" c="dimmed">
                      {playerCoordinates
                        ? t("player.locationTracking", {
                            lat: playerCoordinates.lat.toFixed(5),
                            lng: playerCoordinates.lng.toFixed(5),
                          })
                        : t("player.locationCurrentUnknown")}
                    </Text>
                    <Button size="xs" variant="light" onClick={refreshCurrentLocation} loading={locationRefreshing}>
                      {t("player.locationRefresh")}
                    </Button>
                  </Group>
                </Stack>
              </Card>
              <Group>
                <Button variant="light" onClick={unlockWaypoint} disabled={waypointUnlocked}>
                  {waypointUnlocked ? t("player.waypointUnlocked") : t("player.checkWaypoint")}
                </Button>
              </Group>

              {distanceToWaypoint !== null ? (
                <Text c="dimmed" size="sm">
                  {t("player.distanceAway", { meters: Math.round(distanceToWaypoint) })}
                </Text>
              ) : null}

              {waypointUnlocked && !answerResult ? (
                <Card withBorder radius="md" p="sm">
                  <Stack gap="sm" align="stretch">
                    {cardPhase === "back" ? (
                      <>
                        <Text fw={700}>{t("player.cardBackTitle")}</Text>
                        <Text c="dimmed">{t("player.cardBackHint")}</Text>
                        {effectiveQuestionTimerSeconds !== null ? (
                          <Alert color="orange" variant="light">
                            {t("player.questionTimedNotice", { seconds: effectiveQuestionTimerSeconds })}
                          </Alert>
                        ) : null}
                        <Button onClick={revealQuestionCard}>{t("player.revealQuestion")}</Button>
                      </>
                    ) : null}

                    {cardPhase === "pre_countdown" ? (
                      <Stack gap="xs" align="center">
                        <Text c="dimmed">{t("player.countdownReady")}</Text>
                        <Title order={1}>{preRevealCountdown ?? 0}</Title>
                      </Stack>
                    ) : null}

                    {cardPhase === "front" ? (
                      <>
                        <Title order={5}>{playable.question.text}</Title>
                        {remainingSeconds !== null ? (
                          <Badge color={remainingSeconds <= 5 ? "red" : "teal"} size="lg">
                            {t("player.timeRemaining", { seconds: remainingSeconds })}
                          </Badge>
                        ) : null}
                        {renderQuestionInput()}
                        <Group>
                          <Button onClick={submitAnswer} disabled={questionTimedOut}>
                            {t("player.submitAnswer")}
                          </Button>
                        </Group>
                      </>
                    ) : null}
                  </Stack>
                </Card>
              ) : null}

              {renderAnswerFeedback()}
            </Stack>
          </Card>
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
    </Paper>
  );
}
