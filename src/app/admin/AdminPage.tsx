import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  NumberInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconAlertCircle, IconSearch, IconSparkles } from "@tabler/icons-react";
import { useAuth } from "../../platform/context/AuthContext";
import { searchUsers, giftAiTokens, type AdminUserResult } from "../../platform/firebase/quizRepository";

export function AdminPage(): JSX.Element {
  const { t } = useTranslation();
  const { isAdmin, loading } = useAuth();

  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<AdminUserResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [giftAmount, setGiftAmount] = useState(10);
  const [giftingUid, setGiftingUid] = useState<string | null>(null);
  const [giftSuccess, setGiftSuccess] = useState<string | null>(null);

  if (!loading && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  async function handleSearch(): Promise<void> {
    const q = searchQuery.trim();
    if (q.length < 2) return;
    setSearching(true);
    setSearchError(null);
    setSearchResults([]);
    setGiftSuccess(null);
    try {
      const results = await searchUsers(q);
      setSearchResults(results);
      if (results.length === 0) {
        setSearchError(t("admin.noUsersFound"));
      }
    } catch (err) {
      setSearchError((err as Error).message ?? t("admin.searchError"));
    } finally {
      setSearching(false);
    }
  }

  async function handleGift(uid: string): Promise<void> {
    if (giftAmount < 1) return;
    setGiftingUid(uid);
    setGiftSuccess(null);
    try {
      const result = await giftAiTokens({ targetUid: uid, tokenCount: giftAmount });
      setSearchResults((prev) =>
        prev.map((u) => (u.uid === uid ? { ...u, aiTokens: result.aiTokens } : u))
      );
      setGiftSuccess(t("admin.giftSuccess", { count: giftAmount, uid }));
    } catch (err) {
      setSearchError((err as Error).message ?? t("admin.giftError"));
    } finally {
      setGiftingUid(null);
    }
  }

  return (
    <Stack gap="md" maw={600} mx="auto">
      <Title order={2}>{t("admin.title")}</Title>
      <Text c="dimmed">{t("admin.subtitle")}</Text>

      <Card withBorder radius="md" p="md">
        <Stack gap="sm">
          <Text fw={600}>{t("admin.searchUsers")}</Text>
          <Group gap="xs" wrap="nowrap">
            <TextInput
              placeholder={t("admin.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSearch();
              }}
              className="kwiz-creator-flex-1"
            />
            <Button
              leftSection={<IconSearch size={16} />}
              onClick={() => void handleSearch()}
              loading={searching}
            >
              {t("admin.search")}
            </Button>
          </Group>

          {searchError ? (
            <Alert color="orange" variant="light" icon={<IconAlertCircle size={16} />}>
              {searchError}
            </Alert>
          ) : null}

          {giftSuccess ? (
            <Alert color="teal" variant="light">
              {giftSuccess}
            </Alert>
          ) : null}

          {searchResults.map((user) => (
            <Card key={user.uid} withBorder radius="md" p="sm">
              <Stack gap="xs">
                <Group justify="space-between" wrap="wrap">
                  <div>
                    <Text fw={600}>{user.displayName ?? t("admin.anonymous")}</Text>
                    <Text size="sm" c="dimmed">{user.email ?? user.uid}</Text>
                  </div>
                  <Badge color="teal" variant="light">
                    {t("admin.tokens", { count: user.aiTokens })}
                  </Badge>
                </Group>
                <Text size="xs" c="dimmed">UID: {user.uid}</Text>
                <Group gap="xs" wrap="nowrap">
                  <NumberInput
                    min={1}
                    max={99999}
                    value={giftAmount}
                    onChange={(v) => setGiftAmount(typeof v === "number" ? v : 10)}
                    size="xs"
                    w={100}
                  />
                  <Button
                    size="xs"
                    leftSection={<IconSparkles size={14} />}
                    loading={giftingUid === user.uid}
                    onClick={() => void handleGift(user.uid)}
                  >
                    {t("admin.giftTokens")}
                  </Button>
                </Group>
              </Stack>
            </Card>
          ))}
        </Stack>
      </Card>
    </Stack>
  );
}
