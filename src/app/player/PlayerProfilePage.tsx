import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Badge, Card, Group, Loader, Paper, Stack, Text, Title } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import {
  getPlayerBadgeProgress,
  getPlayerEarnedBadges,
  markFirstDiscoveryProfileLabelSeen,
} from "../../platform/firebase/quizRepository";
import { getBadgeDefinition, getTierLabel, localizeBadgeText, type BadgeLocale } from "../../domain/badges";
import type { PlayerEarnedBadge } from "../../domain/types";
import { shouldShowFirstDiscoveryLabel } from "./playerProfileLogic";

function resolveLocale(language: string): BadgeLocale {
  return language.startsWith("sv") ? "sv" : "en";
}

function formatEarnedAt(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export function PlayerProfilePage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [badges, setBadges] = useState<PlayerEarnedBadge[]>([]);
  const [showFirstDiscoveryLabel, setShowFirstDiscoveryLabel] = useState(false);

  const locale = resolveLocale(i18n.resolvedLanguage ?? i18n.language);

  useEffect(() => {
    let mounted = true;

    async function loadProfile(): Promise<void> {
      setLoading(true);
      setError(null);
      try {
        const [progress, earnedBadges] = await Promise.all([getPlayerBadgeProgress(), getPlayerEarnedBadges()]);
        if (!mounted) return;

        const discoveredCount = earnedBadges.filter((badge) => badge.type === "discovery").length;
        const firstDiscoveryLabelVisible = shouldShowFirstDiscoveryLabel({
          discoveryBadgeCount: discoveredCount,
          firstDiscoveryProfileLabelSeen: progress.firstDiscoveryProfileLabelSeen,
        });

        setBadges(earnedBadges);
        setShowFirstDiscoveryLabel(firstDiscoveryLabelVisible);

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

  const discoveryBadges = useMemo(() => badges.filter((badge) => badge.type === "discovery"), [badges]);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center" wrap="wrap">
        <Title order={2}>{t("player.profileTitle")}</Title>
      </Group>

      {loading ? (
        <Group justify="center"><Loader /></Group>
      ) : null}

      {error ? (
        <Alert color="red" icon={<IconAlertCircle size={16} />}>
          {t("player.profileLoadError")}
        </Alert>
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

            {discoveryBadges.map((badge) => {
              const definition = getBadgeDefinition(badge.badgeId);
              const displayName = definition ? localizeBadgeText(definition.name, locale) : badge.badgeId;
              const flavourText = definition?.type === "discovery"
                ? localizeBadgeText(definition.flavourText, locale)
                : "";

              return (
                <Card key={badge.id} withBorder radius="md" p="md">
                  <Stack gap={4}>
                    <Text fw={700}>{displayName}</Text>
                    <Text size="sm" c="dimmed">{flavourText}</Text>
                    <Text size="xs" c="dimmed">{t("player.discoveryEarnedAt", { date: formatEarnedAt(badge.earnedAt) })}</Text>
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        </Paper>
      ) : null}

      {!loading && !error ? (
        <Paper withBorder radius="md" p="md">
          <Stack gap="sm">
            <Title order={4}>{t("player.tieredSectionTitle")}</Title>
            {badges.filter((badge) => badge.type === "tiered").length === 0 ? (
              <Text size="sm" c="dimmed">{t("player.tieredEmpty")}</Text>
            ) : (
              badges
                .filter((badge) => badge.type === "tiered")
                .map((badge) => {
                  const definition = getBadgeDefinition(badge.badgeId);
                  const title = definition ? localizeBadgeText(definition.name, locale) : badge.badgeId;
                  const tierLabel = definition?.type === "tiered" && badge.tier !== null
                    ? getTierLabel(definition, badge.tier, locale)
                    : "";

                  return (
                    <Card key={badge.id} withBorder radius="md" p="md">
                      <Group justify="space-between" align="center">
                        <Stack gap={2}>
                          <Text fw={700}>{title}</Text>
                          <Text size="sm" c="dimmed">{tierLabel}</Text>
                        </Stack>
                        <Badge color="yellow" variant="light">+{badge.xpReward} XP</Badge>
                      </Group>
                    </Card>
                  );
                })
            )}
          </Stack>
        </Paper>
      ) : null}
    </Stack>
  );
}
