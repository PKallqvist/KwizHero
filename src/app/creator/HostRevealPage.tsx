import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Alert, Anchor, Button, Group, Loader, Stack, Table, Text, Title } from "@mantine/core";
import { IconAlertCircle, IconTrophy } from "@tabler/icons-react";
import { useAuth } from "../../platform/context/AuthContext";
import { getQuizResultsReadOnly, getQuizSummary, type HostQuizResults } from "../../platform/firebase/quizRepository";
import type { ParticipantResult, QuizSummary } from "../../domain/types";

type HostStep =
  | { type: "setup" }
  | { type: "elimination"; participant: ParticipantResult }
  | { type: "tiedAnnounce"; participants: ParticipantResult[] }
  | { type: "tiebreakerReplay"; participants: ParticipantResult[] }
  | { type: "lottery"; participants: ParticipantResult[] }
  | { type: "winner"; participant: ParticipantResult }
  | { type: "leaderboard" };

export function HostRevealPage(): JSX.Element {
  const { t } = useTranslation();
  const { quizId } = useParams<{ quizId: string }>();
  const { user, isCreator, loading: authLoading } = useAuth();

  const [summary, setSummary] = useState<QuizSummary | null>(null);
  const [results, setResults] = useState<HostQuizResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!quizId) return;
    let cancelled = false;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);
      try {
        const [quizSummary, quizResults] = await Promise.all([
          getQuizSummary(quizId as string),
          getQuizResultsReadOnly(quizId as string),
        ]);
        if (cancelled) return;
        setSummary(quizSummary);
        setResults(quizResults);
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
  }, [quizId]);

  const steps = useMemo<HostStep[]>(() => {
    if (!results) return [{ type: "setup" }];

    const topGroupSize = Math.max(1, results.summary.topGroupTiedGroupSize);
    const sortedWorstFirst = [...results.participants].sort((a, b) => b.rank - a.rank);
    const eliminationParticipants = sortedWorstFirst.filter((p) => p.rank > topGroupSize);
    const topGroupParticipants = results.participants
      .filter((p) => p.rank <= topGroupSize)
      .sort((a, b) => a.rank - b.rank);
    const winner = results.participants.find((p) => p.rank === 1);

    const list: HostStep[] = [{ type: "setup" }];
    for (const participant of eliminationParticipants) {
      list.push({ type: "elimination", participant });
    }
    if (topGroupSize > 1) {
      list.push({ type: "tiedAnnounce", participants: topGroupParticipants });
      if (summary?.tiebreaker) {
        list.push({ type: "tiebreakerReplay", participants: topGroupParticipants });
      }
      if (results.summary.topGroupResolvedByLottery) {
        list.push({ type: "lottery", participants: topGroupParticipants });
      }
    }
    if (winner) {
      list.push({ type: "winner", participant: winner });
    }
    list.push({ type: "leaderboard" });
    return list;
  }, [results, summary]);

  if (!authLoading && (!isCreator || (summary && summary.creatorUid && summary.creatorUid !== user?.uid))) {
    return <Navigate to="/" replace />;
  }

  if (loading || authLoading) {
    return (
      <Stack align="center" gap="md" mt="xl">
        <Loader />
      </Stack>
    );
  }

  if (error || !summary) {
    return (
      <Stack align="center" gap="md" mt="xl" maw={420} mx="auto" px="md">
        <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
          {error ?? t("host.errorGeneric")}
        </Alert>
      </Stack>
    );
  }

  if (!results) {
    return (
      <Stack align="center" gap="md" mt="xl" maw={420} mx="auto" px="md">
        <Title order={3}>{summary.title}</Title>
        <Alert icon={<IconAlertCircle size={16} />} color="yellow" variant="light">
          {t("host.notReadyYet")}
        </Alert>
        <Anchor component={Link} to="/my-quizzes">
          {t("host.backToMyQuizzes")}
        </Anchor>
      </Stack>
    );
  }

  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const isLastStep = stepIndex >= steps.length - 1;

  function next(): void {
    setStepIndex((previous) => Math.min(previous + 1, steps.length - 1));
  }

  function previous(): void {
    setStepIndex((previous) => Math.max(previous - 1, 0));
  }

  return (
    <Stack align="center" gap="xl" mt="xl" maw={720} mx="auto" px="md">
      {step.type === "setup" ? (
        <Stack align="center" gap="sm">
          <Title order={1}>{summary.title}</Title>
          <Text c="dimmed">{t("host.participantCount", { count: results.summary.participantCount })}</Text>
          <Button size="lg" onClick={next}>
            {t("host.begin")}
          </Button>
        </Stack>
      ) : null}

      {step.type === "elimination" ? (
        <Stack align="center" gap="xs">
          <Text c="dimmed">{t("host.rankLabel", { rank: step.participant.rank })}</Text>
          <Title order={1}>{step.participant.nickname}</Title>
          <Text>{t("host.scoreLine", { score: step.participant.score, total: step.participant.totalQuestions })}</Text>
        </Stack>
      ) : null}

      {step.type === "tiedAnnounce" ? (
        <Stack align="center" gap="sm">
          <IconTrophy size={32} />
          <Title order={2}>{t("host.tiedHeading", { count: step.participants.length })}</Title>
          <Text ta="center">{step.participants.map((p) => p.nickname).join(", ")}</Text>
        </Stack>
      ) : null}

      {step.type === "tiebreakerReplay" && summary.tiebreaker ? (
        <Stack align="center" gap="sm" w="100%">
          <Title order={2}>{t("host.tiebreakerHeading")}</Title>
          <Text fw={600} ta="center">
            {summary.tiebreaker.prompt}
          </Text>
          <Text c="dimmed">{t("host.tiebreakerActual", { value: summary.tiebreaker.correctValue })}</Text>
          <Table withTableBorder w="100%">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("host.colName")}</Table.Th>
                <Table.Th>{t("host.colGuess")}</Table.Th>
                <Table.Th>{t("host.colDistance")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {step.participants.map((p) => (
                <Table.Tr key={p.participantId}>
                  <Table.Td>{p.nickname}</Table.Td>
                  <Table.Td>{p.tiebreakerGuess ?? "—"}</Table.Td>
                  <Table.Td>{p.tiebreakerDistance ?? "—"}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Stack>
      ) : null}

      {step.type === "lottery" ? (
        <Stack align="center" gap="sm">
          <IconTrophy size={32} />
          <Title order={2}>{t("host.lotteryHeading")}</Title>
          <Text ta="center">{t("host.lotteryMessage", { count: step.participants.length })}</Text>
        </Stack>
      ) : null}

      {step.type === "winner" ? (
        <Stack align="center" gap="sm">
          <Text c="dimmed">{t("host.winnerLabel")}</Text>
          <Title order={1} className="kwiz-host-winner-title">
            {step.participant.nickname}
          </Title>
          <Text>
            {t("host.scoreLine", { score: step.participant.score, total: step.participant.totalQuestions })}
          </Text>
        </Stack>
      ) : null}

      {step.type === "leaderboard" ? (
        <Stack align="center" gap="sm" w="100%">
          <Title order={2}>{t("host.finalLeaderboard")}</Title>
          <Table withTableBorder w="100%">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("host.colRank")}</Table.Th>
                <Table.Th>{t("host.colName")}</Table.Th>
                <Table.Th>{t("host.colScore")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {results.participants.map((p) => (
                <Table.Tr key={p.participantId}>
                  <Table.Td>{p.rank}</Table.Td>
                  <Table.Td>{p.nickname}</Table.Td>
                  <Table.Td>
                    {p.score}/{p.totalQuestions}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Stack>
      ) : null}

      {step.type !== "setup" ? (
        <Group>
          <Button variant="default" onClick={previous} disabled={stepIndex === 0}>
            {t("common.back")}
          </Button>
          {!isLastStep ? (
            <Button onClick={next} size="lg">
              {t("host.next")}
            </Button>
          ) : null}
        </Group>
      ) : null}
    </Stack>
  );
}
