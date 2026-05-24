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
import { IconAlertCircle, IconMapPin, IconTrophy } from "@tabler/icons-react";
import {
  getFirstPlayable,
  getQuizSummary,
  startSession,
  submitFirstAnswer,
} from "../../platform/firebase/quizRepository";
import { distanceMeters, getCurrentCoordinates } from "../../platform/map/geolocation";
import type { AnswerResult, FirstPlayable } from "../../domain/types";

export function PlayQuizPage(): JSX.Element {
  const { t } = useTranslation();
  const { quizId = "" } = useParams();
  const [nickname, setNickname] = useState("");
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getQuizSummary>>>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [playable, setPlayable] = useState<FirstPlayable | null>(null);
  const [distanceToWaypoint, setDistanceToWaypoint] = useState<number | null>(null);
  const [waypointUnlocked, setWaypointUnlocked] = useState(false);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string>("");
  const [answerResult, setAnswerResult] = useState<AnswerResult | null>(null);
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
        setError(t("noQuiz"));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function joinQuiz(): Promise<void> {
    if (!summary) {
      setError("Load quiz first");
      return;
    }
    if (!nickname.trim()) {
      setError("Nickname required");
      return;
    }

    const openAt = new Date(summary.openAt).getTime();
    const closeAt = new Date(summary.closeAt).getTime();
    const now = Date.now();
    if (now < openAt) {
      setError("Quiz not open yet");
      return;
    }
    if (now > closeAt) {
      setError("Quiz is closed");
      return;
    }

    const sid = await startSession(quizId, nickname.trim());
    setSessionId(sid);

    const firstPlayable = await getFirstPlayable(quizId);
    if (!firstPlayable) {
      setError("No waypoint/question found");
      return;
    }
    setPlayable(firstPlayable);
  }

  async function unlockWaypoint(): Promise<void> {
    if (!playable) {
      return;
    }
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
          `You are ${Math.round(distance)}m away. Move within ${playable.waypoint.gateRadiusMeters}m to unlock.`
        );
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function submitAnswer(): Promise<void> {
    if (!sessionId || !playable || !selectedChoiceId) {
      setError("Select an answer first");
      return;
    }
    const elapsedMs = questionStartMs ? Date.now() - questionStartMs : 0;
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
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Paper withBorder shadow="sm" radius="md" p="lg">
      <Stack gap="md">
        <Title order={2}>{t("joinTitle")}</Title>
        <Text c="dimmed">Quiz ID: {quizId}</Text>

        <Group>
          <Button onClick={loadQuiz} loading={loading}>Load quiz</Button>
        </Group>

        {summary ? (
          <Card withBorder radius="md">
            <Stack gap="sm">
              <Title order={3}>{summary.title}</Title>
              <Text>{summary.description}</Text>
              <Text c="dimmed" size="sm">
                Open: {new Date(summary.openAt).toLocaleString()} | Close: {new Date(summary.closeAt).toLocaleString()}
              </Text>
              <TextInput
                label={t("nickname")}
                value={nickname}
                onChange={(e) => setNickname(e.currentTarget.value)}
              />
              <Group>
                <Button onClick={joinQuiz}>{t("start")}</Button>
              </Group>
            </Stack>
          </Card>
        ) : null}

        {sessionId ? <Text size="sm">Session started: {sessionId}</Text> : null}

        {playable ? (
          <Card withBorder radius="md">
            <Stack gap="sm">
              <Group gap="xs">
                <IconMapPin size={18} />
                <Title order={4}>Waypoint: {playable.waypoint.title}</Title>
              </Group>
              <Text c="dimmed" size="sm">
                Target: {playable.waypoint.lat.toFixed(5)}, {playable.waypoint.lng.toFixed(5)}
              </Text>
              <Group>
                <Button variant="light" onClick={unlockWaypoint} disabled={waypointUnlocked}>
                  {waypointUnlocked ? "Waypoint unlocked" : "Check waypoint access"}
                </Button>
              </Group>

              {distanceToWaypoint !== null ? (
                <Text c="dimmed" size="sm">Distance to waypoint: {Math.round(distanceToWaypoint)}m</Text>
              ) : null}

              {waypointUnlocked ? (
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
                    <Button onClick={submitAnswer}>Submit answer</Button>
                  </Group>
                </Stack>
              ) : null}

              {answerResult ? (
                <Alert icon={<IconTrophy size={16} />} color={answerResult.isCorrect ? "teal" : "orange"} variant="light">
                  {answerResult.isCorrect ? "Correct" : "Incorrect"}. Points: {answerResult.pointsAwarded}. Total score: {answerResult.score}
                </Alert>
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
