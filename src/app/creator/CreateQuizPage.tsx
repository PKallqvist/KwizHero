import { Fragment, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { latLngBounds } from "leaflet";
import { Circle, CircleMarker, MapContainer, TileLayer, Tooltip as LeafletTooltip, useMap, useMapEvents } from "react-leaflet";
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
  SegmentedControl,
  SimpleGrid,
  Stack,
  Stepper,
  Text,
  TextInput,
  Textarea,
  Switch,
  Title,
} from "@mantine/core";
import { IconAlertCircle, IconCircleCheck, IconQrcode } from "@tabler/icons-react";
import { firebaseConfigError } from "../../platform/firebase/firebase";
import { createDraftQuiz, publishQuiz } from "../../platform/firebase/quizRepository";
import type { DraftQuestionInput, DraftWaypointInput, QuestionType, QuizDraftInput } from "../../domain/types";

const now = new Date();
const plusDays = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

type WizardStep = 1 | 2 | 3 | 4 | 5;

interface WaypointPickerProps {
  lat: number;
  lng: number;
  radius: number;
  onChange: (lat: number, lng: number) => void;
}

interface WaypointOverviewMapProps {
  waypoints: DraftWaypointInput[];
  selectedWaypointIndex: number;
  radius: number;
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

function FitWaypointsBounds(props: { waypoints: DraftWaypointInput[] }): null {
  const map = useMap();

  useEffect(() => {
    if (props.waypoints.length === 0) return;

    if (props.waypoints.length === 1) {
      const only = props.waypoints[0];
      map.setView([only.lat, only.lng], 14);
      return;
    }

    const bounds = latLngBounds(props.waypoints.map((waypoint) => [waypoint.lat, waypoint.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [28, 28] });
  }, [map, props.waypoints]);

  return null;
}

function WaypointOverviewMap(props: WaypointOverviewMapProps): JSX.Element {
  const fallbackCenter = props.waypoints[props.selectedWaypointIndex] ?? props.waypoints[0] ?? { lat: 57.7089, lng: 11.9746 };

  return (
    <MapContainer
      center={[fallbackCenter.lat, fallbackCenter.lng]}
      zoom={13}
      scrollWheelZoom
      style={{ height: 220, width: "100%", borderRadius: 12, border: "1px solid var(--mantine-color-gray-4)" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitWaypointsBounds waypoints={props.waypoints} />
      {props.waypoints.map((waypoint, index) => {
        const isSelected = index === props.selectedWaypointIndex;
        const zoneRadius = isSelected ? props.radius : Math.max(8, Math.round(props.radius * 0.55));

        return (
          <Fragment key={`waypoint-layer-${index}`}>
            <Circle
              center={[waypoint.lat, waypoint.lng]}
              radius={zoneRadius}
              pathOptions={{ color: isSelected ? "#0f6b5f" : "#74818f", fillOpacity: isSelected ? 0.2 : 0.1 }}
            />
            <CircleMarker
              center={[waypoint.lat, waypoint.lng]}
              radius={isSelected ? 8 : 6}
              pathOptions={{
                color: isSelected ? "#0f6b5f" : "#74818f",
                fillColor: isSelected ? "#0f6b5f" : "#adb5bd",
                fillOpacity: 1,
              }}
            >
              <LeafletTooltip permanent={isSelected} direction="top" offset={[0, -8]}>
                {`${index + 1}. ${waypoint.name}`}
              </LeafletTooltip>
            </CircleMarker>
          </Fragment>
        );
      })}
    </MapContainer>
  );
}

function createDefaultQuestion(questionType: QuestionType = "multiple_choice"): DraftQuestionInput {
  if (questionType === "numeric") {
    return {
      questionType,
      text: "",
      choices: [],
      correctIndex: null,
      numericAnswer: null,
      letterOrderAnswer: null,
      config: {
        timerSeconds: null,
        numericTolerance: null,
      },
    };
  }

  if (questionType === "letter_order") {
    return {
      questionType,
      text: "",
      choices: [],
      correctIndex: null,
      numericAnswer: null,
      letterOrderAnswer: "",
      config: {
        timerSeconds: null,
        numericTolerance: null,
      },
    };
  }

  return {
    questionType,
    text: "",
    choices: ["", "", "", ""],
    correctIndex: 0,
    numericAnswer: null,
    letterOrderAnswer: null,
    config: {
      timerSeconds: null,
      numericTolerance: null,
    },
  };
}

function createDefaultWaypoint(index: number): DraftWaypointInput {
  return {
    name: `Waypoint ${index + 1}`,
    lat: 57.7089,
    lng: 11.9746,
    questions: [createDefaultQuestion()],
  };
}

function getReadableError(error: unknown): string {
  const firebaseError = error as { code?: string; message?: string };
  if (firebaseError.code === "permission-denied") {
    return "Firestore denied the write. Deploy firestore.rules to your Firebase project and refresh.";
  }
  return firebaseError.message ?? "Something went wrong.";
}

function getQuestionValidationIssue(question: DraftQuestionInput): string | null {
  if (question.text.trim().length <= 5) return "question text is too short";

  if (question.questionType === "numeric") {
    return typeof question.numericAnswer === "number" ? null : "numeric answer is missing";
  }

  if (question.questionType === "letter_order") {
    return (question.letterOrderAnswer ?? "").trim().length > 1 ? null : "letter-order answer is too short";
  }

  if (question.choices.length < 2) return "at least two choices are required";
  if (!question.choices.every((choice) => choice.trim().length > 0)) return "one or more choices are empty";
  if (typeof question.correctIndex !== "number") return "correct option is missing";
  if (question.correctIndex < 0 || question.correctIndex >= question.choices.length) return "correct option is out of range";

  return null;
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
      questionTimeLimitSeconds: null,
      interQuestionTimeLimitSeconds: null,
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
  const [error, setError] = useState<string | null>(firebaseConfigError);
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

  function changeQuestionType(nextType: QuestionType): void {
    if (!currentQuestion) return;
    const base = createDefaultQuestion(nextType);
    updateCurrentQuestion({
      ...base,
      text: currentQuestion.text,
      config: {
        ...base.config,
        timerSeconds: currentQuestion.config.timerSeconds,
      },
    });
  }

  function updateChoice(index: number, value: string): void {
    if (!currentQuestion) return;
    const nextChoices = [...currentQuestion.choices];
    nextChoices[index] = value;
    updateCurrentQuestion({ ...currentQuestion, choices: nextChoices });
  }

  function addChoice(): void {
    if (!currentQuestion || currentQuestion.questionType !== "multiple_choice") return;
    updateCurrentQuestion({ ...currentQuestion, choices: [...currentQuestion.choices, ""] });
  }

  function removeChoice(index: number): void {
    if (!currentQuestion || currentQuestion.questionType !== "multiple_choice") return;
    if (currentQuestion.choices.length <= 2) return;
    const nextChoices = currentQuestion.choices.filter((_, i) => i !== index);
    let nextCorrect = currentQuestion.correctIndex;
    if (nextCorrect === index) nextCorrect = 0;
    if (typeof nextCorrect === "number" && nextCorrect > index) nextCorrect -= 1;
    updateCurrentQuestion({ ...currentQuestion, choices: nextChoices, correctIndex: nextCorrect });
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
    if (!currentWaypoint || currentWaypoint.questions.length === 0) return;
    const nextQuestions = currentWaypoint.questions.filter((_, i) => i !== selectedQuestionIndex);
    updateCurrentWaypoint({ ...currentWaypoint, questions: nextQuestions });
    setSelectedQuestionIndex(nextQuestions.length === 0 ? 0 : Math.max(0, selectedQuestionIndex - 1));
  }

  async function onCreate(): Promise<void> {
    setError(null);
    try {
      const created = await createDraftQuiz(input);
      setResult(created);
    } catch (e) {
      setError(getReadableError(e));
    }
  }

  async function onPublish(): Promise<void> {
    if (!result) return;
    setPublishing(true);
    setError(null);
    try {
      await publishQuiz(result.quizId, result.editKey);
    } catch (e) {
      setError(getReadableError(e));
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
  function isQuestionValid(question: DraftQuestionInput): boolean {
    return getQuestionValidationIssue(question) === null;
  }

  const totalQuestionCount = input.waypoints.reduce((sum, waypoint) => sum + waypoint.questions.length, 0);
  const hasQuestionData =
    totalQuestionCount > 0 &&
    input.waypoints.every((waypoint) => waypoint.questions.every((question) => isQuestionValid(question)));
  const waypointsWithoutQuestions = input.waypoints
    .map((waypoint, index) => ({ waypoint, index }))
    .filter(({ waypoint }) => waypoint.questions.length === 0);
  const questionIssues = input.waypoints.flatMap((waypoint, waypointIndex) =>
    waypoint.questions.flatMap((question, questionIndex) => {
      const issue = getQuestionValidationIssue(question);
      return issue
        ? [{
            waypointIndex,
            questionIndex,
            issue,
          }]
        : [];
    })
  );

  const canGoNext =
    (step === 1 && input.title.trim().length > 2) ||
    step === 2 ||
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
          <Stack gap="md">
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

            <Card withBorder radius="md">
              <Stack gap="sm">
                <Switch
                  label={t("creator.rules.labelQuestionTimerEnabled")}
                  checked={input.ruleset.questionTimeLimitSeconds !== null}
                  onChange={(event) =>
                    setInput({
                      ...input,
                      ruleset: {
                        ...input.ruleset,
                        questionTimeLimitSeconds: event.currentTarget.checked ? 30 : null,
                      },
                    })
                  }
                />
                {input.ruleset.questionTimeLimitSeconds !== null ? (
                  <NumberInput
                    label={t("creator.rules.labelQuestionTimer")}
                    min={5}
                    max={600}
                    value={input.ruleset.questionTimeLimitSeconds}
                    onChange={(value) =>
                      setInput({
                        ...input,
                        ruleset: {
                          ...input.ruleset,
                          questionTimeLimitSeconds: typeof value === "number" ? value : 30,
                        },
                      })
                    }
                  />
                ) : null}
              </Stack>
            </Card>

            <Card withBorder radius="md">
              <Stack gap="sm">
                <Switch
                  label={t("creator.rules.labelInterQuestionTimerEnabled")}
                  checked={input.ruleset.interQuestionTimeLimitSeconds !== null}
                  onChange={(event) =>
                    setInput({
                      ...input,
                      ruleset: {
                        ...input.ruleset,
                        interQuestionTimeLimitSeconds: event.currentTarget.checked ? 60 : null,
                      },
                    })
                  }
                />
                {input.ruleset.interQuestionTimeLimitSeconds !== null ? (
                  <NumberInput
                    label={t("creator.rules.labelInterQuestionTimer")}
                    min={5}
                    max={1800}
                    value={input.ruleset.interQuestionTimeLimitSeconds}
                    onChange={(value) =>
                      setInput({
                        ...input,
                        ruleset: {
                          ...input.ruleset,
                          interQuestionTimeLimitSeconds: typeof value === "number" ? value : 60,
                        },
                      })
                    }
                  />
                ) : null}
              </Stack>
            </Card>
          </Stack>
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
              <Stack gap="sm">
                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                  <Card withBorder radius="md" p="sm">
                    <Stack gap="xs">
                      <Text size="sm" fw={600}>{t("creator.route.labelWaypoint")}</Text>
                      <Group>
                        {input.waypoints.map((waypoint, index) => {
                          const questionCount = waypoint.questions.length;
                          const invalidCount = waypoint.questions.filter((question) => !isQuestionValid(question)).length;
                          const isActive = selectedWaypointIndex === index;
                          const color = questionCount === 0 ? "gray" : invalidCount > 0 ? "orange" : "teal";

                          return (
                            <Button
                              key={`waypoint-tab-${index}`}
                              variant={isActive ? "filled" : "light"}
                              color={color}
                              size="xs"
                              onClick={() => {
                                setSelectedWaypointIndex(index);
                                setSelectedQuestionIndex(0);
                              }}
                            >
                              {`${index + 1}. ${waypoint.name} (${questionCount})`}
                            </Button>
                          );
                        })}
                      </Group>
                      <Group>
                        <Badge>{t("creator.route.waypointCount", { count: input.waypoints.length })}</Badge>
                        <Badge variant="light">{currentWaypoint.name}</Badge>
                      </Group>
                    </Stack>
                  </Card>
                  <Card withBorder radius="md" p="sm">
                    <Stack gap="xs">
                      <Text size="sm" fw={600}>{t("creator.route.mapHint")}</Text>
                      <WaypointOverviewMap
                        waypoints={input.waypoints}
                        selectedWaypointIndex={selectedWaypointIndex}
                        radius={input.ruleset.waypointGateRadiusMeters}
                      />
                    </Stack>
                  </Card>
                </SimpleGrid>
                <Group>
                  {currentWaypoint.questions.length > 0 ? (
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
                  ) : null}
                  <Button variant="light" onClick={addQuestionToCurrentWaypoint}>
                    {t("creator.questions.addQuestion")}
                  </Button>
                  {currentWaypoint.questions.length > 0 ? (
                    <Button variant="light" color="red" onClick={removeCurrentQuestion}>
                      {t("creator.questions.removeQuestion")}
                    </Button>
                  ) : null}
                  <Badge>
                    {t("creator.questions.questionCount", { count: currentWaypoint.questions.length })}
                  </Badge>
                </Group>
              </Stack>
            ) : null}

            {currentQuestion ? (
              <Stack gap="md">
                <Stack gap="sm">
                  <Text size="sm" fw={500}>{t("creator.questions.labelType")}</Text>
                  <SegmentedControl
                    fullWidth
                    data={[
                      { value: "multiple_choice", label: `A/B/C` },
                      { value: "numeric", label: `123` },
                      { value: "letter_order", label: `ABC` },
                    ]}
                    value={currentQuestion.questionType}
                    onChange={(value) => changeQuestionType(value as QuestionType)}
                  />
                  <TextInput
                    label={t("creator.questions.labelText")}
                    value={currentQuestion.text}
                    onChange={(e) => updateCurrentQuestion({ ...currentQuestion, text: e.currentTarget.value })}
                  />
                </Stack>

                <Card withBorder radius="md" p="sm">
                  <Stack gap="sm">
                    <Switch
                      label={t("creator.questions.enableTimer")}
                      checked={currentQuestion.config.timerSeconds !== null}
                      onChange={(event) =>
                        updateCurrentQuestion({
                          ...currentQuestion,
                          config: {
                            ...currentQuestion.config,
                            timerSeconds: event.currentTarget.checked ? 30 : null,
                          },
                        })
                      }
                    />
                    {currentQuestion.config.timerSeconds !== null ? (
                      <NumberInput
                        label={t("creator.questions.labelTimerSeconds")}
                        min={5}
                        max={600}
                        value={currentQuestion.config.timerSeconds}
                        onChange={(value) =>
                          updateCurrentQuestion({
                            ...currentQuestion,
                            config: {
                              ...currentQuestion.config,
                              timerSeconds: typeof value === "number" ? value : 30,
                            },
                          })
                        }
                      />
                    ) : null}
                  </Stack>
                </Card>

                {currentQuestion.questionType === "multiple_choice" ? (
                  <Stack gap="sm">
                    <Text size="sm" fw={500}>{t("creator.questions.labelCorrect")}</Text>
                    <SegmentedControl
                      fullWidth
                      data={currentQuestion.choices.map((_, index) => ({
                        value: String(index),
                        label: String.fromCharCode(65 + index),
                      }))}
                      value={String(currentQuestion.correctIndex ?? 0)}
                      onChange={(value) =>
                        updateCurrentQuestion({
                          ...currentQuestion,
                          correctIndex: Number(value ?? "0"),
                        })
                      }
                    />
                    {currentQuestion.choices.map((choice, index) => (
                      <Group key={`choice-${index}`} align="end">
                        <TextInput
                          style={{ flex: 1 }}
                          label={t("creator.questions.choiceLabel", { label: String.fromCharCode(65 + index) })}
                          value={choice}
                          onChange={(e) => updateChoice(index, e.currentTarget.value)}
                        />
                        <Button
                          variant="light"
                          color="red"
                          onClick={() => removeChoice(index)}
                          disabled={currentQuestion.choices.length <= 2}
                        >
                          {t("creator.questions.removeChoice")}
                        </Button>
                      </Group>
                    ))}
                    <Group>
                      <Button variant="light" onClick={addChoice}>{t("creator.questions.addChoice")}</Button>
                      <Badge>{t("creator.questions.choiceCount", { count: currentQuestion.choices.length })}</Badge>
                    </Group>
                  </Stack>
                ) : null}

                {currentQuestion.questionType === "numeric" ? (
                  <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                    <NumberInput
                      label={t("creator.questions.numericAnswer")}
                      value={currentQuestion.numericAnswer ?? undefined}
                      onChange={(value) =>
                        updateCurrentQuestion({
                          ...currentQuestion,
                          numericAnswer: typeof value === "number" ? value : null,
                        })
                      }
                    />
                    <NumberInput
                      label={t("creator.questions.numericTolerance")}
                      min={0}
                      value={currentQuestion.config.numericTolerance ?? undefined}
                      onChange={(value) =>
                        updateCurrentQuestion({
                          ...currentQuestion,
                          config: {
                            ...currentQuestion.config,
                            numericTolerance: typeof value === "number" ? value : null,
                          },
                        })
                      }
                    />
                  </SimpleGrid>
                ) : null}

                {currentQuestion.questionType === "letter_order" ? (
                  <TextInput
                    label={t("creator.questions.letterOrderAnswer")}
                    value={currentQuestion.letterOrderAnswer ?? ""}
                    onChange={(e) =>
                      updateCurrentQuestion({
                        ...currentQuestion,
                        letterOrderAnswer: e.currentTarget.value,
                      })
                    }
                  />
                ) : null}
              </Stack>
            ) : null}

            {!hasQuestionData ? (
              <Alert color="yellow" variant="light" icon={<IconAlertCircle size={16} />}>
                <Stack gap={4}>
                  <Text size="sm" fw={600}>Next is disabled until question setup is complete.</Text>
                  {totalQuestionCount === 0 ? (
                    <Text size="sm">Add at least one question to continue.</Text>
                  ) : null}
                  {waypointsWithoutQuestions.length > 0 ? (
                    <Text size="sm">
                      {`${waypointsWithoutQuestions.length} waypoint(s) currently have no questions. This is allowed, but all existing questions must be valid.`}
                    </Text>
                  ) : null}
                  {questionIssues.length > 0 ? (
                    <List size="sm" spacing={2}>
                      {questionIssues.slice(0, 4).map((entry) => (
                        <List.Item key={`question-issue-${entry.waypointIndex}-${entry.questionIndex}`}>
                          {`Waypoint ${entry.waypointIndex + 1}, Question ${entry.questionIndex + 1}: ${entry.issue}.`}
                        </List.Item>
                      ))}
                    </List>
                  ) : null}
                </Stack>
              </Alert>
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
                  {input.ruleset.questionTimeLimitSeconds !== null
                    ? t("creator.publish.reviewTimer", { seconds: input.ruleset.questionTimeLimitSeconds })
                    : t("creator.publish.reviewTimerOff")}
                </List.Item>
                <List.Item>
                  {input.ruleset.interQuestionTimeLimitSeconds !== null
                    ? t("creator.publish.reviewBetweenTimer", {
                        seconds: input.ruleset.interQuestionTimeLimitSeconds,
                      })
                    : t("creator.publish.reviewBetweenTimerOff")}
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
                  <Button onClick={onCreate} disabled={Boolean(firebaseConfigError)}>
                    {t("creator.publish.createDraft")}
                  </Button>
                  <Button variant="light" onClick={onPublish} disabled={!result || Boolean(firebaseConfigError)} loading={publishing}>
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
