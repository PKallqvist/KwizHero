import { Suspense, lazy } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ActionIcon,
  Anchor,
  AppShell,
  Button,
  Container,
  Group,
  Loader,
  Stack,
  Text,
  Title,
  useMantineColorScheme,
} from "@mantine/core";
import { IconLanguage, IconMoonStars, IconSun } from "@tabler/icons-react";

const CreateQuizPage = lazy(async () => {
  const module = await import("./app/creator/CreateQuizPage");
  return { default: module.CreateQuizPage };
});

const PlayQuizPage = lazy(async () => {
  const module = await import("./app/player/PlayQuizPage");
  return { default: module.PlayQuizPage };
});

export function App(): JSX.Element {
  const { t, i18n } = useTranslation();
  const { colorScheme, setColorScheme } = useMantineColorScheme();

  return (
    <AppShell padding="md">
      <Container size="lg">
        <Stack gap="md">
          <Group justify="space-between" align="center" wrap="wrap">
            <Group>
              <Title order={3}>KwizHero</Title>
              <Anchor component={Link} to="/create">
                {t("nav.creator")}
              </Anchor>
              <Anchor component={Link} to="/play/demo">
                {t("nav.play")}
              </Anchor>
            </Group>
            <Group>
              <Button
                variant="light"
                leftSection={<IconLanguage size={16} />}
                onClick={() => i18n.changeLanguage(i18n.language === "en" ? "sv" : "en")}
              >
                {i18n.language.toUpperCase()}
              </Button>
              <ActionIcon
                variant="light"
                size="lg"
                aria-label="Toggle color scheme"
                onClick={() => setColorScheme(colorScheme === "dark" ? "light" : "dark")}
              >
                {colorScheme === "dark" ? <IconSun size={18} /> : <IconMoonStars size={18} />}
              </ActionIcon>
            </Group>
          </Group>
          <Suspense fallback={<Group justify="center"><Loader /><Text>Loading…</Text></Group>}>
            <Routes>
              <Route path="/" element={<Navigate to="/create" replace />} />
              <Route path="/create" element={<CreateQuizPage />} />
              <Route path="/play/:quizId" element={<PlayQuizPage />} />
            </Routes>
          </Suspense>
        </Stack>
      </Container>
    </AppShell>
  );
}
