import { useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Button,
  Card,
  Group,
  Paper,
  Radio,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconAlertCircle, IconClock, IconMapPin, IconTrophy } from "@tabler/icons-react";
import {
  getFirstPlayable,
  getQuizSummary,
  startSession,
  submitFirstAnswer,
} from "../../platform/firebase/quizRepository";
import { distanceMeters, getCurrentCoordinates } from "../../platform/map/geolocation";
import { resolveRevealPhase } from "../../domain/reveal";
import type { AnswerResult, FirstPlayable, QuizSummary } from "../../domain/types";

export function PlayQuizPage(): JSX.Element {
  const { t } = useTranslation();
  const { quizId = "" } = useParams();
  const [nickname, setNickname] = useState("");
  const [summary, setSummary] = useState<QuizSummary | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [playable, setPlayable] = useState<FirstPlayable | null>(null);
  const [distanceToWaypoint, setDistanceToWaypoint] = useState<number | null>(null);
  const [waypointUnlocked, setWaypointUnlocked] = useState(false);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string>("");
  const [answerResult, setAnswerResult] = useState<AnswerResult | null>(null);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [questionStartMs, setQuestionStartMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadQuiz(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const q = await getQuizSummary(quizId);
      setSummary(q);
      if (!q) {
        setError(t("player.noQuiz"));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function joinQuiz(): Promise<void> {
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
  }

  async function unlockWaypoint(): Promise<void> {
    if (!playable) return;
    setError(null);
    try {
      const current = await getCurrentCoordinates();
      const distance = distanceMeters(current, {
        lat: playable.waypoint.lat,
        lng: playable.waypoint.lng,
      });
      setDistanceToWaypoint(distance);
      if (distance <= playable.waypoint.gateRadiusMeters) {
        setWaypointUnlocked(true);
        setQuestionStartMs(Date.now());
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

  async function submitAnswer(): Promise<void> {
    if (!sessionId || !playable || !selectedChoiceId) {
      setError(t("player.errorSelectAnswer"));
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
        selectedChoiceId,
        elapsedMs,
      });
      setAnswerResult(result);
      setSessionComplete(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function renderAnswerFeedback(): JSX.Element | null {
    if (!answerResult || !summary) return null;

    const phase = resolveRevealPhase(summary.revealMode, sessionComplete, summary.revealAt);

    if (phase === "full") {
      return (
        <Alert
          icon={<IconTrophy size={16} />}
          color={answerResult.isCorrect ? "teal" : "orange"}
          variant="light"
        >
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

    // hidden — scheduled reveal not yet reached
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

        <Group>
          <Button onClick={loadQuiz} loading={loading}>
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
              <TextInput
                label={t("player.nickname")}
                value={nickname}
                onChange={(e) => setNickname(e.currentTarget.value)}
              />
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
                <Title order={4}>
                  {t("player.waypointLabel", { title: playable.waypoint.title })}
                </Title>
              </Group>
              <Text c="dimmed" size="sm">
                {t("player.waypointTarget", {
                  lat: playable.waypoint.lat.toFixed(5),
                  lng: playable.waypoint.lng.toFixed(5),
                })}
              </Text>
              <Group>
                <Button
                  variant="light"
                  onClick={unlockWaypoint}
                  disabled={waypointUnlocked}
                >
                  {waypointUnlocked
                    ? t("player.waypointUnlocked")
                    : t("player.checkWaypoint")}
                </Button>
              </Group>

              {distanceToWaypoint !== null ? (
                <Text c="dimmed" size="sm">
                  {t("player.distanceAway", { meters: Math.round(distanceToWaypoint) })}
                </Text>
              ) : null}

              {waypointUnlocked && !answerResult ? (
                <Stack gap="sm">
                  <Title order={5}>{playable.question.text}</Title>
                  <Radio.Group value={selectedChoiceId} onChange={setSelectedChoiceId}>
                    <Stack gap="xs">
                      {playable.question.choices.map((choice) => (
                        <Radio key={choice.id} value={choice.id} label={choice.text} />
                      ))}
                    </Stack>
                  </Radio.Group>
                  <Group>
                    <Button onClick={submitAnswer}>{t("player.submitAnswer")}</Button>
                  </Group>
                </Stack>
              ) : null}

              {renderAnswerFeedback()}
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
