import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Badge, Group, Loader, Stack, Text, Title } from "@mantine/core";
import { IconAlertCircle, IconDots, IconFlame, IconPencil, IconStar, IconTrophy } from "@tabler/icons-react";
import {
  getCurrentUserUid,
  getPlayerBadgeProgress,
  getPlayerEarnedBadges,
  getUserQuizzes,
  markFirstDiscoveryProfileLabelSeen,
} from "../../platform/firebase/quizRepository";
import {
  BADGE_CATALOG,
  getBadgeDefinition,
  localizeBadgeText,
  type BadgeIconName,
  type BadgeLocale,
  type BadgeTierConfig,
  type TieredBadgeConfig,
} from "../../domain/badges";
import type { PlayerEarnedBadge } from "../../domain/types";
import { shouldShowFirstDiscoveryLabel } from "./playerProfileLogic";
import { useQuizSession } from "../../platform/context/QuizSessionContext";

const LEVEL_DOT_COLORS: Record<number, string> = {
  1: "#C68B2F",
  2: "#888780",
  3: "#D85A30",
  4: "#85B7EB",
  5: "#EF9F27",
  6: "#CED4DA",
};

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

function renderTierIcon(icon: BadgeIconName): JSX.Element {
  switch (icon) {
    case "ti-pencil":
      return <IconPencil size={18} />;
    case "ti-flame":
      return <IconFlame size={18} />;
    case "ti-star":
      return <IconStar size={18} />;
    case "ti-trophy":
    default:
      return <IconTrophy size={18} />;
  }
}

