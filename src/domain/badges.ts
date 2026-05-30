export type BadgeLocale = "en" | "sv";
export type BadgeType = "tiered" | "discovery";
export type TrophyLevel = "wood" | "iron" | "bronze" | "silver" | "gold" | "platinum";
export type BadgeIconName = "ti-trophy" | "ti-pencil" | "ti-flame" | "ti-star";

export interface BadgeText {
  en: string;
  sv: string;
}

export interface BadgeTierConfig {
  tier: 1 | 2 | 3 | 4 | 5 | 6;
  level: TrophyLevel;
  name: BadgeText;
  flavourText: BadgeText;
  unlockValue: number;
  xpReward: number;
  imageKey: string | null;
}

interface BadgeBaseConfig {
  id: string;
  type: BadgeType;
  name: BadgeText;
  icon: BadgeIconName;
  imageKey: string | null;
}

export interface TieredBadgeConfig extends BadgeBaseConfig {
  type: "tiered";
  progressionMetric:
    | "quizzes_completed"
    | "quizzes_created_published"
    | "quizzes_played_total"
    | "play_streak_days"
    | "perfect_quizzes_completed";
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
  quizzesCreatedPublished: number;
  quizzesPlayedTotal: number;
  playStreakDays: number;
  perfectQuizzesCompleted: number;
  lastCompletedQuizDate: string | null;
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
    icon: "ti-trophy",
    description: makeLocalizedText(
      "Complete more quizzes to climb from Wood to Platinum.",
      "Slutför fler quiz för att klättra från Trä till Platina."
    ),
    imageKey: null,
    progressionMetric: "quizzes_completed",
    tiers: [
      {
        tier: 1,
        level: "wood",
        name: makeLocalizedText("Wood", "Trä"),
        flavourText: makeLocalizedText("Your first finish. The cabinet awakens.", "Din första slutförda runda. Skåpet vaknar."),
        unlockValue: 1,
        xpReward: 15,
        imageKey: "trophy-wood.png",
      },
      {
        tier: 2,
        level: "iron",
        name: makeLocalizedText("Iron", "Järn"),
        flavourText: makeLocalizedText("Solid routine. You are building momentum.", "Stabil rutin. Du bygger upp fart."),
        unlockValue: 1,
        xpReward: 25,
        imageKey: "trophy-iron.png",
      },
      {
        tier: 3,
        level: "bronze",
        name: makeLocalizedText("Bronze", "Brons"),
        flavourText: makeLocalizedText("You are now a known finisher.", "Du är nu en etablerad avslutare."),
        unlockValue: 10,
        xpReward: 50,
        imageKey: "trophy-bronze.png",
      },
      {
        tier: 4,
        level: "silver",
        name: makeLocalizedText("Silver", "Silver"),
        flavourText: makeLocalizedText("Consistency turns into mastery.", "Konsekvens börjar bli mästerskap."),
        unlockValue: 50,
        xpReward: 100,
        imageKey: "trophy-silver.png",
      },
      {
        tier: 5,
        level: "gold",
        name: makeLocalizedText("Gold", "Guld"),
        flavourText: makeLocalizedText("Top-tier endurance. Almost legendary.", "Topputhållighet. Nästan legendariskt."),
        unlockValue: 100,
        xpReward: 200,
        imageKey: "trophy-gold.png",
      },
      {
        tier: 6,
        level: "platinum",
        name: makeLocalizedText("Platinum", "Platina"),
        flavourText: makeLocalizedText("Legend status unlocked.", "Legendstatus upplåst."),
        unlockValue: 200,
        xpReward: 350,
        imageKey: "trophy-platinum.png",
      },
    ],
  },
  {
    id: "quiz_crafter",
    type: "tiered",
    name: makeLocalizedText("Quiz Jockey", "Quizjockey"),
    icon: "ti-pencil",
    description: makeLocalizedText(
      "Craft sets people come back for.",
      "Skapa quizset som folk kommer tillbaka till."
    ),
    imageKey: null,
    progressionMetric: "quizzes_created_published",
    tiers: [
      {
        tier: 1,
        level: "wood",
        name: makeLocalizedText("Wood", "Trä"),
        flavourText: makeLocalizedText("First record pressed", "Första skivan pressad"),
        unlockValue: 1,
        xpReward: 20,
        imageKey: "trophy-wood.png",
      },
      {
        tier: 2,
        level: "iron",
        name: makeLocalizedText("Iron", "Järn"),
        flavourText: makeLocalizedText("Building a setlist", "Bygger en setlist"),
        unlockValue: 5,
        xpReward: 30,
        imageKey: "trophy-iron.png",
      },
      {
        tier: 3,
        level: "bronze",
        name: makeLocalizedText("Bronze", "Brons"),
        flavourText: makeLocalizedText("The dancefloor is filling up", "Dansgolvet fylls upp"),
        unlockValue: 15,
        xpReward: 60,
        imageKey: "trophy-bronze.png",
      },
      {
        tier: 4,
        level: "silver",
        name: makeLocalizedText("Silver", "Silver"),
        flavourText: makeLocalizedText("They're requesting your tracks", "De ber om dina tracks"),
        unlockValue: 30,
        xpReward: 120,
        imageKey: "trophy-silver.png",
      },
      {
        tier: 5,
        level: "gold",
        name: makeLocalizedText("Gold", "Guld"),
        flavourText: makeLocalizedText("Headliner material", "Headliner-material"),
        unlockValue: 60,
        xpReward: 220,
        imageKey: "trophy-gold.png",
      },
      {
        tier: 6,
        level: "platinum",
        name: makeLocalizedText("Platinum", "Platina"),
        flavourText: makeLocalizedText("Legendary set", "Legendarisk set"),
        unlockValue: 100,
        xpReward: 360,
        imageKey: "trophy-platinum.png",
      },
    ],
  },
  {
    id: "sage",
    type: "tiered",
    name: makeLocalizedText("Sage", "Sage"),
    icon: "ti-star",
    description: makeLocalizedText(
      "Your quizzes are being played across the map.",
      "Dina quiz spelas runt om på kartan."
    ),
    imageKey: null,
    progressionMetric: "quizzes_played_total",
    tiers: [
      {
        tier: 1,
        level: "wood",
        name: makeLocalizedText("Wood", "Trä"),
        flavourText: makeLocalizedText("Your first students have arrived", "Dina första elever har kommit"),
        unlockValue: 10,
        xpReward: 20,
        imageKey: "trophy-wood.png",
      },
      {
        tier: 2,
        level: "iron",
        name: makeLocalizedText("Iron", "Järn"),
        flavourText: makeLocalizedText("Word is spreading", "Ryktet sprider sig"),
        unlockValue: 50,
        xpReward: 35,
        imageKey: "trophy-iron.png",
      },
      {
        tier: 3,
        level: "bronze",
        name: makeLocalizedText("Bronze", "Brons"),
        flavourText: makeLocalizedText("You're leaving a mark", "Du lämnar avtryck"),
        unlockValue: 200,
        xpReward: 70,
        imageKey: "trophy-bronze.png",
      },
      {
        tier: 4,
        level: "silver",
        name: makeLocalizedText("Silver", "Silver"),
        flavourText: makeLocalizedText("People seek out your quizzes", "Folk söker upp dina quiz"),
        unlockValue: 500,
        xpReward: 130,
        imageKey: "trophy-silver.png",
      },
      {
        tier: 5,
        level: "gold",
        name: makeLocalizedText("Gold", "Guld"),
        flavourText: makeLocalizedText("Knowledge travels far", "Kunskap reser långt"),
        unlockValue: 1000,
        xpReward: 240,
        imageKey: "trophy-gold.png",
      },
      {
        tier: 6,
        level: "platinum",
        name: makeLocalizedText("Platinum", "Platina"),
        flavourText: makeLocalizedText("A legend in the making", "En legend under uppbyggnad"),
        unlockValue: 5000,
        xpReward: 380,
        imageKey: "trophy-platinum.png",
      },
    ],
  },
  {
    id: "on_fire",
    type: "tiered",
    name: makeLocalizedText("On fire", "I zonen"),
    icon: "ti-flame",
    description: makeLocalizedText(
      "Keep your momentum and chain completions.",
      "Håll uppe farten och kedja slutföranden."
    ),
    imageKey: null,
    progressionMetric: "play_streak_days",
    tiers: [
      {
        tier: 1,
        level: "wood",
        name: makeLocalizedText("Wood", "Trä"),
        flavourText: makeLocalizedText("A spark appears.", "En gnista tänds."),
        unlockValue: 3,
        xpReward: 18,
        imageKey: "trophy-wood.png",
      },
      {
        tier: 2,
        level: "iron",
        name: makeLocalizedText("Iron", "Järn"),
        flavourText: makeLocalizedText("Your pace is hard to ignore.", "Ditt tempo går inte att ignorera."),
        unlockValue: 3,
        xpReward: 32,
        imageKey: "trophy-iron.png",
      },
      {
        tier: 3,
        level: "bronze",
        name: makeLocalizedText("Bronze", "Brons"),
        flavourText: makeLocalizedText("Momentum is now a habit.", "Farten har blivit en vana."),
        unlockValue: 10,
        xpReward: 65,
        imageKey: "trophy-bronze.png",
      },
      {
        tier: 4,
        level: "silver",
        name: makeLocalizedText("Silver", "Silver"),
        flavourText: makeLocalizedText("You blaze through every challenge.", "Du tar dig igenom varje utmaning med glöd."),
        unlockValue: 30,
        xpReward: 125,
        imageKey: "trophy-silver.png",
      },
      {
        tier: 5,
        level: "gold",
        name: makeLocalizedText("Gold", "Guld"),
        flavourText: makeLocalizedText("You are heat and precision combined.", "Du är hetta och precision i ett."),
        unlockValue: 100,
        xpReward: 230,
        imageKey: "trophy-gold.png",
      },
      {
        tier: 6,
        level: "platinum",
        name: makeLocalizedText("Platinum", "Platina"),
        flavourText: makeLocalizedText("You set the pace for everyone else.", "Du sätter tempot för alla andra."),
        unlockValue: 200,
        xpReward: 365,
        imageKey: "trophy-platinum.png",
      },
    ],
  },
  {
    id: "perfectionist",
    type: "tiered",
    name: makeLocalizedText("Perfectionist", "Perfektionist"),
    icon: "ti-star",
    description: makeLocalizedText(
      "Aim for flawless runs and polished execution.",
      "Sikta mot felfria rundor och skarp precision."
    ),
    imageKey: null,
    progressionMetric: "perfect_quizzes_completed",
    tiers: [
      {
        tier: 1,
        level: "wood",
        name: makeLocalizedText("Wood", "Trä"),
        flavourText: makeLocalizedText("The pursuit of perfect starts now.", "Jakten på det perfekta börjar nu."),
        unlockValue: 1,
        xpReward: 22,
        imageKey: "trophy-wood.png",
      },
      {
        tier: 2,
        level: "iron",
        name: makeLocalizedText("Iron", "Järn"),
        flavourText: makeLocalizedText("Small details begin to matter.", "Små detaljer börjar spela roll."),
        unlockValue: 1,
        xpReward: 35,
        imageKey: "trophy-iron.png",
      },
      {
        tier: 3,
        level: "bronze",
        name: makeLocalizedText("Bronze", "Brons"),
        flavourText: makeLocalizedText("Clean runs become your standard.", "Rena rundor blir din standard."),
        unlockValue: 5,
        xpReward: 70,
        imageKey: "trophy-bronze.png",
      },
      {
        tier: 4,
        level: "silver",
        name: makeLocalizedText("Silver", "Silver"),
        flavourText: makeLocalizedText("Your execution is razor sharp.", "Din genomföring är knivskarp."),
        unlockValue: 20,
        xpReward: 130,
        imageKey: "trophy-silver.png",
      },
      {
        tier: 5,
        level: "gold",
        name: makeLocalizedText("Gold", "Guld"),
        flavourText: makeLocalizedText("Near-perfect is your default mode.", "Nära perfekt är ditt normalläge."),
        unlockValue: 50,
        xpReward: 240,
        imageKey: "trophy-gold.png",
      },
      {
        tier: 6,
        level: "platinum",
        name: makeLocalizedText("Platinum", "Platina"),
        flavourText: makeLocalizedText("Nothing left to polish. Pure mastery.", "Inget mer att putsa. Ren mästarklass."),
        unlockValue: 100,
        xpReward: 380,
        imageKey: "trophy-platinum.png",
      },
    ],
  },
  {
    id: "local_hero",
    type: "discovery",
    name: makeLocalizedText("Local hero", "Lokal hjälte"),
    icon: "ti-star",
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
    icon: "ti-star",
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
    icon: "ti-star",
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
    icon: "ti-star",
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
    icon: "ti-star",
    flavourText: makeLocalizedText("Your pace said it all.", "Ditt tempo sa allt."),
    imageKey: null,
    triggerEventKey: "pace_fast",
  },
  {
    id: "sub_elite",
    type: "discovery",
    name: makeLocalizedText("Sub-elite", "Subelit"),
    icon: "ti-star",
    flavourText: makeLocalizedText("Your pace said it all.", "Ditt tempo sa allt."),
    imageKey: null,
    triggerEventKey: "pace_consistent",
  },
  {
    id: "elite_runner",
    type: "discovery",
    name: makeLocalizedText("Elite runner", "Elitlöpare"),
    icon: "ti-star",
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

function getProgressValueForBadge(progress: BadgeProgressState, badge: TieredBadgeConfig): number {
  switch (badge.progressionMetric) {
    case "quizzes_created_published":
      return progress.quizzesCreatedPublished;
    case "quizzes_played_total":
      return progress.quizzesPlayedTotal;
    case "play_streak_days":
      return progress.playStreakDays;
    case "perfect_quizzes_completed":
      return progress.perfectQuizzesCompleted;
    case "quizzes_completed":
    default:
      return progress.quizzesCompleted;
  }
}

export function evaluateBadgeUnlocks(progress: BadgeProgressState, locale: BadgeLocale): BadgeUnlockEvent[] {
  const events: BadgeUnlockEvent[] = [];

  for (const badge of BADGE_CATALOG) {
    if (badge.type === "tiered") {
      const currentTier = progress.earnedTierByBadgeId[badge.id] ?? 0;
      const progressValue = getProgressValueForBadge(progress, badge);
      const targetTier = getHighestUnlockedTier(badge, progressValue)?.tier ?? 0;

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