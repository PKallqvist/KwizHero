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
        unlockValue: 3,
        xpReward: 25,
        imageKey: "trophy-iron.png",
      },
      {
        tier: 3,
        level: "bronze",
        name: makeLocalizedText("Bronze", "Brons"),
        flavourText: makeLocalizedText("You are now a known finisher.", "Du är nu en etablerad avslutare."),
        unlockValue: 6,
        xpReward: 50,
        imageKey: "trophy-bronze.png",
      },
      {
        tier: 4,
        level: "silver",
        name: makeLocalizedText("Silver", "Silver"),
        flavourText: makeLocalizedText("Consistency turns into mastery.", "Konsekvens börjar bli mästerskap."),
        unlockValue: 10,
        xpReward: 100,
        imageKey: "trophy-silver.png",
      },
      {
        tier: 5,
        level: "gold",
        name: makeLocalizedText("Gold", "Guld"),
        flavourText: makeLocalizedText("Top-tier endurance. Almost legendary.", "Topputhållighet. Nästan legendariskt."),
        unlockValue: 20,
        xpReward: 200,
        imageKey: "trophy-gold.png",
      },
      {
        tier: 6,
        level: "platinum",
        name: makeLocalizedText("Platinum", "Platina"),
        flavourText: makeLocalizedText("Legend status unlocked.", "Legendstatus upplåst."),
        unlockValue: 35,
        xpReward: 350,
        imageKey: "trophy-platinum.png",
      },
    ],
  },
  {
    id: "quiz_crafter",
    type: "tiered",
    name: makeLocalizedText("Quiz crafter", "Quizskapare"),
    icon: "ti-pencil",
    description: makeLocalizedText(
      "Design and launch quizzes to sharpen your craft.",
      "Designa och publicera quiz för att vässa ditt hantverk."
    ),
    imageKey: null,
    progressionMetric: "quizzes_completed",
    tiers: [
      {
        tier: 1,
        level: "wood",
        name: makeLocalizedText("Wood", "Trä"),
        flavourText: makeLocalizedText("First draft done. The studio is open.", "Första utkastet klart. Studion är öppen."),
        unlockValue: 2,
        xpReward: 20,
        imageKey: "trophy-wood.png",
      },
      {
        tier: 2,
        level: "iron",
        name: makeLocalizedText("Iron", "Järn"),
        flavourText: makeLocalizedText("Your design instincts are forming.", "Din designkänsla börjar ta form."),
        unlockValue: 4,
        xpReward: 30,
        imageKey: "trophy-iron.png",
      },
      {
        tier: 3,
        level: "bronze",
        name: makeLocalizedText("Bronze", "Brons"),
        flavourText: makeLocalizedText("Your quizzes now have signature style.", "Dina quiz börjar få en tydlig stil."),
        unlockValue: 7,
        xpReward: 60,
        imageKey: "trophy-bronze.png",
      },
      {
        tier: 4,
        level: "silver",
        name: makeLocalizedText("Silver", "Silver"),
        flavourText: makeLocalizedText("Structure and pacing feel professional.", "Struktur och tempo känns professionellt."),
        unlockValue: 12,
        xpReward: 120,
        imageKey: "trophy-silver.png",
      },
      {
        tier: 5,
        level: "gold",
        name: makeLocalizedText("Gold", "Guld"),
        flavourText: makeLocalizedText("Players remember your creations.", "Spelare minns dina skapelser."),
        unlockValue: 22,
        xpReward: 220,
        imageKey: "trophy-gold.png",
      },
      {
        tier: 6,
        level: "platinum",
        name: makeLocalizedText("Platinum", "Platina"),
        flavourText: makeLocalizedText("Master designer. Every route tells a story.", "Mästerdesigner. Varje rutt berättar en historia."),
        unlockValue: 36,
        xpReward: 360,
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
    progressionMetric: "quizzes_completed",
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
        unlockValue: 5,
        xpReward: 32,
        imageKey: "trophy-iron.png",
      },
      {
        tier: 3,
        level: "bronze",
        name: makeLocalizedText("Bronze", "Brons"),
        flavourText: makeLocalizedText("Momentum is now a habit.", "Farten har blivit en vana."),
        unlockValue: 8,
        xpReward: 65,
        imageKey: "trophy-bronze.png",
      },
      {
        tier: 4,
        level: "silver",
        name: makeLocalizedText("Silver", "Silver"),
        flavourText: makeLocalizedText("You blaze through every challenge.", "Du tar dig igenom varje utmaning med glöd."),
        unlockValue: 13,
        xpReward: 125,
        imageKey: "trophy-silver.png",
      },
      {
        tier: 5,
        level: "gold",
        name: makeLocalizedText("Gold", "Guld"),
        flavourText: makeLocalizedText("You are heat and precision combined.", "Du är hetta och precision i ett."),
        unlockValue: 24,
        xpReward: 230,
        imageKey: "trophy-gold.png",
      },
      {
        tier: 6,
        level: "platinum",
        name: makeLocalizedText("Platinum", "Platina"),
        flavourText: makeLocalizedText("You set the pace for everyone else.", "Du sätter tempot för alla andra."),
        unlockValue: 38,
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
    progressionMetric: "quizzes_completed",
    tiers: [
      {
        tier: 1,
        level: "wood",
        name: makeLocalizedText("Wood", "Trä"),
        flavourText: makeLocalizedText("The pursuit of perfect starts now.", "Jakten på det perfekta börjar nu."),
        unlockValue: 4,
        xpReward: 22,
        imageKey: "trophy-wood.png",
      },
      {
        tier: 2,
        level: "iron",
        name: makeLocalizedText("Iron", "Järn"),
        flavourText: makeLocalizedText("Small details begin to matter.", "Små detaljer börjar spela roll."),
        unlockValue: 6,
        xpReward: 35,
        imageKey: "trophy-iron.png",
      },
      {
        tier: 3,
        level: "bronze",
        name: makeLocalizedText("Bronze", "Brons"),
        flavourText: makeLocalizedText("Clean runs become your standard.", "Rena rundor blir din standard."),
        unlockValue: 9,
        xpReward: 70,
        imageKey: "trophy-bronze.png",
      },
      {
        tier: 4,
        level: "silver",
        name: makeLocalizedText("Silver", "Silver"),
        flavourText: makeLocalizedText("Your execution is razor sharp.", "Din genomföring är knivskarp."),
        unlockValue: 14,
        xpReward: 130,
        imageKey: "trophy-silver.png",
      },
      {
        tier: 5,
        level: "gold",
        name: makeLocalizedText("Gold", "Guld"),
        flavourText: makeLocalizedText("Near-perfect is your default mode.", "Nära perfekt är ditt normalläge."),
        unlockValue: 26,
        xpReward: 240,
        imageKey: "trophy-gold.png",
      },
      {
        tier: 6,
        level: "platinum",
        name: makeLocalizedText("Platinum", "Platina"),
        flavourText: makeLocalizedText("Nothing left to polish. Pure mastery.", "Inget mer att putsa. Ren mästarklass."),
        unlockValue: 40,
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