function getCurrentTierForProgress(definition: TieredBadgeConfig, progressValue: number): number {
  let currentTier = 0;
  for (const tier of definition.tiers) {
    if (progressValue >= tier.unlockValue) {
      currentTier = tier.tier;
    }
  }
  return currentTier;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

interface TierCabinetEntry {
  definition: TieredBadgeConfig;
  currentTier: number;
  currentTierConfig: BadgeTierConfig | null;
  nextTierConfig: BadgeTierConfig | null;
  progressToNext: number;
  isLocked: boolean;
  displayImageKey: string | null;
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
  const [expandedCabinetBadgeId, setExpandedCabinetBadgeId] = useState<string | null>(null);

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
        if (mounted) {
          setLoading(false);
        }
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
  }, [t]);

  const discoveryBadges = useMemo(() => badges.filter((badge) => badge.type === "discovery"), [badges]);
  const tieredDefinitions = useMemo(
    () => BADGE_CATALOG.filter((badge) => badge.type === "tiered") as TieredBadgeConfig[],
    []
  );

  const tierCabinetEntries = useMemo<TierCabinetEntry[]>(() => {
    return tieredDefinitions.map((definition) => {
      const currentTier = getCurrentTierForProgress(definition, quizzesCompleted);
      const currentTierConfig = definition.tiers.find((tier) => tier.tier === currentTier) ?? null;
      const nextTierConfig = definition.tiers.find((tier) => tier.tier === currentTier + 1) ?? null;
      const previousUnlock = currentTierConfig?.unlockValue ?? 0;
      const nextUnlock = nextTierConfig?.unlockValue ?? previousUnlock;
      const progressToNext = nextUnlock > previousUnlock
        ? clamp((quizzesCompleted - previousUnlock) / (nextUnlock - previousUnlock), 0, 1)
        : 1;

      return {
        definition,
        currentTier,
        currentTierConfig,
        nextTierConfig,
        progressToNext,
        isLocked: currentTier === 0,
        displayImageKey: currentTierConfig?.imageKey ?? definition.tiers[0]?.imageKey ?? definition.imageKey,
      };
    });
  }, [quizzesCompleted, tieredDefinitions]);

  const expandedCabinetEntry = useMemo(
    () => tierCabinetEntries.find((entry) => entry.definition.id === expandedCabinetBadgeId) ?? null,
    [expandedCabinetBadgeId, tierCabinetEntries]
  );
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
      ...(discoveryBadges.length > 0
        ? [
          {
            label: t("player.profileStatDiscoveries"),
            value: String(discoveryBadges.length),
          },
        ]
        : []),
      {
        label: t("player.profileStatStreak"),
        value: `${profile.streakDays} ${t("player.profileStatStreakDays")}`,
      },
    ],
    [discoveryBadges.length, profile.streakDays, quizzesCompleted, quizzesCreated, t]
  );

  return (
    <Stack gap="md" className="kwiz-profile-root">
      <Stack gap="md" className="kwiz-profile-content">
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
            <section className="kwiz-profile-hero-panel">
              <button type="button" className="kwiz-profile-hero-menu" aria-label={t("player.settings")} onClick={() => {}}>
                <IconDots size={18} />
              </button>
              <div className="kwiz-profile-hero-top">
                <div className="kwiz-profile-avatar" aria-hidden="true">
                  {profileName.slice(0, 2).trim() || "KH"}
                </div>
                <Stack gap={4} className="kwiz-profile-hero-copy">
                  <Text fw={700} className="kwiz-profile-name">{profileName}</Text>
                  <Group gap={8} justify="center">
                    <Badge color="yellow" variant="light">{t("player.profileLevel", { level })}</Badge>
                    <Text size="sm" className="kwiz-profile-xp-label">
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
              </div>
              <div className="kwiz-profile-hero-stats-grid">
                {topStats.map((stat) => (
                  <div key={stat.label} className="kwiz-profile-hero-stat-cell">
                    <Text className="kwiz-profile-hero-stat-value">{stat.value}</Text>
                    <Text className="kwiz-profile-hero-stat-label">{stat.label}</Text>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {!loading && !error ? (
            <section className="kwiz-trophy-cabinet">
              <Stack gap="sm">
                <Text className="kwiz-profile-section-label">{t("player.trophyCabinetTitle")}</Text>
                {tierCabinetEntries.length === 0 ? (
                  <Text size="sm" c="dimmed">{t("player.tieredEmpty")}</Text>
                ) : (
                  <>
                    <div className="kwiz-trophy-shelf-scroll" role="list" aria-label={t("player.trophyCabinetTitle")}>
                      {tierCabinetEntries.map((entry) => {
                        const title = localizeBadgeText(entry.definition.name, locale);
                        const isExpanded = expandedCabinetBadgeId === entry.definition.id;
                        const trophyImageSrc = resolveBadgeImageSrc(entry.displayImageKey);

                        return (
                          <button
                            key={entry.definition.id}
                            type="button"
                            className={`kwiz-trophy-slot-button${entry.isLocked ? " is-locked" : ""}${isExpanded ? " is-active" : ""}`}
                            disabled={entry.isLocked}
                            onClick={() => {
                              setExpandedCabinetBadgeId((current) => {
                                if (current === entry.definition.id) return null;
                                return entry.definition.id;
                              });
                            }}
                            role="listitem"
                          >
                            <div className={`kwiz-trophy-image-shell${entry.isLocked ? " is-locked" : ""}`}>
                              {trophyImageSrc ? (
                                <img src={trophyImageSrc} alt={title} className="kwiz-trophy-image" />
                              ) : (
                                <span className="kwiz-profile-badge-icon" aria-hidden="true">🏆</span>
                              )}
                              <span className="trophy-icon-overlay" aria-hidden="true">{renderTierIcon(entry.definition.icon)}</span>
                            </div>
                            <div className="kwiz-trophy-plaque">
                              <Text className="kwiz-trophy-plaque-name" title={title}>{title}</Text>
                              <div className="kwiz-trophy-dot-row" aria-hidden="true">
                                {entry.definition.tiers.map((tier) => (
                                  <span
                                    key={`${entry.definition.id}-${tier.tier}`}
                                    className={`kwiz-trophy-dot${tier.tier <= entry.currentTier ? " is-filled" : ""}`}
                                    style={tier.tier <= entry.currentTier ? { backgroundColor: LEVEL_DOT_COLORS[tier.tier] } : undefined}
                                  />
                                ))}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <div className="kwiz-trophy-shelf-edge" aria-hidden="true" />
                    {expandedCabinetEntry ? (
                      <div className="kwiz-trophy-detail-panel">
                        <Stack gap="xs">
                          <Group justify="space-between" align="flex-start" wrap="wrap">
                            <Group wrap="nowrap" align="center">
                              <img
                                src={resolveBadgeImageSrc(expandedCabinetEntry.displayImageKey) ?? ""}
                                alt={localizeBadgeText(expandedCabinetEntry.definition.name, locale)}
                                className="kwiz-trophy-detail-image"
                              />
                              <Stack gap={2}>
                                <Text fw={700}>{localizeBadgeText(expandedCabinetEntry.definition.name, locale)}</Text>
                                <Badge color="yellow" variant="light">
                                  {t("player.trophyCurrentTier", {
                                    tier: localizeBadgeText(
                                      expandedCabinetEntry.currentTierConfig?.name
                                        ?? expandedCabinetEntry.definition.tiers[0]?.name
                                        ?? { en: "Wood", sv: "Trä" },
                                      locale
                                    ),
                                  })}
                                </Badge>
                              </Stack>
                            </Group>
                            <Text size="sm" c="dimmed">{t("player.profileStatQuizzesCompleted")}: {quizzesCompleted}</Text>
                          </Group>

                          <Text size="sm" c="dimmed">
                            {localizeBadgeText(
                              expandedCabinetEntry.currentTierConfig?.flavourText
                                ?? expandedCabinetEntry.definition.tiers[0]?.flavourText
                                ?? { en: "", sv: "" },
                              locale
                            )}
                          </Text>

                          <div className="kwiz-trophy-progress-track" aria-hidden="true">
                            <span
                              className="kwiz-trophy-progress-fill"
                              style={{ width: `${expandedCabinetEntry.progressToNext * 100}%` }}
                            />
                          </div>

                          <Group justify="space-between" align="center">
                            <Text size="xs" c="dimmed">
                              {expandedCabinetEntry.nextTierConfig
                                ? t("player.trophyProgressToNext", { next: expandedCabinetEntry.nextTierConfig.unlockValue })
                                : t("player.trophyMaxTierReached")}
                            </Text>
                          </Group>

                          <div className="kwiz-trophy-threshold-row" aria-hidden="true">
                            {expandedCabinetEntry.definition.tiers.map((tier) => (
                              <div key={`${expandedCabinetEntry.definition.id}-threshold-${tier.tier}`} className="kwiz-trophy-threshold-item">
                                <span className={`kwiz-trophy-threshold-dot${tier.tier === expandedCabinetEntry.currentTier ? " is-current" : ""}${tier.tier <= expandedCabinetEntry.currentTier ? " is-earned" : ""}`} />
                                <span className="kwiz-trophy-threshold-label">{tier.unlockValue}</span>
                              </div>
                            ))}
                          </div>
                        </Stack>
                      </div>
                    ) : null}
                  </>
                )}
              </Stack>
            </section>
          ) : null}

          {!loading && !error && discoveryBadges.length > 0 ? (
            <section className="kwiz-discovery-section">
              <Stack gap="sm">
                <Group justify="space-between" align="center" wrap="wrap">
                  <Text className="kwiz-profile-section-label">{t("player.discoverySectionTitle")}</Text>
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
                      <div key={badge.id} className="kwiz-discovery-item">
                        <Group align="flex-start" wrap="nowrap">
                          <span className="kwiz-profile-badge-icon is-discovery" aria-hidden="true">🧭</span>
                          <Stack gap={2}>
                            <Text fw={700}>{displayName}</Text>
                            <Text size="sm" c="dimmed">{flavourText}</Text>
                            <Text size="xs" c="dimmed">{t("player.discoveryEarnedAt", { date: formatEarnedAt(badge.earnedAt) })}</Text>
                          </Stack>
                        </Group>
                      </div>
                    );
                  })}
                </div>
              </Stack>
            </section>
          ) : null}
      </Stack>
    </Stack>
  );
}
