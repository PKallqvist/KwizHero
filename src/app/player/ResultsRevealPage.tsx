import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Alert, Button, Group, Loader, Stack, Text, Title } from "@mantine/core";
import { IconAlertCircle, IconTrophy } from "@tabler/icons-react";
import {
  getPlayerBadgeProgress,
  getQuizAnswerKey,
  getQuizResultsForSession,
  markFirstDiscoverySeen,
  markResultSeen,
  savePlayerBadgeProgress,
  storePlayerBadgeUnlocks,
  type QuizResultsForParticipant,
} from "../../platform/firebase/quizRepository";
import { evaluateBadgeUnlocks, type BadgeLocale, type BadgeUnlockEvent } from "../../domain/badges";
import type { QuestionReviewItem } from "../../domain/types";
import { useCountUp } from "./useCountUp";
import { DiscoveryBadgeModal } from "./DiscoveryBadgeModal";

type Stage = "score" | "tiebreaker" | "lottery" | "rank";

function resolveBadgeLocale(language: string): BadgeLocale {
  return language.startsWith("sv") ? "sv" : "en";
}

const ADVANCE_DELAY_MS = 1200;

interface DiscoveryState {
  event: BadgeUnlockEvent;
  showFirstHint: boolean;
}

export function ResultsRevealPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();

  const [data, setData] = useState<QuizResultsForParticipant | null>(null);
  const [reviewItems, setReviewItems] = useState<QuestionReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [canAdvance, setCanAdvance] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [discoveryBadge, setDiscoveryBadge] = useState<DiscoveryState | null>(null);
  const [discoveryDismissed, setDiscoveryDismissed] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    async function unlockDeadEyeBadge(): Promise<void> {
      try {
        const progress = await getPlayerBadgeProgress();
        if (progress.earnedDiscoveryBadgeIds.includes("dead_eye")) return;

        const isFirstDiscoveryEver = !progress.firstDiscoverySeen && progress.earnedDiscoveryBadgeIds.length === 0;
        const nextProgress = {
          ...progress,
          triggeredEventKeys: [...new Set([...progress.triggeredEventKeys, "exact_tiebreaker_guess"])],
        };
        await savePlayerBadgeProgress(nextProgress);

        const unlocked = evaluateBadgeUnlocks(nextProgress, resolveBadgeLocale(i18n.resolvedLanguage ?? i18n.language));
        const deadEyeEvent = unlocked.find((event) => event.badgeId === "dead_eye");
        if (deadEyeEvent && !cancelled) {
          await storePlayerBadgeUnlocks([deadEyeEvent]);
          setDiscoveryBadge({ event: deadEyeEvent, showFirstHint: isFirstDiscoveryEver });
        }
      } catch {
        // achievement unlocking is best-effort; never block the reveal sequence
      }
    }

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);
      try {
        const results = await getQuizResultsForSession(sessionId as string);
        if (cancelled) return;
        setData(results);
        void markResultSeen(sessionId as string).catch(() => {});

        if (results.myResult.tiebreakerDistance === 0) {
          void unlockDeadEyeBadge();
        }

        const questions = await getQuizAnswerKey(results.quizId);
        if (!cancelled) setReviewItems(questions);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [sessionId, i18n]);

  const myResult = data?.myResult ?? null;
  const showTiebreakerStage = Boolean(
    data?.tiebreaker && myResult?.tiedGroupSize !== undefined && myResult?.tiebreakerGuess !== undefined
  );
  const showLotteryStage = Boolean(myResult?.resolvedByLottery);

  const stages = useMemo<Stage[]>(() => {
    const list: Stage[] = ["score"];
    if (showTiebreakerStage) list.push("tiebreaker");
    if (showLotteryStage) list.push("lottery");
    list.push("rank");
    return list;
  }, [showTiebreakerStage, showLotteryStage]);

  const currentStage = stages[Math.min(stepIndex, stages.length - 1)];
  const isLastStage = stepIndex >= stages.length - 1;
  const animatedScore = useCountUp(myResult?.score ?? 0, 900, currentStage === "score");

  useEffect(() => {
    setCanAdvance(false);
    const timer = window.setTimeout(() => setCanAdvance(true), ADVANCE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [currentStage]);

  function advance(): void {
    if (!canAdvance) return;
    setStepIndex((previous) => Math.min(previous + 1, stages.length - 1));
  }

  if (loading) {
    return (
      <Stack align="center" gap="md" mt="xl">
        <Loader />
        <Text c="dimmed">{t("results.loading")}</Text>
      </Stack>
    );
  }

  if (error || !data || !myResult) {
    return (
      <Stack align="center" gap="md" mt="xl" maw={420} mx="auto" px="md">
        <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
          {error ?? t("results.errorGeneric")}
        </Alert>
        <Button variant="light" onClick={() => navigate("/")}>
          {t("common.back")}
        </Button>
      </Stack>
    );
  }

  return (
    <Stack align="center" gap="lg" mt="xl" maw={480} mx="auto" px="md">
      <Title order={2}>{data.quizTitle}</Title>

      {currentStage === "score" ? (
        <Stack align="center" gap="xs">
          <Text c="dimmed">{t("results.scoreHeading")}</Text>
          <Title order={1}>{animatedScore}</Title>
          <Text>{t("results.scoreLine", { correct: myResult.score, total: myResult.totalQuestions })}</Text>
        </Stack>
      ) : null}

      {currentStage === "tiebreaker" && data.tiebreaker ? (
        <Stack align="center" gap="xs">
          <Text c="dimmed">{t("results.tiebreakerHeading")}</Text>
          <Text fw={600} ta="center">
            {data.tiebreaker.prompt}
          </Text>
          <Group gap="xl">
            <Stack align="center" gap={0}>
              <Text size="sm" c="dimmed">
                {t("results.tiebreakerYourGuess")}
              </Text>
              <Title order={3}>{myResult.tiebreakerGuess}</Title>
            </Stack>
            <Stack align="center" gap={0}>
              <Text size="sm" c="dimmed">
                {t("results.tiebreakerActual")}
              </Text>
              <Title order={3}>{data.tiebreaker.correctValue}</Title>
            </Stack>
          </Group>
          <Text>
            {myResult.tiebreakerDistance === 0
              ? t("results.tiebreakerExact")
              : t("results.tiebreakerOff", { distance: myResult.tiebreakerDistance })}
          </Text>
        </Stack>
      ) : null}

      {currentStage === "tiebreaker" && discoveryBadge && !discoveryDismissed ? (
        <DiscoveryBadgeModal
          event={discoveryBadge.event}
          showFirstHint={discoveryBadge.showFirstHint}
          onDismiss={() => {
            setDiscoveryDismissed(true);
            if (discoveryBadge.showFirstHint) {
              void markFirstDiscoverySeen().catch(() => {});
            }
          }}
        />
      ) : null}

      {currentStage === "lottery" ? (
        <Stack align="center" gap="xs">
          <IconTrophy size={32} />
          <Text c="dimmed">{t("results.lotteryHeading")}</Text>
          <Text ta="center">{t("results.lotteryMessage", { count: myResult.tiedGroupSize ?? 0 })}</Text>
        </Stack>
      ) : null}

      {currentStage === "rank" ? (
        <Stack align="center" gap="xs">
          <Text c="dimmed">{t("results.rankHeading")}</Text>
          <Title order={1}>
            {data.participantCount
              ? t("results.rankLineOf", { rank: myResult.rank, count: data.participantCount })
              : t("results.rankLine", { rank: myResult.rank })}
          </Title>
        </Stack>
      ) : null}

      {!isLastStage ? (
        <Button onClick={advance} disabled={!canAdvance} size="lg">
          {t("results.continue")}
        </Button>
      ) : (
        <Stack align="center" gap="sm" w="100%">
          <Button variant="light" onClick={() => setReviewOpen((previous) => !previous)}>
            {reviewOpen ? t("results.reviewToggleHide") : t("results.reviewToggleShow")}
          </Button>
          {reviewOpen ? (
            <Stack gap="xs" w="100%">
              <Title order={4}>{t("results.reviewHeading")}</Title>
              {reviewItems.length === 0 ? (
                <Text c="dimmed">{t("results.reviewEmpty")}</Text>
              ) : (
                reviewItems.map((item) => (
                  <Stack key={item.questionId} gap={2}>
                    <Text size="xs" c="dimmed">
                      {item.waypointTitle}
                    </Text>
                    <Text fw={600}>{item.questionText}</Text>
                    <Text size="sm">
                      {t("results.correctAnswerLabel")}: {item.correctAnswerText}
                    </Text>
                  </Stack>
                ))
              )}
            </Stack>
          ) : null}
          <Button onClick={() => navigate("/")}>{t("results.done")}</Button>
        </Stack>
      )}
    </Stack>
  );
}
