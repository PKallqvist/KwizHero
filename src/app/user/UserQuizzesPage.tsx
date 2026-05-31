import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Image,
  Loader,
  Modal,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { useClipboard } from "@mantine/hooks";
import { IconAlertCircle, IconCheck, IconCopy, IconQrcode, IconTrophy } from "@tabler/icons-react";
import {
  buildPlayShareLink,
  getQuizLeaderboard,
  regenerateQuizAccessCode,
  getUserQuizzes,
  publishQuiz,
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
  const [qrQuiz, setQrQuiz] = useState<{ id: string; title: string; shareLink: string } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [publishingQuizId, setPublishingQuizId] = useState<string | null>(null);
  const [regeneratingQuizId, setRegeneratingQuizId] = useState<string | null>(null);

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
        if (mounted) {
          setLoadingQuizzes(false);
        }
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
        if (mounted) {
          setLoadingLeaderboard(false);
        }
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

  useEffect(() => {
    let mounted = true;

    async function buildQrCode(): Promise<void> {
      if (!qrQuiz) {
        setQrDataUrl("");
        return;
      }

      const dataUrl = await QRCode.toDataURL(qrQuiz.shareLink, { width: 280, margin: 1 });
      if (!mounted) return;
      setQrDataUrl(dataUrl);
    }

    buildQrCode().catch(() => {
      if (!mounted) return;
      setQrDataUrl("");
    });

    return () => {
      mounted = false;
    };
  }, [qrQuiz]);

  const rows = useMemo(() => {
    return quizzes.map((quiz) => {
      const playValue = !quiz.isPublic && quiz.status === "published" && quiz.accessCode ? quiz.accessCode : quiz.id;
      const shareLink = buildPlayShareLink(playValue);
      const copied = clipboard.copied && lastCopiedQuizId === quiz.id;
      const canEdit = quiz.status === "draft";
      const isPublished = quiz.status === "published";
      const isPrivate = !quiz.isPublic;

      return (
        <div key={quiz.id} className="kwiz-myquiz-item">
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

            <Group gap="xs" wrap="wrap">
              <Badge color={isPrivate ? "grape" : "blue"} variant="light">
                {isPrivate ? t("userQuizzes.typePrivate") : t("userQuizzes.typePublic")}
              </Badge>
              <Text size="sm" c="dimmed">
                {t("userQuizzes.accessCodeLabel")}: {isPrivate ? quiz.accessCode ?? "-" : "-"}
              </Text>
              <Text size="sm" c="dimmed">
                {t("userQuizzes.validUntilLabel")}: {quiz.validUntil ? new Date(quiz.validUntil).toLocaleString() : "-"}
              </Text>
            </Group>

            <Text size="sm" c="dimmed">
              {t("userQuizzes.waypointCount", { count: quiz.waypointCount })}
            </Text>

            <Group gap="xs" wrap="wrap">
              <Button component={Link} to="/create" variant="default" size="xs">
                {t("userQuizzes.createNew")}
              </Button>
              <Button component={Link} to={`/create?quizId=${quiz.id}`} variant="light" size="xs" disabled={!canEdit}>
                {t("userQuizzes.editQuiz")}
              </Button>
              {canEdit ? (
                <Button
                  size="xs"
                  variant="light"
                  loading={publishingQuizId === quiz.id}
                  onClick={async () => {
                    setPublishingQuizId(quiz.id);
                    try {
                      await publishQuiz(quiz.id, "");
                      setQuizzes((current) => current.map((entry) => (entry.id === quiz.id ? { ...entry, status: "published" } : entry)));
                    } finally {
                      setPublishingQuizId((current) => (current === quiz.id ? null : current));
                    }
                  }}
                >
                  {t("userQuizzes.publishDraft")}
                </Button>
              ) : null}
              {isPublished ? (
                <>
                  {isPrivate ? (
                    <>
                      <Button
                        size="xs"
                        variant="light"
                        leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                        onClick={() => {
                          setLastCopiedQuizId(quiz.id);
                          clipboard.copy(quiz.accessCode ?? "");
                        }}
                        disabled={!quiz.accessCode}
                      >
                        {copied ? t("userQuizzes.copied") : t("userQuizzes.copyCode")}
                      </Button>
                      <Button
                        size="xs"
                        variant="light"
                        loading={regeneratingQuizId === quiz.id}
                        onClick={async () => {
                          setRegeneratingQuizId(quiz.id);
                          try {
                            const newCode = await regenerateQuizAccessCode(quiz.id);
                            setQuizzes((current) =>
                              current.map((entry) => (entry.id === quiz.id ? { ...entry, isPublic: false, accessCode: newCode } : entry))
                            );
                          } catch (error) {
                            setQuizzesError((error as Error).message ?? t("userQuizzes.loadError"));
                          } finally {
                            setRegeneratingQuizId((current) => (current === quiz.id ? null : current));
                          }
                        }}
                      >
                        {t("userQuizzes.regenerateCode")}
                      </Button>
                    </>
                  ) : (
                    <>
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
                        leftSection={<IconQrcode size={14} />}
                        onClick={() => setQrQuiz({ id: quiz.id, title: quiz.title, shareLink })}
                      >
                        {t("userQuizzes.qrCode")}
                      </Button>
                    </>
                  )}
                </>
              ) : null}
              <Button
                size="xs"
                variant="light"
                leftSection={<IconTrophy size={14} />}
                onClick={() => setLeaderboardQuiz({ id: quiz.id, title: quiz.title })}
              >
                {t("userQuizzes.leaderboard")}
              </Button>
              <Anchor component={Link} to={`/play/${playValue}`} size="sm">
                {t("userQuizzes.openPlay")}
              </Anchor>
            </Group>
            {!canEdit ? (
              <Text size="xs" c="dimmed">{t("userQuizzes.editLockedPublished")}</Text>
            ) : null}
            {canEdit ? (
              <Text size="xs" c="dimmed">{t("userQuizzes.shareLockedDraft")}</Text>
            ) : null}
          </Stack>
        </div>
      );
    });
  }, [clipboard, lastCopiedQuizId, quizzes, regeneratingQuizId, t, publishingQuizId]);

  return (
    <Stack gap="md">
      <Group justify="flex-end" align="center" wrap="wrap">
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
        <div className="kwiz-myquiz-empty">
          <Stack align="center" gap="xs">
            <Text fw={600}>{t("userQuizzes.emptyTitle")}</Text>
            <Text size="sm" c="dimmed">{t("userQuizzes.emptyHint")}</Text>
            <Button component={Link} to="/create" variant="light">{t("userQuizzes.createFirst")}</Button>
          </Stack>
        </div>
      ) : null}

      <Stack className="kwiz-myquiz-list">{rows}</Stack>

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

      <Modal
        opened={Boolean(qrQuiz)}
        onClose={() => setQrQuiz(null)}
        title={t("userQuizzes.qrCodeTitle", { title: qrQuiz?.title ?? "" })}
        centered
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">{t("userQuizzes.qrCodeHelp")}</Text>
          {qrDataUrl ? (
            <Image src={qrDataUrl} alt="Quiz share QR code" radius="sm" fit="contain" h={220} />
          ) : (
            <Group justify="center"><Loader /></Group>
          )}
        </Stack>
      </Modal>
    </Stack>
  );
}
