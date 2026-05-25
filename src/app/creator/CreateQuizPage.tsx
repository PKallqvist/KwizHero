import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Circle, MapContainer, TileLayer, useMapEvents } from "react-leaflet";
import QRCode from "qrcode";
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Image,
  List,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Stepper,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { IconAlertCircle, IconCircleCheck, IconQrcode } from "@tabler/icons-react";
import { createDraftQuiz, publishQuiz } from "../../platform/firebase/quizRepository";
import type { DraftQuestionInput, DraftWaypointInput, QuizDraftInput } from "../../domain/types";

const now = new Date();
const plusDays = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

type WizardStep = 1 | 2 | 3 | 4 | 5;

interface WaypointPickerProps {
  lat: number;
  lng: number;
  radius: number;
  onChange: (lat: number, lng: number) => void;
}

function WaypointPicker(props: WaypointPickerProps): JSX.Element {
  function ClickCapture(): null {
    useMapEvents({
      click(event) {
        props.onChange(event.latlng.lat, event.latlng.lng);
      },
    });
    return null;
  }

  return (
    <MapContainer
      center={[props.lat, props.lng]}
      zoom={14}
      scrollWheelZoom
      style={{ height: 320, width: "100%", borderRadius: 12, border: "1px solid var(--mantine-color-gray-4)" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Circle center={[props.lat, props.lng]} radius={props.radius} pathOptions={{ color: "#0f6b5f" }} />
      <ClickCapture />
    </MapContainer>
  );
}

function createDefaultQuestion(): DraftQuestionInput {
  return {
    text: "",
    choices: ["", "", "", ""],
    correctIndex: 0,
  };
}

function createDefaultWaypoint(index: number): DraftWaypointInput {
  return {
    name: `Waypoint ${index + 1}`,
    lat: 57.7089,
    lng: 11.9746,
    questions: [
      {
        text: "How many players are on the field per team in soccer?",
        choices: ["9", "10", "11", "12"],
        correctIndex: 2,
      },
    ],
  };
}

export function CreateQuizPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState<WizardStep>(1);
  const [input, setInput] = useState<QuizDraftInput>({
    title: "Soccer Team Bi-weekly Quiz",
    description: "Public two-week quiz walk",
    locale: "sv",
    waypoints: [createDefaultWaypoint(0)],
    ruleset: {
      openAt: now.toISOString(),
      closeAt: plusDays.toISOString(),
      questionTimeLimitSeconds: 30,
      revealMode: "scheduled",
      revealAt: plusDays.toISOString(),
      waypointGateRadiusMeters: 40,
      scoringStrategy: "binary_correct_1_point",
    },
  });
  const [selectedWaypointIndex, setSelectedWaypointIndex] = useState(0);
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0);
  const [result, setResult] = useState<{ quizId: string; editKey: string } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const currentWaypoint = input.waypoints[selectedWaypointIndex] ?? null;
  const currentQuestion = currentWaypoint?.questions[selectedQuestionIndex] ?? null;

  const shareLink = useMemo(() => {
    if (!result) return "";
    return `${window.location.origin}/play/${result.quizId}`;
  }, [result]);

  useEffect(() => {
    async function buildQr(): Promise<void> {
      if (!shareLink) {
        setQrDataUrl("");
        return;
      }
      const dataUrl = await QRCode.toDataURL(shareLink, { width: 280, margin: 1 });
      setQrDataUrl(dataUrl);
    }
    buildQr().catch(() => setQrDataUrl(""));
  }, [shareLink]);

  function updateCurrentWaypoint(next: DraftWaypointInput): void {
    setInput((prev) => {
      const copy = [...prev.waypoints];
      copy[selectedWaypointIndex] = next;
      return { ...prev, waypoints: copy };
    });
  }

  function updateCurrentQuestion(next: DraftQuestionInput): void {
    if (!currentWaypoint) return;
    const nextQuestions = [...currentWaypoint.questions];
    nextQuestions[selectedQuestionIndex] = next;
    updateCurrentWaypoint({ ...currentWaypoint, questions: nextQuestions });
  }

  function addWaypoint(): void {
    setInput((prev) => {
      const waypoints = [...prev.waypoints, createDefaultWaypoint(prev.waypoints.length)];
      return { ...prev, waypoints };
    });
    setSelectedWaypointIndex(input.waypoints.length);
    setSelectedQuestionIndex(0);
  }

  function removeCurrentWaypoint(): void {
    if (input.waypoints.length <= 1) return;
    const nextWaypoints = input.waypoints.filter((_, i) => i !== selectedWaypointIndex);
    setInput((prev) => ({ ...prev, waypoints: nextWaypoints }));
    setSelectedWaypointIndex(Math.max(0, selectedWaypointIndex - 1));
    setSelectedQuestionIndex(0);
  }

  function addQuestionToCurrentWaypoint(): void {
    if (!currentWaypoint) return;
    updateCurrentWaypoint({
      ...currentWaypoint,
      questions: [...currentWaypoint.questions, createDefaultQuestion()],
    });
    setSelectedQuestionIndex(currentWaypoint.questions.length);
  }

  function removeCurrentQuestion(): void {
    if (!currentWaypoint || currentWaypoint.questions.length <= 1) return;
    const nextQuestions = currentWaypoint.questions.filter((_, i) => i !== selectedQuestionIndex);
    updateCurrentWaypoint({ ...currentWaypoint, questions: nextQuestions });
    setSelectedQuestionIndex(Math.max(0, selectedQuestionIndex - 1));
  }

  async function onCreate(): Promise<void> {
    setError(null);
    try {
      const created = await createDraftQuiz(input);
      setResult(created);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function onPublish(): Promise<void> {
    if (!result) return;
    setPublishing(true);
    setError(null);
    try {
      await publishQuiz(result.quizId, result.editKey);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPublishing(false);
    }
  }

  function nextStep(): void {
    setStep((prev) => (prev < 5 ? ((prev + 1) as WizardStep) : prev));
  }

  function previousStep(): void {
    setStep((prev) => (prev > 1 ? ((prev - 1) as WizardStep) : prev));
  }

  const hasWaypointData =
    input.waypoints.length > 0 && input.waypoints.every((w) => w.name.trim().length > 0);
  const hasQuestionData = input.waypoints.every(
    (w) =>
      w.questions.length > 0 &&
      w.questions.every((q) => q.text.trim().length > 5 && q.choices.every((c) => c.trim().length > 0))
  );

  const canGoNext =
    (step === 1 && input.title.trim().length > 2) ||
    (step === 2 && input.ruleset.questionTimeLimitSeconds > 0) ||
    (step === 3 && hasWaypointData) ||
    (step === 4 && hasQuestionData) ||
    step === 5;

  return (
    <Paper withBorder shadow="sm" radius="md" p="lg">
      <Stack gap="md">
        <Title order={2}>{t("creator.title")}</Title>
        <Text c="dimmed">{t("creator.step", { current: step, total: 5 })}</Text>

        <Stepper active={step - 1} onStepClick={(n) => setStep((n + 1) as WizardStep)} allowNextStepsSelect={false}>
          <Stepper.Step label={t("creator.steps.identity")} />
          <Stepper.Step label={t("creator.steps.rules")} />
          <Stepper.Step label={t("creator.steps.route")} />
          <Stepper.Step label={t("creator.steps.questions")} />
          <Stepper.Step label={t("creator.steps.publish")} />
        </Stepper>

        {step === 1 ? (
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <TextInput
              label={t("creator.identity.labelTitle")}
              value={input.title}
              onChange={(e) => setInput({ ...input, title: e.currentTarget.value })}
            />
            <Select
              label={t("creator.identity.labelLocale")}
              data={[
                { value: "sv", label: "Svenska" },
                { value: "en", label: "English" },
              ]}
              value={input.locale}
              onChange={(value) => {
                const locale = (value ?? "sv") as "en" | "sv";
                setInput({ ...input, locale });
                i18n.changeLanguage(locale);
              }}
            />
            <Textarea
              label={t("creator.identity.labelDescription")}
              minRows={3}
              value={input.description}
              onChange={(e) => setInput({ ...input, description: e.currentTarget.value })}
            />
          </SimpleGrid>
        ) : null}

        {step === 2 ? (
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <TextInput
              label={t("creator.rules.labelOpenAt")}
              type="datetime-local"
              value={new Date(input.ruleset.openAt).toISOString().slice(0, 16)}
              onChange={(e) =>
                setInput({ ...input, ruleset: { ...input.ruleset, openAt: new Date(e.currentTarget.value).toISOString() } })
              }
            />
            <TextInput
              label={t("creator.rules.labelCloseAt")}
              type="datetime-local"
              value={new Date(input.ruleset.closeAt).toISOString().slice(0, 16)}
              onChange={(e) =>
                setInput({ ...input, ruleset: { ...input.ruleset, closeAt: new Date(e.currentTarget.value).toISOString() } })
              }
            />
            <NumberInput
              label={t("creator.rules.labelQuestionTimer")}
              min={5}
              max={300}
              value={input.ruleset.questionTimeLimitSeconds}
              onChange={(value) =>
                setInput({
                  ...input,
                  ruleset: { ...input.ruleset, questionTimeLimitSeconds: Number(value) || 30 },
                })
              }
            />
            <Select
              label={t("creator.rules.labelRevealMode")}
              data={[
                { value: "instant", label: t("creator.rules.revealInstant") },
                { value: "on_completion", label: t("creator.rules.revealOnCompletion") },
                { value: "scheduled", label: t("creator.rules.revealScheduled") },
              ]}
              value={input.ruleset.revealMode}
              onChange={(value) =>
                setInput({
                  ...input,
                  ruleset: {
                    ...input.ruleset,
                    revealMode: (value ?? "scheduled") as "instant" | "on_completion" | "scheduled",
                  },
                })
              }
            />
            <NumberInput
              label={t("creator.rules.labelWaypointRadius")}
              min={10}
              max={200}
              value={input.ruleset.waypointGateRadiusMeters}
              onChange={(value) =>
                setInput({
                  ...input,
                  ruleset: { ...input.ruleset, waypointGateRadiusMeters: Number(value) || 40 },
                })
              }
            />
          </SimpleGrid>
        ) : null}

        {step === 3 ? (
          <Stack gap="md">
            <Group>
              <Select
                label={t("creator.route.labelWaypoint")}
                style={{ minWidth: 260 }}
                data={input.waypoints.map((w, i) => ({ value: String(i), label: `${i + 1}. ${w.name}` }))}
                value={String(selectedWaypointIndex)}
                onChange={(value) => {
                  const nextIndex = Number(value ?? "0");
                  setSelectedWaypointIndex(nextIndex);
                  setSelectedQuestionIndex(0);
                }}
              />
              <Button variant="light" onClick={addWaypoint}>
                {t("creator.route.addWaypoint")}
              </Button>
              <Button
                variant="light"
                color="red"
                onClick={removeCurrentWaypoint}
                disabled={input.waypoints.length <= 1}
              >
                {t("creator.route.removeWaypoint")}
              </Button>
              <Badge>{t("creator.route.waypointCount", { count: input.waypoints.length })}</Badge>
            </Group>

            {currentWaypoint ? (
              <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
                <TextInput
                  label={t("creator.route.labelName")}
                  value={currentWaypoint.name}
                  onChange={(e) => updateCurrentWaypoint({ ...currentWaypoint, name: e.currentTarget.value })}
                />
                <NumberInput
                  label={t("creator.route.labelLat")}
                  decimalScale={6}
                  value={currentWaypoint.lat}
                  onChange={(value) =>
                    updateCurrentWaypoint({ ...currentWaypoint, lat: Number(value) || currentWaypoint.lat })
                  }
                />
                <NumberInput
                  label={t("creator.route.labelLng")}
                  decimalScale={6}
                  value={currentWaypoint.lng}
                  onChange={(value) =>
                    updateCurrentWaypoint({ ...currentWaypoint, lng: Number(value) || currentWaypoint.lng })
                  }
                />
              </SimpleGrid>
            ) : null}

            {currentWaypoint ? (
              <>
                <Text c="dimmed">{t("creator.route.mapHint")}</Text>
                <WaypointPicker
                  lat={currentWaypoint.lat}
                  lng={currentWaypoint.lng}
                  radius={input.ruleset.waypointGateRadiusMeters}
                  onChange={(lat, lng) => updateCurrentWaypoint({ ...currentWaypoint, lat, lng })}
                />
              </>
            ) : null}
          </Stack>
        ) : null}

        {step === 4 ? (
          <Stack gap="md">
            {currentWaypoint ? (
              <Group>
                <Select
                  label={t("creator.questions.labelQuestion")}
                  style={{ minWidth: 260 }}
                  data={currentWaypoint.questions.map((q, i) => ({
                    value: String(i),
                    label: `${i + 1}. ${q.text.slice(0, 40) || "Untitled"}`,
                  }))}
                  value={String(selectedQuestionIndex)}
                  onChange={(value) => setSelectedQuestionIndex(Number(value ?? "0"))}
                />
                <Button variant="light" onClick={addQuestionToCurrentWaypoint}>
                  {t("creator.questions.addQuestion")}
                </Button>
                <Button
                  variant="light"
                  color="red"
                  onClick={removeCurrentQuestion}
                  disabled={currentWaypoint.questions.length <= 1}
                >
                  {t("creator.questions.removeQuestion")}
                </Button>
                <Badge>
                  {t("creator.questions.questionCount", { count: currentWaypoint.questions.length })}
                </Badge>
              </Group>
            ) : null}

            {currentQuestion ? (
              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                <TextInput
                  label={t("creator.questions.labelText")}
                  value={currentQuestion.text}
                  onChange={(e) => updateCurrentQuestion({ ...currentQuestion, text: e.currentTarget.value })}
                />
                <Select
                  label={t("creator.questions.labelCorrect")}
                  data={[
                    { value: "0", label: "A" },
                    { value: "1", label: "B" },
                    { value: "2", label: "C" },
                    { value: "3", label: "D" },
                  ]}
                  value={String(currentQuestion.correctIndex)}
                  onChange={(value) =>
                    updateCurrentQuestion({ ...currentQuestion, correctIndex: Number(value ?? "0") })
                  }
                />
                <TextInput
                  label={t("creator.questions.choiceA")}
                  value={currentQuestion.choices[0]}
                  onChange={(e) =>
                    updateCurrentQuestion({
                      ...currentQuestion,
                      choices: [e.currentTarget.value, currentQuestion.choices[1], currentQuestion.choices[2], currentQuestion.choices[3]],
                    })
                  }
                />
                <TextInput
                  label={t("creator.questions.choiceB")}
                  value={currentQuestion.choices[1]}
                  onChange={(e) =>
                    updateCurrentQuestion({
                      ...currentQuestion,
                      choices: [currentQuestion.choices[0], e.currentTarget.value, currentQuestion.choices[2], currentQuestion.choices[3]],
                    })
                  }
                />
                <TextInput
                  label={t("creator.questions.choiceC")}
                  value={currentQuestion.choices[2]}
                  onChange={(e) =>
                    updateCurrentQuestion({
                      ...currentQuestion,
                      choices: [currentQuestion.choices[0], currentQuestion.choices[1], e.currentTarget.value, currentQuestion.choices[3]],
                    })
                  }
                />
                <TextInput
                  label={t("creator.questions.choiceD")}
                  value={currentQuestion.choices[3]}
                  onChange={(e) =>
                    updateCurrentQuestion({
                      ...currentQuestion,
                      choices: [currentQuestion.choices[0], currentQuestion.choices[1], currentQuestion.choices[2], e.currentTarget.value],
                    })
                  }
                />
              </SimpleGrid>
            ) : null}
          </Stack>
        ) : null}

        {step === 5 ? (
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <Card withBorder radius="md">
              <Title order={4}>{t("creator.publish.reviewHeading")}</Title>
              <List mt="sm" spacing="xs">
                <List.Item>{t("creator.publish.reviewTitle", { title: input.title })}</List.Item>
                <List.Item>{t("creator.publish.reviewLocale", { locale: input.locale.toUpperCase() })}</List.Item>
                <List.Item>{t("creator.publish.reviewWaypoints", { count: input.waypoints.length })}</List.Item>
                <List.Item>
                  {t("creator.publish.reviewQuestions", {
                    count: input.waypoints.reduce((sum, w) => sum + w.questions.length, 0),
                  })}
                </List.Item>
                <List.Item>
                  {t("creator.publish.reviewTimer", { seconds: input.ruleset.questionTimeLimitSeconds })}
                </List.Item>
                <List.Item>
                  {t("creator.publish.reviewRevealMode", { mode: input.ruleset.revealMode })}
                </List.Item>
              </List>
            </Card>
            <Card withBorder radius="md">
              <Stack gap="sm">
                <Title order={4}>{t("creator.publish.publishHeading")}</Title>
                <Group>
                  <Button onClick={onCreate}>{t("creator.publish.createDraft")}</Button>
                  <Button variant="light" onClick={onPublish} disabled={!result} loading={publishing}>
                    {t("creator.publish.publish")}
                  </Button>
                </Group>
                {result ? (
                  <Alert icon={<IconCircleCheck size={16} />} color="teal" variant="light">
                    <Stack gap={4}>
                      <Text size="sm" fw={600}>{t("creator.publish.editKeyWarning")}</Text>
                      <Text size="sm">{t("creator.publish.labelQuizId")}: {result.quizId}</Text>
                      <Text size="sm">{t("creator.publish.labelEditKey")}: {result.editKey}</Text>
                      <Text size="sm">{t("creator.publish.shareLink")}: {shareLink}</Text>
                    </Stack>
                  </Alert>
                ) : null}
                {qrDataUrl ? (
                  <Card withBorder radius="md" p="sm">
                    <Group gap="xs" mb="xs">
                      <IconQrcode size={16} />
                      <Text size="sm" fw={600}>{t("creator.publish.labelQrCode")}</Text>
                    </Group>
                    <Image src={qrDataUrl} alt="Quiz share QR code" radius="sm" fit="contain" h={220} />
                  </Card>
                ) : null}
              </Stack>
            </Card>
          </SimpleGrid>
        ) : null}

        <Group justify="space-between">
          <Button variant="default" onClick={previousStep} disabled={step === 1}>
            {t("common.back")}
          </Button>
          <Button onClick={nextStep} disabled={step === 5 || !canGoNext}>
            {t("common.next")}
          </Button>
        </Group>

        {error ? (
          <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
            {error}
          </Alert>
        ) : null}
      </Stack>
    </Paper>
  );
}
