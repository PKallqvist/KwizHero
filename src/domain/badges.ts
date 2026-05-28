export type BadgeLocale = "en" | "sv";
export type BadgeType = "tiered" | "discovery";

export interface BadgeText {
  en: string;
  sv: string;
}

export interface BadgeTierConfig {
  tier: 1 | 2 | 3 | 4;
  name: BadgeText;
  unlockValue: number;
  xpReward: number;
  imageKey: string | null;
}

interface BadgeBaseConfig {
  id: string;
  type: BadgeType;
  name: BadgeText;
  imageKey: string | null;
}

export interface TieredBadgeConfig extends BadgeBaseConfig {
  type: "tiered";
  progressionMetric: "quizzes_completed";
  description: BadgeText;
  tiers: BadgeTierConfig[];
}

export interface DiscoveryBadgeConfig extends BadgeBaseConfig {
  type: "discovery";
  flavourText: BadgeText;
  triggerEventKey: string;
}

export type BadgeDefinition = TieredBadgeConfig | DiscoveryBadgeConfig;

export interface EarnedBadgeRecord {
  badgeId: string;
  tier: number | null;
  earnedAt: string;
  earnedByUid: string;
  quizId: string | null;
  sessionId: string | null;
}

export interface BadgeProgressState {
  quizzesCompleted: number;
  triggeredEventKeys: string[];
  earnedTierByBadgeId: Record<string, number>;
  earnedDiscoveryBadgeIds: string[];
}

export interface BadgeUnlockEvent {
  badgeId: string;
  type: BadgeType;
  tier: number | null;
  xpReward: number;
  displayName: string;
  flavourText: string | null;
  imageKey: string | null;
}

function makeLocalizedText(en: string, sv: string): BadgeText {
  return { en, sv };
}

export const BADGE_CATALOG = [
  {
    id: "quiz_veteran",
    type: "tiered",
    name: makeLocalizedText("Quiz veteran", "Quizveteran"),
    description: makeLocalizedText(
      "Complete more quizzes to climb from Iron to Gold.",
      "Slutför fler quiz för att klättra från Järn till Guld."
    ),
    imageKey: null,
    progressionMetric: "quizzes_completed",
    tiers: [
      {
        tier: 1,
        name: makeLocalizedText("Iron", "Järn"),
        unlockValue: 1,
        xpReward: 25,
        imageKey: null,
      },
      {
        tier: 2,
        name: makeLocalizedText("Bronze", "Brons"),
        unlockValue: 3,
        xpReward: 50,
        imageKey: null,
      },
      {
        tier: 3,
        name: makeLocalizedText("Silver", "Silver"),
        unlockValue: 10,
        xpReward: 100,
        imageKey: null,
      },
      {
        tier: 4,
        name: makeLocalizedText("Gold", "Guld"),
        unlockValue: 25,
        xpReward: 200,
        imageKey: null,
      },
    ],
  },
  {
    id: "local_hero",
    type: "discovery",
    name: makeLocalizedText("Local hero", "Lokal hjälte"),
    flavourText: makeLocalizedText(
      "You keep coming back to the same trails. This place knows you.",
      "Du kommer alltid tillbaka till samma stigar. Den här platsen känner dig."
    ),
    imageKey: null,
    triggerEventKey: "same_trails",
  },
  {
    id: "traveller",
    type: "discovery",
    name: makeLocalizedText("Traveller", "Resenär"),
    flavourText: makeLocalizedText(
      "You've brought your curiosity to a new city.",
      "Du har tagit med din nyfikenhet till en ny stad."
    ),
    imageKey: null,
    triggerEventKey: "new_city",
  },
  {
    id: "seasoned",
    type: "discovery",
    name: makeLocalizedText("Seasoned", "Väletablerad"),
    flavourText: makeLocalizedText(
      "Spring, summer, autumn, winter. You've quizzed through them all.",
      "Vår, sommar, höst, vinter. Du har quizat dig genom dem alla."
    ),
    imageKey: null,
    triggerEventKey: "all_seasons",
  },
  {
    id: "nighthawk",
    type: "discovery",
    name: makeLocalizedText("Nighthawk", "Nattuggla"),
    flavourText: makeLocalizedText(
      "You completed a quiz in the dead of night. Most people are asleep right now.",
      "Du slutförde ett quiz mitt i natten. De flesta sover just nu."
    ),
    imageKey: null,
    triggerEventKey: "dead_of_night",
  },
  {
    id: "road_runner",
    type: "discovery",
    name: makeLocalizedText("Road runner", "Vägslukare"),
    flavourText: makeLocalizedText("Your pace said it all.", "Ditt tempo sa allt."),
    imageKey: null,
    triggerEventKey: "pace_fast",
  },
  {
    id: "sub_elite",
    type: "discovery",
    name: makeLocalizedText("Sub-elite", "Subelit"),
    flavourText: makeLocalizedText("Your pace said it all.", "Ditt tempo sa allt."),
    imageKey: null,
    triggerEventKey: "pace_consistent",
  },
  {
    id: "elite_runner",
    type: "discovery",
    name: makeLocalizedText("Elite runner", "Elitlöpare"),
    flavourText: makeLocalizedText("Your pace said it all.", "Ditt tempo sa allt."),
    imageKey: null,
    triggerEventKey: "pace_master",
  },
] as const satisfies readonly BadgeDefinition[];

