import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { useClipboard } from "@mantine/hooks";
import { IconAlertCircle, IconCheck, IconCopy, IconTrophy } from "@tabler/icons-react";
import {
  buildPlayShareLink,
  getQuizLeaderboard,
  getUserQuizzes,
} from "../../platform/firebase/quizRepository";
import type { LeaderboardEntry, QuizListItem } from "../../domain/types";

export function UserQuizzesPage(): JSX.Element {
  const { t } = useTranslation();
  const clipboard = useClipboard({ timeout: 1800 });
  const [lastCopiedQuizId, setLastCopiedQuizId] = useState<string | null>(null);
  const [leaderboardQuiz, setLeaderboardQuiz] = useState<{ id: string; title: string } | null>(null);
  const [quizzes, setQuizzes] = useState<QuizListItem[]>([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState(true);
  const [quizzesError, setQuizzesError] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load(): Promise<void> {
      setLoadingQuizzes(true);
      setQuizzesError(null);
      try {
        const next = await getUserQuizzes();
        if (!mounted) return;
        setQuizzes(next);
      } catch (error) {
        if (!mounted) return;
        setQuizzesError((error as Error).message ?? "Failed to load quizzes");
      } finally {
        if (!mounted) return;
        setLoadingQuizzes(false);
      }
    }

    load().catch(() => {
      if (!mounted) return;
      setLoadingQuizzes(false);
      setQuizzesError("Failed to load quizzes");
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const activeQuizId = leaderboardQuiz?.id;
    if (!activeQuizId) {
      setLeaderboard([]);
      setLeaderboardError(null);
      setLoadingLeaderboard(false);
      return () => {
        mounted = false;
      };
    }
    const quizId = activeQuizId;

    async function loadLeaderboard(): Promise<void> {
      setLoadingLeaderboard(true);
      setLeaderboardError(null);
      try {
        const entries = await getQuizLeaderboard(quizId);
        if (!mounted) return;
        setLeaderboard(entries);
      } catch (error) {
        if (!mounted) return;
        setLeaderboardError((error as Error).message ?? "Failed to load leaderboard");
      } finally {
        if (!mounted) return;
        setLoadingLeaderboard(false);
      }
    }

    loadLeaderboard().catch(() => {
      if (!mounted) return;
      setLoadingLeaderboard(false);
      setLeaderboardError("Failed to load leaderboard");
    });

    return () => {
      mounted = false;
    };
  }, [leaderboardQuiz?.id]);

  const rows = useMemo(() => {
    return quizzes.map((quiz) => {
      const shareLink = buildPlayShareLink(quiz.id);
      const copied = clipboard.copied && lastCopiedQuizId === quiz.id;

      return (
        <Card key={quiz.id} withBorder radius="md" p="md">
          <Stack gap="sm">
            <Group justify="space-between" align="start" wrap="wrap">
              <Stack gap={2}>
                <Text fw={700}>{quiz.title}</Text>
                <Text size="sm" c="dimmed">{quiz.description || t("userQuizzes.noDescription")}</Text>
              </Stack>
              <Badge color={quiz.status === "published" ? "teal" : "gray"} variant="light">
                {quiz.status === "published" ? t("userQuizzes.statusPublished") : t("userQuizzes.statusDraft")}
              </Badge>
            </Group>

            <Text size="sm" c="dimmed">
              {t("userQuizzes.waypointCount", { count: quiz.waypointCount })}
            </Text>

            <Group gap="xs" wrap="wrap">
              <Button component={Link} to="/create" variant="default" size="xs">
                {t("userQuizzes.createNew")}
              </Button>
              <Button component={Link} to={`/create?quizId=${quiz.id}`} variant="light" size="xs">
                {t("userQuizzes.editQuiz")}
              </Button>
              <Button
                size="xs"
                variant="light"
                leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                onClick={() => {
                  setLastCopiedQuizId(quiz.id);
                  clipboard.copy(shareLink);
                }}
              >
                {copied ? t("userQuizzes.copied") : t("userQuizzes.copyLink")}
              </Button>
              <Button
                size="xs"
                variant="light"
                leftSection={<IconTrophy size={14} />}
                onClick={() => setLeaderboardQuiz({ id: quiz.id, title: quiz.title })}
              >
                {t("userQuizzes.leaderboard")}
              </Button>
              <Anchor component={Link} to={`/play/${quiz.id}`} size="sm">
                {t("userQuizzes.openPlay")}
              </Anchor>
            </Group>
          </Stack>
        </Card>
      );
    });
  }, [clipboard, lastCopiedQuizId, quizzes, t]);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center" wrap="wrap">
        <Title order={2}>{t("userQuizzes.title")}</Title>
        <Button component={Link} to="/create">{t("userQuizzes.createNew")}</Button>
      </Group>

      {loadingQuizzes ? (
        <Group justify="center"><Loader /></Group>
      ) : null}

      {quizzesError ? (
        <Alert color="red" icon={<IconAlertCircle size={16} />}>
          {t("userQuizzes.loadError")}
        </Alert>
      ) : null}

      {!loadingQuizzes && quizzes.length === 0 ? (
        <Card withBorder radius="md" p="xl">
          <Stack align="center" gap="xs">
            <Text fw={600}>{t("userQuizzes.emptyTitle")}</Text>
            <Text size="sm" c="dimmed">{t("userQuizzes.emptyHint")}</Text>
            <Button component={Link} to="/create" variant="light">{t("userQuizzes.createFirst")}</Button>
          </Stack>
        </Card>
      ) : null}

      {rows}

      <Modal
        opened={Boolean(leaderboardQuiz)}
        onClose={() => setLeaderboardQuiz(null)}
        title={t("userQuizzes.leaderboardTitle", { title: leaderboardQuiz?.title ?? "" })}
        size="lg"
      >
        {loadingLeaderboard ? (
          <Group justify="center"><Loader /></Group>
        ) : null}

        {leaderboardError ? (
          <Alert color="red" icon={<IconAlertCircle size={16} />}>
            {t("userQuizzes.leaderboardError")}
          </Alert>
        ) : null}

        {!loadingLeaderboard && !leaderboardError && leaderboard.length === 0 ? (
          <Text size="sm" c="dimmed">{t("userQuizzes.leaderboardEmpty")}</Text>
        ) : null}

        {!loadingLeaderboard && !leaderboardError && leaderboard.length > 0 ? (
          <Table striped highlightOnHover withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("userQuizzes.rank")}</Table.Th>
                <Table.Th>{t("userQuizzes.nickname")}</Table.Th>
                <Table.Th>{t("userQuizzes.score")}</Table.Th>
                <Table.Th>{t("userQuizzes.completedAt")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {leaderboard.map((entry, index) => (
                <Table.Tr key={entry.id}>
                  <Table.Td>{index + 1}</Table.Td>
                  <Table.Td>{entry.nickname}</Table.Td>
                  <Table.Td>{entry.score}</Table.Td>
                  <Table.Td>{entry.completedAt ? new Date(entry.completedAt).toLocaleString() : "-"}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : null}
      </Modal>
    </Stack>
  );
}
