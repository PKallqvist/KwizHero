import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  NumberInput,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconAlertCircle, IconHeart, IconHeartFilled, IconMapPin, IconSearch } from "@tabler/icons-react";
import { distanceMeters, getCurrentCoordinates, type Coordinates } from "../../platform/map/geolocation";
import {
  getPlayerFavoriteQuizzes,
  getPlayerQuizHistory,
  getPublishedQuizDiscoveryItems,
  getQuizSummary,
  setPlayerQuizFavorite,
  type PlayerQuizHistoryItem,
  type PublishedQuizDiscoveryItem,
} from "../../platform/firebase/quizRepository";
import type { QuizSummary } from "../../domain/types";
import { classifyBrowseFavoriteGroup } from "./quizBrowseLogic";

interface BrowseQuizItem extends PublishedQuizDiscoveryItem {
  distanceMeters: number | null;
  isFavorite: boolean;
  latestHistory: PlayerQuizHistoryItem | null;
}

function getQuizDistanceMeters(quiz: PublishedQuizDiscoveryItem, coordinates: Coordinates | null): number | null {
  if (!coordinates || quiz.waypointCoordinates.length === 0) return null;
  return Math.min(...quiz.waypointCoordinates.map((point) => distanceMeters(coordinates, point)));
}

function groupFavorites(items: BrowseQuizItem[], summaryByQuizId: Record<string, QuizSummary | null>): { new: BrowseQuizItem[]; waiting: BrowseQuizItem[]; completed: BrowseQuizItem[] } {
  return items.reduce(
    (groups, item) => {
      const group = classifyBrowseFavoriteGroup({
        history: item.latestHistory,
        summary: summaryByQuizId[item.id] ?? null,
      });
      groups[group].push(item);
      return groups;
    },
    { new: [] as BrowseQuizItem[], waiting: [] as BrowseQuizItem[], completed: [] as BrowseQuizItem[] }
  );
}