export function localizeBadgeText(text: BadgeText, locale: BadgeLocale): string {
  return text[locale] ?? text.en;
}

export function getBadgeDefinition(badgeId: string): BadgeDefinition | null {
  return BADGE_CATALOG.find((badge) => badge.id === badgeId) ?? null;
}

export function getTierLabel(badge: TieredBadgeConfig, tier: number, locale: BadgeLocale): string {
  const entry = badge.tiers.find((tierConfig) => tierConfig.tier === tier);
  if (!entry) return "";
  return localizeBadgeText(entry.name, locale);
}

function getHighestUnlockedTier(badge: TieredBadgeConfig, progressValue: number): BadgeTierConfig | null {
  const eligibleTiers = badge.tiers.filter((tierConfig) => progressValue >= tierConfig.unlockValue);
  return eligibleTiers.at(-1) ?? null;
}

export function evaluateBadgeUnlocks(progress: BadgeProgressState, locale: BadgeLocale): BadgeUnlockEvent[] {
  const events: BadgeUnlockEvent[] = [];

  for (const badge of BADGE_CATALOG) {
    if (badge.type === "tiered") {
      const currentTier = progress.earnedTierByBadgeId[badge.id] ?? 0;
      const targetTier = getHighestUnlockedTier(badge, progress.quizzesCompleted)?.tier ?? 0;

      for (let tier = currentTier + 1; tier <= targetTier; tier += 1) {
        const tierConfig = badge.tiers.find((entry) => entry.tier === tier);
        if (!tierConfig) continue;
        events.push({
          badgeId: badge.id,
          type: badge.type,
          tier,
          xpReward: tierConfig.xpReward,
          displayName: `${localizeBadgeText(badge.name, locale)} · ${localizeBadgeText(tierConfig.name, locale)}`,
          flavourText: localizeBadgeText(badge.description, locale),
          imageKey: tierConfig.imageKey ?? badge.imageKey,
        });
      }
      continue;
    }

    if (progress.earnedDiscoveryBadgeIds.includes(badge.id)) {
      continue;
    }

    if (!progress.triggeredEventKeys.includes(badge.triggerEventKey)) {
      continue;
    }

    events.push({
      badgeId: badge.id,
      type: badge.type,
      tier: null,
      xpReward: 0,
      displayName: localizeBadgeText(badge.name, locale),
      flavourText: localizeBadgeText(badge.flavourText, locale),
      imageKey: badge.imageKey,
    });
  }

  return events;
}