import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Badge, Card, Group, Loader, Paper, Stack, Text, Title } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import {
  getCurrentUserUid,
  getPlayerBadgeProgress,
  getPlayerEarnedBadges,
  getUserQuizzes,
  markFirstDiscoveryProfileLabelSeen,
} from "../../platform/firebase/quizRepository";
import { getBadgeDefinition, getTierLabel, localizeBadgeText, type BadgeLocale } from "../../domain/badges";
import type { PlayerEarnedBadge } from "../../domain/types";
import { shouldShowFirstDiscoveryLabel } from "./playerProfileLogic";
import { useQuizSession } from "../../platform/context/QuizSessionContext";

function resolveLocale(language: string): BadgeLocale {
  return language.startsWith("sv") ? "sv" : "en";
}

function formatEarnedAt(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function resolveBadgeImageSrc(imageKey: string | null): string | null {
  if (!imageKey) return null;
  return `/branding/trophies/${imageKey}`;
}

export function PlayerProfilePage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const { profile } = useQuizSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [badges, setBadges] = useState<PlayerEarnedBadge[]>([]);
  const [showFirstDiscoveryLabel, setShowFirstDiscoveryLabel] = useState(false);
  const [quizzesCompleted, setQuizzesCompleted] = useState(0);
  const [quizzesCreated, setQuizzesCreated] = useState(0);
  const [profileName, setProfileName] = useState("");

  const locale = resolveLocale(i18n.resolvedLanguage ?? i18n.language);

  useEffect(() => {
    let mounted = true;

    async function loadProfile(): Promise<void> {
      setLoading(true);
      setError(null);
      try {
        const [progress, earnedBadges, userQuizzes, uid] = await Promise.all([
          getPlayerBadgeProgress(),
          getPlayerEarnedBadges(),
          getUserQuizzes().catch(() => []),
          getCurrentUserUid().catch(() => null),
        ]);
        if (!mounted) return;

        const discoveredCount = earnedBadges.filter((badge) => badge.type === "discovery").length;
        const firstDiscoveryLabelVisible = shouldShowFirstDiscoveryLabel({
          discoveryBadgeCount: discoveredCount,
          firstDiscoveryProfileLabelSeen: progress.firstDiscoveryProfileLabelSeen,
        });

        setBadges(earnedBadges);
        setShowFirstDiscoveryLabel(firstDiscoveryLabelVisible);
        setQuizzesCompleted(progress.quizzesCompleted);
        setQuizzesCreated(userQuizzes.length);
        setProfileName(uid ? `${uid.slice(0, 2).toUpperCase()} ${uid.slice(2, 5).toUpperCase()}` : t("player.profileNameFallback"));

        if (firstDiscoveryLabelVisible) {
          await markFirstDiscoveryProfileLabelSeen();
        }
      } catch (nextError) {
        if (!mounted) return;
        setError((nextError as Error).message ?? "Failed to load profile");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }

    loadProfile().catch(() => {
      if (!mounted) return;
      setError("Failed to load profile");
      setLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, []);

  const tieredBadges = useMemo(() => badges.filter((badge) => badge.type === "tiered"), [badges]);
  const discoveryBadges = useMemo(() => badges.filter((badge) => badge.type === "discovery"), [badges]);
  const level = Math.max(1, Math.floor(profile.xpTotal / 300));
  const levelProgressMax = 300;
  const levelProgressCurrent = profile.xpTotal % levelProgressMax;

  const topStats = useMemo(
    () => [
      {
        label: t("player.profileStatQuizzesCompleted"),
        value: String(quizzesCompleted),
      },
      {
        label: t("player.profileStatQuizzesCreated"),
        value: String(quizzesCreated),
      },
      {
        label: t("player.profileStatDiscoveries"),
        value: String(discoveryBadges.length),
      },
      {
        label: t("player.profileStatStreak"),
        value: `${profile.streakDays} ${t("player.profileStatStreakDays")}`,
      },
    ],
    [discoveryBadges.length, profile.streakDays, quizzesCompleted, quizzesCreated, t]
  );

  return (
    <Stack gap="md" className="kwiz-profile-root">
      <Paper withBorder radius="md" p="md" className="kwiz-profile-frame">
        <Stack gap="md">
          <Group justify="space-between" align="center" wrap="wrap">
            <Title order={2}>{t("player.profileTitle")}</Title>
          </Group>

          {loading ? (
            <Group justify="center"><Loader /></Group>
          ) : null}

          {error ? (
            <Alert color="red" icon={<IconAlertCircle size={16} />}>
              {error || t("player.profileLoadError")}
            </Alert>
          ) : null}

          {!loading && !error ? (
            <Paper withBorder radius="md" p="md" className="kwiz-profile-hero">
              <Group wrap="nowrap" align="center">
                <div className="kwiz-profile-avatar" aria-hidden="true">
                  {profileName.slice(0, 2)}
                </div>
                <Stack gap={4} className="kwiz-profile-hero-copy">
                  <Text fw={700} className="kwiz-profile-name">{profileName}</Text>
                  <Group gap={8}>
                    <Badge color="yellow" variant="light">{t("player.profileLevel", { level })}</Badge>
                    <Text size="sm" c="dimmed">
                      {levelProgressCurrent} / {levelProgressMax} XP
                    </Text>
                  </Group>
                  <div className="kwiz-profile-progress-track" aria-hidden="true">
                    <span
                      className="kwiz-profile-progress-fill"
                      style={{ width: `${(levelProgressCurrent / levelProgressMax) * 100}%` }}
                    />
                  </div>
                </Stack>
              </Group>
            </Paper>
          ) : null}

          {!loading && !error ? (
            <div className="kwiz-profile-stats-grid">
              {topStats.map((stat) => (
                <Paper key={stat.label} withBorder radius="md" p="md" className="kwiz-profile-stat-card">
                  <Text className="kwiz-profile-stat-value">{stat.value}</Text>
                  <Text size="sm" c="dimmed">{stat.label}</Text>
                </Paper>
              ))}
            </div>
          ) : null}

          {!loading && !error ? (
            <Paper withBorder radius="md" p="md">
              <Stack gap="sm">
                <Title order={4}>{t("player.tieredSectionTitle")}</Title>
                {tieredBadges.length === 0 ? (
                  <Text size="sm" c="dimmed">{t("player.tieredEmpty")}</Text>
                ) : (
                  <div className="kwiz-profile-badge-grid">
                    {tieredBadges.map((badge) => {
                      const definition = getBadgeDefinition(badge.badgeId);
                      const title = definition ? localizeBadgeText(definition.name, locale) : badge.badgeId;
                      const tierLabel = definition?.type === "tiered" && badge.tier !== null
                        ? getTierLabel(definition, badge.tier, locale)
                        : "";
                      const badgeImageSrc = resolveBadgeImageSrc(badge.imageKey);

                      return (
                        <Card key={badge.id} withBorder radius="md" p="md" className="kwiz-profile-badge-card">
                          <Group justify="space-between" align="flex-start" wrap="nowrap">
                            <Group align="flex-start" wrap="nowrap">
                              {badgeImageSrc ? (
                                <img
                                  src={badgeImageSrc}
                                  alt=""
                                  aria-hidden="true"
                                  className="kwiz-profile-badge-image"
                                />
                              ) : (
                                <span className="kwiz-profile-badge-icon" aria-hidden="true">🏆</span>
                              )}
                              <Stack gap={2}>
                                <Text fw={700}>{title}</Text>
                                <Text size="sm" c="dimmed">{tierLabel}</Text>
                                <Text size="xs" c="dimmed">{t("player.discoveryEarnedAt", { date: formatEarnedAt(badge.earnedAt) })}</Text>
                              </Stack>
                            </Group>
                            <Badge color="yellow" variant="light">+{badge.xpReward} XP</Badge>
                          </Group>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </Stack>
            </Paper>
          ) : null}

          {!loading && !error && discoveryBadges.length > 0 ? (
            <Paper withBorder radius="md" p="md">
              <Stack gap="sm">
                <Group justify="space-between" align="center" wrap="wrap">
                  <Title order={4}>{t("player.discoverySectionTitle")}</Title>
                  {showFirstDiscoveryLabel ? (
                    <Badge color="teal" variant="light">{t("player.firstDiscoveryLabel")}</Badge>
                  ) : null}
                </Group>

                <div className="kwiz-profile-badge-grid">
                  {discoveryBadges.map((badge) => {
                    const definition = getBadgeDefinition(badge.badgeId);
                    const displayName = definition ? localizeBadgeText(definition.name, locale) : badge.badgeId;
                    const flavourText = definition?.type === "discovery"
                      ? localizeBadgeText(definition.flavourText, locale)
                      : "";

                    return (
                      <Card key={badge.id} withBorder radius="md" p="md" className="kwiz-profile-badge-card">
                        <Group align="flex-start" wrap="nowrap">
                          <span className="kwiz-profile-badge-icon is-discovery" aria-hidden="true">🧭</span>
                          <Stack gap={2}>
                            <Text fw={700}>{displayName}</Text>
                            <Text size="sm" c="dimmed">{flavourText}</Text>
                            <Text size="xs" c="dimmed">{t("player.discoveryEarnedAt", { date: formatEarnedAt(badge.earnedAt) })}</Text>
                          </Stack>
                        </Group>
                      </Card>
                    );
                  })}
                </div>
              </Stack>
            </Paper>
          ) : null}
        </Stack>
      </Paper>
    </Stack>
  );
}
