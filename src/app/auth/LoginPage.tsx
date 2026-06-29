import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Alert, Button, Card, Divider, Group, PasswordInput, Stack, Text, TextInput, Title } from "@mantine/core";
import { IconAlertCircle, IconBrandGoogle, IconMail } from "@tabler/icons-react";
import { useAuth } from "../../platform/context/AuthContext";

export function LoginPage(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isCreator, user, linkGoogle, linkEmail, signInGoogle, signInEmail, signUpEmail } = useAuth();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isAnonymousWithPotentialData = user !== null && user.isAnonymous;

  if (isCreator) {
    return (
      <Stack align="center" gap="md" mt="xl">
        <Title order={3}>{t("auth.alreadySignedIn")}</Title>
        <Text c="dimmed">{user?.email ?? user?.displayName}</Text>
        <Button variant="light" onClick={() => navigate("/my-quizzes")}>
          {t("nav.myQuizzes")}
        </Button>
      </Stack>
    );
  }

  async function handleGoogle(): Promise<void> {
    setError(null);
    setLoading(true);
    try {
      if (isAnonymousWithPotentialData) {
        await linkGoogle();
      } else {
        await signInGoogle();
      }
      navigate("/my-quizzes");
    } catch (err: unknown) {
      setError((err as Error).message ?? t("auth.errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailSubmit(): Promise<void> {
    setError(null);
    if (!email.trim() || !password) {
      setError(t("auth.errorFieldsRequired"));
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        if (isAnonymousWithPotentialData) {
          await linkEmail(email, password);
        } else {
          await signUpEmail(email, password);
        }
      } else {
        await signInEmail(email, password);
      }
      navigate("/my-quizzes");
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      if (code === "auth/user-not-found" || code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setError(t("auth.errorInvalidCredentials"));
      } else if (code === "auth/email-already-in-use") {
        setError(t("auth.errorEmailInUse"));
      } else if (code === "auth/weak-password") {
        setError(t("auth.errorWeakPassword"));
      } else {
        setError((err as Error).message ?? t("auth.errorGeneric"));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Stack align="center" gap="md" mt="xl" maw={400} mx="auto" px="md">
      <Title order={2}>{t("auth.title")}</Title>
      <Text c="dimmed" ta="center">{t("auth.subtitle")}</Text>

      <Card withBorder radius="md" p="lg" w="100%">
        <Stack gap="md">
          <Button
            fullWidth
            variant="default"
            leftSection={<IconBrandGoogle size={18} />}
            onClick={() => void handleGoogle()}
            loading={loading}
          >
            {t("auth.signInWithGoogle")}
          </Button>

          <Divider label={t("auth.or")} labelPosition="center" />

          <TextInput
            label={t("auth.email")}
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            leftSection={<IconMail size={16} />}
          />
          <PasswordInput
            label={t("auth.password")}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleEmailSubmit();
            }}
          />

          {error ? (
            <Alert color="red" variant="light" icon={<IconAlertCircle size={16} />}>
              {error}
            </Alert>
          ) : null}

          <Button fullWidth onClick={() => void handleEmailSubmit()} loading={loading}>
            {mode === "signin" ? t("auth.signIn") : t("auth.signUp")}
          </Button>

          <Group justify="center">
            <Text size="sm" c="dimmed">
              {mode === "signin" ? t("auth.noAccount") : t("auth.hasAccount")}
            </Text>
            <Button
              variant="subtle"
              size="sm"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
              }}
            >
              {mode === "signin" ? t("auth.signUp") : t("auth.signIn")}
            </Button>
          </Group>
        </Stack>
      </Card>
    </Stack>
  );
}
