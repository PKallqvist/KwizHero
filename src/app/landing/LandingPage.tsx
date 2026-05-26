import { Link } from "react-router-dom";
import { Button, Card, Group, Image, Stack, Text, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";

export function LandingPage(): JSX.Element {
  const { t } = useTranslation();

  return (
    <Card withBorder radius="lg" p="md" className="landing-hero">
      <Stack align="center" justify="center" className="landing-hero-content">
        <Image
          src="/branding/kwizherologo.png"
          alt="KwizHero logo"
          w="100%"
          className="landing-hero-logo"
          fit="contain"
          fallbackSrc="/robots.txt"
        />
        <Stack gap="xs" align="center">
          <Title order={2} ta="center">
            {t("landing.title")}
          </Title>
          <Text ta="center" c="dimmed" className="landing-hero-subtitle">
            {t("landing.subtitle")}
          </Text>
        </Stack>
        <Group>
          <Button component={Link} to="/create" size="md">
            {t("landing.createCta")}
          </Button>
          <Button component={Link} to="/play/demo" size="md" variant="light">
            {t("landing.playCta")}
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
