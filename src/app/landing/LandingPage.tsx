import { Link } from "react-router-dom";
import { Button, Card, Group, Image, Stack, Text, Title } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useTranslation } from "react-i18next";

export function LandingPage(): JSX.Element {
  const { t } = useTranslation();
  const isDesktop = useMediaQuery("(min-width: 62em)");

  return (
    <Card
      withBorder
      radius="lg"
      p="md"
      style={{
        minHeight: "calc(100dvh - 240px)",
        background: "linear-gradient(140deg, #f8fbff 0%, #eef8f1 48%, #fff7ed 100%)",
      }}
    >
      <Stack align="center" justify="center" gap={isDesktop ? 8 : "sm"} style={{ height: "100%" }}>
        <Image
          src="/branding/kwizherologo.png"
          alt="KwizHero logo"
          w="100%"
          maw={isDesktop ? 520 : 440}
          mah={isDesktop ? "22vh" : "30vh"}
          style={{ width: "100%", objectFit: "contain" }}
          fit="contain"
          fallbackSrc="/robots.txt"
        />
        <Stack gap="xs" align="center">
          <Title order={isDesktop ? 2 : 1} ta="center">
            {t("landing.title")}
          </Title>
          <Text ta="center" c="dimmed" maw={680}>
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