export function QuizBrowsePage(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState<PublishedQuizDiscoveryItem[]>([]);
  const [favoriteQuizIds, setFavoriteQuizIds] = useState<string[]>([]);
  const [history, setHistory] = useState<PlayerQuizHistoryItem[]>([]);
  const [summaryByQuizId, setSummaryByQuizId] = useState<Record<string, QuizSummary | null>>({});
  const [search, setSearch] = useState("");
  const [nearbyOnly, setNearbyOnly] = useState(false);
  const [radiusKm, setRadiusKm] = useState<number | "">(25);
  const [currentCoordinates, setCurrentCoordinates] = useState<Coordinates | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [updatingFavoriteQuizId, setUpdatingFavoriteQuizId] = useState<string | null>(null);
  const [playCode, setPlayCode] = useState("");
  const [openingPlayCode, setOpeningPlayCode] = useState(false);

  async function refreshLocation(): Promise<void> {
    setLoadingLocation(true);
    setLocationError(null);
    try {
      const coordinates = await getCurrentCoordinates();
      setCurrentCoordinates(coordinates);
    } catch (locationLoadError) {
      setCurrentCoordinates(null);
      setLocationError((locationLoadError as Error).message ?? t("browse.locationUnavailable"));
    } finally {
      setLoadingLocation(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);
      try {
        const [nextQuizzes, nextFavorites, nextHistory] = await Promise.all([
          getPublishedQuizDiscoveryItems(),
          getPlayerFavoriteQuizzes(),
          getPlayerQuizHistory(),
        ]);
        if (!mounted) return;
        setQuizzes(nextQuizzes);
        setFavoriteQuizIds(nextFavorites.map((favorite) => favorite.quizId));
        setHistory(nextHistory);

        const nextSummaryEntries = await Promise.all(
          nextFavorites.map(async (favorite) => [favorite.quizId, await getQuizSummary(favorite.quizId)] as const)
        );
        if (!mounted) return;
        setSummaryByQuizId(Object.fromEntries(nextSummaryEntries));
      } catch (loadError) {
        if (!mounted) return;
        setError((loadError as Error).message ?? "Failed to load quizzes");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }

    load().catch(() => {
      if (!mounted) return;
      setLoading(false);
      setError("Failed to load quizzes");
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    refreshLocation().catch(() => {
      // handled above
    });
  }, []);

  const quizItems = useMemo(() => {
    return quizzes.map((quiz) => {
      const latestHistory = history.find((entry) => entry.quizId === quiz.id) ?? null;
      return {
        ...quiz,
        distanceMeters: getQuizDistanceMeters(quiz, currentCoordinates),
        isFavorite: favoriteQuizIds.includes(quiz.id),
        latestHistory,
      } satisfies BrowseQuizItem;
    });
  }, [currentCoordinates, favoriteQuizIds, history, quizzes]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return quizItems
      .filter((quiz) => {
        if (normalizedSearch.length === 0) return true;
        return [quiz.title, quiz.description].some((value) => value.toLowerCase().includes(normalizedSearch));
      })
      .filter((quiz) => {
        if (!nearbyOnly) return true;
        if (!currentCoordinates || quiz.distanceMeters === null) return false;
        if (typeof radiusKm !== "number") return true;
        return quiz.distanceMeters <= radiusKm * 1000;
      })
      .sort((left, right) => {
        if (nearbyOnly && currentCoordinates) {
          const leftDistance = left.distanceMeters ?? Number.POSITIVE_INFINITY;
          const rightDistance = right.distanceMeters ?? Number.POSITIVE_INFINITY;
          if (leftDistance !== rightDistance) return leftDistance - rightDistance;
        }
        return left.title.localeCompare(right.title);
      });
  }, [currentCoordinates, nearbyOnly, quizItems, radiusKm, search]);

  const favoriteGroups = useMemo(() => groupFavorites(quizItems.filter((item) => item.isFavorite), summaryByQuizId), [quizItems, summaryByQuizId]);
  const favoriteCount = favoriteGroups.new.length + favoriteGroups.waiting.length + favoriteGroups.completed.length;

  async function toggleFavorite(quizId: string, nextFavorited: boolean): Promise<void> {
    setUpdatingFavoriteQuizId(quizId);
    try {
      await setPlayerQuizFavorite(quizId, nextFavorited);
      setFavoriteQuizIds((current) => {
        const next = new Set(current);
        if (nextFavorited) {
          next.add(quizId);
        } else {
          next.delete(quizId);
        }
        return [...next];
      });
    } finally {
      setUpdatingFavoriteQuizId((current) => (current === quizId ? null : current));
    }
  }

  async function openByCode(): Promise<void> {
    const trimmed = playCode.trim();
    if (!trimmed) return;
    setOpeningPlayCode(true);
    try {
      navigate(`/play/${trimmed}`);
    } finally {
      setOpeningPlayCode(false);
    }
  }

  function renderQuizCard(quiz: BrowseQuizItem): JSX.Element {
    const scoreBadge = quiz.latestHistory?.status === "completed"
      ? `${quiz.latestHistory.score}/${quiz.questionCount}`
      : null;

    return (
      <Card key={quiz.id} withBorder radius="lg" p="md">
        <Stack gap="sm">
          <Group justify="space-between" align="start" wrap="wrap">
            <Stack gap={2}>
              <Group gap="xs" wrap="wrap">
                <Title order={4}>{quiz.title}</Title>
                <Badge variant="light" color="blue">
                  {t("userQuizzes.typePublic")}
                </Badge>
                {quiz.distanceMeters !== null ? (
                  <Badge variant="light">{t("browse.kmAway", { distance: (quiz.distanceMeters / 1000).toFixed(1) })}</Badge>
                ) : null}
              </Group>
              <Text size="sm" c="dimmed">
                {quiz.description || t("userQuizzes.noDescription")}
              </Text>
            </Stack>

            <Button
              variant={quiz.isFavorite ? "filled" : "light"}
              color="red"
              size="xs"
              leftSection={quiz.isFavorite ? <IconHeartFilled size={14} /> : <IconHeart size={14} />}
              loading={updatingFavoriteQuizId === quiz.id}
              onClick={() => toggleFavorite(quiz.id, !quiz.isFavorite)}
            >
              {quiz.isFavorite ? t("browse.unfavorite") : t("browse.favorite")}
            </Button>
          </Group>

          <Group gap="xs" wrap="wrap">
            <Badge variant="light">{t("userQuizzes.waypointCount", { count: quiz.waypointCount })}</Badge>
            <Badge variant="light">{t("browse.questionCount", { count: quiz.questionCount })}</Badge>
            {scoreBadge ? <Badge variant="light">{t("browse.scoreOutOf", { score: quiz.latestHistory?.score ?? 0, total: quiz.questionCount })}</Badge> : null}
          </Group>

          <Group justify="space-between" align="center" wrap="wrap">
            <Text size="sm" c="dimmed">
              {t("browse.questionCount", { count: quiz.questionCount })}
            </Text>
            <Button component={Link} to={`/play/${quiz.id}`} size="xs" leftSection={<IconMapPin size={14} />}>
              {t("browse.play")}
            </Button>
          </Group>
        </Stack>
      </Card>
    );
  }

  const favoriteItems = quizItems.filter((item) => item.isFavorite);
  const classifiedFavoriteGroups = favoriteItems.reduce(
    (groups, item) => {
      const group = classifyBrowseFavoriteGroup({
        history: item.latestHistory,
        summary: summaryByQuizId[item.id] ?? null,
      });
      groups[group].push(item);
      return groups;
    },
    { new: [] as BrowseQuizItem[], waiting: [] as BrowseQuizItem[], completed: [] as BrowseQuizItem[] }
  );

  return (
    <Stack gap="lg">
      <Stack gap="xs">
        <Title order={2}>{t("browse.title")}</Title>
        <Text c="dimmed">{t("browse.subtitle")}</Text>
      </Stack>

      <Card withBorder radius="lg" p="md">
        <Stack gap="md">
          <Card withBorder radius="md" p="sm">
            <Stack gap="sm">
              <Text fw={600}>{t("browse.codeTitle")}</Text>
              <Text size="sm" c="dimmed">{t("browse.codeHelp")}</Text>
              <Group align="end" wrap="wrap">
                <TextInput
                  label={t("browse.codeLabel")}
                  placeholder={t("browse.codePlaceholder")}
                  value={playCode}
                  onChange={(event) => setPlayCode(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void openByCode();
                    }
                  }}
                  w={260}
                />
                <Button loading={openingPlayCode} onClick={() => void openByCode()}>
                  {t("browse.openByCode")}
                </Button>
              </Group>
            </Stack>
          </Card>

          <TextInput
            label={t("browse.searchLabel")}
            placeholder={t("browse.searchPlaceholder")}
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />

          <Group align="end" wrap="wrap">
            <NumberInput
              label={t("browse.radiusLabel")}
              value={radiusKm}
              min={1}
              max={500}
              step={1}
              onChange={(value) => setRadiusKm(typeof value === "number" ? value : "")}
              w={160}
            />
            <Button
              variant={nearbyOnly ? "filled" : "light"}
              leftSection={<IconMapPin size={14} />}
              onClick={() => setNearbyOnly((current) => !current)}
            >
              {t("browse.nearbyLabel")}
            </Button>
            <Button variant="subtle" onClick={refreshLocation} loading={loadingLocation}>
              {t("browse.useLocation")}
            </Button>
          </Group>

          {locationError ? (
            <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
              {t("browse.locationUnavailable")}
            </Alert>
          ) : null}
          {loadingLocation ? <Text size="sm" c="dimmed">{t("browse.refreshingLocation")}</Text> : null}
        </Stack>
      </Card>

      {error ? (
        <Alert color="red" icon={<IconAlertCircle size={16} />}>
          {error}
        </Alert>
      ) : null}

      {loading ? (
        <Group justify="center">
          <Loader />
        </Group>
      ) : null}

      {!loading ? (
        <Stack gap="md">
          <Stack gap="xs">
            <Group justify="space-between" align="center">
              <Title order={3}>{t("browse.favoritesTitle")}</Title>
              <Badge variant="light">{favoriteCount}</Badge>
            </Group>

            {favoriteCount === 0 ? <Text size="sm" c="dimmed">{t("browse.noFavorites")}</Text> : null}

            {classifiedFavoriteGroups.new.length > 0 ? (
              <Stack gap="sm">
                <Text fw={600}>{t("browse.newGroup")}</Text>
                {classifiedFavoriteGroups.new.map(renderQuizCard)}
              </Stack>
            ) : null}

            {classifiedFavoriteGroups.waiting.length > 0 ? (
              <Stack gap="sm">
                <Text fw={600}>{t("browse.waitingGroup")}</Text>
                {classifiedFavoriteGroups.waiting.map(renderQuizCard)}
              </Stack>
            ) : null}

            {classifiedFavoriteGroups.completed.length > 0 ? (
              <Stack gap="sm">
                <Text fw={600}>{t("browse.completedGroup")}</Text>
                {classifiedFavoriteGroups.completed.map(renderQuizCard)}
              </Stack>
            ) : null}
          </Stack>

          <Stack gap="xs">
            <Title order={3}>{t("browse.resultsTitle")}</Title>
            {filteredItems.length === 0 ? (
              <Text c="dimmed">{t("browse.noResults")}</Text>
            ) : (
              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                {filteredItems.map(renderQuizCard)}
              </SimpleGrid>
            )}
          </Stack>
        </Stack>
      ) : null}
    </Stack>
  );
}
