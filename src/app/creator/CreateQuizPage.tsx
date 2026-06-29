import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import QRCode from "qrcode";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Image,
  List,
  NumberInput,
  Paper,
  Select,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
  Switch,
  Title,
  VisuallyHidden,
} from "@mantine/core";
import { IconAlertCircle, IconCircleCheck, IconClock, IconMapPin, IconPlus, IconQrcode, IconSparkles, IconTrash, IconX } from "@tabler/icons-react";
import { useMediaQuery } from "@mantine/hooks";
import { kwizTokens } from "../../platform/theme/kwizTokens";
import { firebaseConfigError } from "../../platform/firebase/firebase";
import {
  buildPlayShareLink,
  checkAccessCodeAvailability,
  createDraftQuiz,
  generateAutoAccessCodePreview,
  getEditableQuizDraft,
  publishQuiz,
  setQuizCustomAccessCode,
  updateQuizDraft,
} from "../../platform/firebase/quizRepository";
import { distanceMeters, formatDistanceMeters, routeDistanceMeters } from "../../platform/map/geolocation";
import type { DraftQuestionInput, DraftWaypointInput, QuestionType, QuestionOrderMode, QuizDraftInput, RouteMode } from "../../domain/types";
import { CompactStepper } from "./components/CompactStepper";
import { WaypointPicker, buildAnchoredManualLegPoints } from "./components/WaypointMapEditor";
import { useAiGenerator } from "./components/AiGeneratorModals";

const now = new Date();
const plusDays = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

type WizardStep = 1 | 2 | 3 | 4 | 5;
type CreatorPreviewPhase = "back" | "pre_countdown" | "front";
type RoutePreviewMode = RouteMode;

const PREVIEW_PRE_REVEAL_SECONDS = 3;
const previewChoiceBorderColors = kwizTokens.previewChoiceBorders;

function previewChoiceCardStyle(index: number): CSSProperties {
  return {
    "--kwiz-choice-border": previewChoiceBorderColors[index % previewChoiceBorderColors.length],
  } as CSSProperties;
}

function createDefaultQuestion(questionType: QuestionType = "multiple_choice"): DraftQuestionInput {
  if (questionType === "numeric") {
    return {
      questionType,
      text: "",
      choices: [],
      correctChoiceIndexes: [],
      numericAnswer: null,
      letterOrderAnswer: null,
      funFact: undefined,
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
      correctChoiceIndexes: [],
      numericAnswer: null,
      letterOrderAnswer: "",
      funFact: undefined,
      config: {
        timerSeconds: null,
        numericTolerance: null,
      },
    };
  }

  return {
    questionType,
    text: "",
    choices: [],
    correctChoiceIndexes: [],
    numericAnswer: null,
    letterOrderAnswer: null,
    funFact: undefined,
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
  if (firebaseError.code === "functions/internal" || firebaseError.code === "internal") {
    return "Publish function failed internally. Deploy Cloud Functions (npx firebase-tools deploy --only functions) and try again.";
  }
  if (firebaseError.code === "functions/not-found" || firebaseError.code === "not-found") {
    return "Publish function was not found. Deploy Cloud Functions (npx firebase-tools deploy --only functions).";
  }
  if (firebaseError.code === "functions/unavailable" || firebaseError.code === "unavailable") {
    return "Publish function is unavailable. Check Firebase Functions deployment and retry.";
  }
  return firebaseError.message ?? "Something went wrong.";
}

function getQuestionValidationIssue(question: DraftQuestionInput): string | null {
  if (question.questionType === "numeric") {
    return typeof question.numericAnswer === "number" ? null : "numeric answer is missing";
  }

  if (question.questionType === "letter_order") {
    return (question.letterOrderAnswer ?? "").trim().length > 1 ? null : "letter-order answer is too short";
  }

  const nonEmptyChoiceCount = question.choices.filter((choice) => choice.trim().length > 0).length;
  if (nonEmptyChoiceCount < 1) return "at least one response is required";
  if (!question.choices.every((choice) => choice.trim().length > 0)) return "one or more responses are empty";
  if (question.correctChoiceIndexes.length === 0) return "mark at least one correct response";
  const hasOutOfRangeCorrect = question.correctChoiceIndexes.some(
    (index) => index < 0 || index >= question.choices.length
  );
  if (hasOutOfRangeCorrect) return "correct response selection is out of range";
  const hasEmptyCorrect = question.correctChoiceIndexes.some(
    (index) => (question.choices[index] ?? "").trim().length === 0
  );
  if (hasEmptyCorrect) return "correct response cannot be empty";

  return null;
}

export function CreateQuizPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const [searchParams] = useSearchParams();
  const editingQuizId = (searchParams.get("quizId") ?? "").trim();
  const isEditingExistingQuiz = editingQuizId.length > 0;
  const isTwoColumnRouteLayout = useMediaQuery("(min-width: 75em)");
  const isMobilePreviewLayout = useMediaQuery("(max-width: 48em)");
  const [step, setStep] = useState<WizardStep>(1);
  const [input, setInput] = useState<QuizDraftInput>({
    title: "",
    description: "",
    isPublic: true,
    accessCode: null,
    locale: "sv",
    organizerName: null,
    organizerAvatarUrl: null,
    organizerSwish: null,
    isAnonymous: false,
    waypoints: [createDefaultWaypoint(0)],
    ruleset: {
      openAt: now.toISOString(),
      closeAt: plusDays.toISOString(),
      questionTimeLimitSeconds: null,
      interQuestionTimeLimitSeconds: null,
      revealMode: "scheduled",
      revealAt: plusDays.toISOString(),
      waypointGateRadiusMeters: 40,
      requireSequentialWaypoints: true,
      routeMode: "crow",
      routeLegModes: [],
      routeLegCoordinates: [],
      questionOrderMode: "fixed",
      scoringStrategy: "binary_correct_1_point",
    },
  });
  const [selectedWaypointIndex, setSelectedWaypointIndex] = useState(0);
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0);
  const [result, setResult] = useState<{ quizId: string; editKey: string } | null>(null);
  const [editingQuizStatus, setEditingQuizStatus] = useState<"draft" | "published" | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [error, setError] = useState<string | null>(firebaseConfigError);
  const [loadingEditableQuiz, setLoadingEditableQuiz] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [customCodeEditorOpen, setCustomCodeEditorOpen] = useState(false);
  const [customCodeDraft, setCustomCodeDraft] = useState("");
  const [customCodeStatus, setCustomCodeStatus] = useState<"" | "checking" | "available" | "taken" | "invalid">("");
  const [customCodeSuggestion, setCustomCodeSuggestion] = useState("");
  const [savingCustomCode, setSavingCustomCode] = useState(false);
  const [choiceDraft, setChoiceDraft] = useState("");
  const [choiceDraftIsCorrect, setChoiceDraftIsCorrect] = useState(false);
  const [choiceDraftVisible, setChoiceDraftVisible] = useState(true);
  const [questionPreviewActive, setQuestionPreviewActive] = useState(false);
  const [previewPhase, setPreviewPhase] = useState<CreatorPreviewPhase>("front");
  const [previewCountdown, setPreviewCountdown] = useState<number | null>(null);
  const [previewEditing, setPreviewEditing] = useState(false);
  const [coordinatesOverlayOpen, setCoordinatesOverlayOpen] = useState(false);
  const [addMultipleWaypointsMode, setAddMultipleWaypointsMode] = useState(false);
  const [routeMapViewport, setRouteMapViewport] = useState<{ lat: number; lng: number; zoom: number } | null>(null);
  const [routeMapViewportUserControlled, setRouteMapViewportUserControlled] = useState(false);
  const geolocatedOnce = useRef(false);
  const [drawingLegIndex, setDrawingLegIndex] = useState<number | null>(null);
  const [drawingLegPoints, setDrawingLegPoints] = useState<Array<{ lat: number; lng: number }>>([]);
  const [manualDrawError, setManualDrawError] = useState<string | null>(null);
  const { openAiGenerator, renderModals: renderAiModals } = useAiGenerator({
    currentQuestionType: currentQuestion?.questionType,
    currentQuestionConfig: currentQuestion?.config,
    locale: input.locale,
    onApply: (question) => {
      if (!currentQuestion) return;
      updateCurrentQuestion({ ...currentQuestion, ...question });
    },
  });
  const choiceDraftInputRef = useRef<HTMLTextAreaElement | null>(null);
  const previewSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const previewEditorRef = useRef<HTMLDivElement | null>(null);
  const waypointNameInputRef = useRef<HTMLInputElement | null>(null);
  const focusWaypointNameAfterAddRef = useRef<number | null>(null);
  const pendingSelectNewestWaypointRef = useRef(false);
  const multipleChoiceStateCacheRef = useRef<Record<string, { choices: string[]; correctChoiceIndexes: number[] }>>({});

  const currentWaypoint = input.waypoints[selectedWaypointIndex] ?? null;
  const currentQuestion = currentWaypoint?.questions[selectedQuestionIndex] ?? null;

  const displayedAccessCode = input.isPublic ? "" : input.accessCode ?? "";
  const shareLink = useMemo(() => {
    if (!result) return "";
    const playValue = !input.isPublic && editingQuizStatus === "published" && displayedAccessCode ? displayedAccessCode : result.quizId;
    return buildPlayShareLink(playValue);
  }, [displayedAccessCode, editingQuizStatus, input.isPublic, result]);
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

  useEffect(() => {
    if (!isEditingExistingQuiz) return;

    let mounted = true;

    async function loadEditableQuiz(): Promise<void> {
      setError(null);
      setLoadingEditableQuiz(true);
      try {
        const editable = await getEditableQuizDraft(editingQuizId);
        if (!mounted) return;
        setEditingQuizStatus(editable.status);
        if (editable.status === "published") {
          setError(t("creator.publish.editNotAllowedPublished"));
          return;
        }
        setInput(editable.input);
        setSelectedWaypointIndex(0);
        setSelectedQuestionIndex(0);
        setResult((previous) => {
          if (previous?.quizId === editable.quizId) return previous;
          return { quizId: editable.quizId, editKey: "" };
        });
      } catch (e) {
        if (!mounted) return;
        setError(getReadableError(e));
      } finally {
        if (mounted) {
          setLoadingEditableQuiz(false);
        }
      }
    }

    loadEditableQuiz().catch(() => {
      if (!mounted) return;
      setLoadingEditableQuiz(false);
      setError("Failed to load quiz");
    });

    return () => {
      mounted = false;
    };
  }, [editingQuizId, isEditingExistingQuiz, t]);

  useEffect(() => {
    if (input.isPublic) {
      setCustomCodeEditorOpen(false);
      setCustomCodeDraft("");
      setCustomCodeStatus("");
      setCustomCodeSuggestion("");
      return;
    }

    if (!input.accessCode) {
      const nextCode = generateAutoAccessCodePreview();
      setInput((previous) => ({
        ...previous,
        accessCode: nextCode,
      }));
      setCustomCodeDraft(nextCode);
      return;
    }

    if (!customCodeEditorOpen) {
      setCustomCodeDraft(input.accessCode);
    }
  }, [customCodeEditorOpen, input.accessCode, input.isPublic]);

  useEffect(() => {
    if (!customCodeEditorOpen || input.isPublic) return;

    const trimmed = customCodeDraft.trim();
    if (trimmed.length === 0) {
      setCustomCodeStatus("");
      setCustomCodeSuggestion("");
      return;
    }

    if (!/^[A-Za-z0-9-]{4,20}$/.test(trimmed)) {
      setCustomCodeStatus("invalid");
      setCustomCodeSuggestion("");
      return;
    }

    setCustomCodeStatus("checking");
    const timeout = setTimeout(() => {
      checkAccessCodeAvailability(trimmed, result?.quizId)
        .then((availability) => {
          if (availability.available) {
            setCustomCodeStatus("available");
            setCustomCodeSuggestion("");
            return;
          }
          setCustomCodeStatus("taken");
          setCustomCodeSuggestion(availability.suggestion ?? "");
        })
        .catch(() => {
          // If live availability check fails (network/rules), keep format-valid state
          // so creators can still try saving and get a concrete backend error.
          setCustomCodeStatus("");
          setCustomCodeSuggestion("");
        });
    }, 300);

    return () => clearTimeout(timeout);
  }, [customCodeDraft, customCodeEditorOpen, input.isPublic, result?.quizId]);

  function setPrivateAccessCode(nextCode: string): void {
    setInput((previous) => ({
      ...previous,
      isPublic: false,
      accessCode: nextCode,
    }));
  }

  async function copyAccessCode(): Promise<void> {
    if (!displayedAccessCode) return;
    await navigator.clipboard.writeText(displayedAccessCode);
  }

  async function saveCustomAccessCode(): Promise<void> {
    const trimmed = customCodeDraft.trim();
    if (!trimmed || customCodeStatus === "invalid" || customCodeStatus === "checking") return;

    setSavingCustomCode(true);
    setError(null);
    try {
      if (result?.quizId) {
        await setQuizCustomAccessCode(result.quizId, trimmed);
      }
      setPrivateAccessCode(trimmed);
      setCustomCodeEditorOpen(false);
      setCustomCodeSuggestion("");
      setCustomCodeStatus("");
    } catch (e) {
      setError(getReadableError(e));
    } finally {
      setSavingCustomCode(false);
    }
  }

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

  function getCurrentQuestionCacheKey(): string {
    return `${selectedWaypointIndex}:${selectedQuestionIndex}`;
  }

  function persistChoiceDraft(options?: { keepDraftVisible?: boolean; refocus?: boolean }): void {
    if (!currentQuestion || currentQuestion.questionType !== "multiple_choice") return;

    const trimmed = choiceDraft.trim();
    if (trimmed.length === 0) {
      if (!options?.keepDraftVisible) {
        setChoiceDraftVisible(false);
      }
      setChoiceDraft("");
      setChoiceDraftIsCorrect(false);
      return;
    }

    const nextChoiceIndex = currentQuestion.choices.length;
    const nextCorrectIndexes = choiceDraftIsCorrect
      ? [...currentQuestion.correctChoiceIndexes, nextChoiceIndex]
      : [...currentQuestion.correctChoiceIndexes];
    updateCurrentQuestion({
      ...currentQuestion,
      choices: [...currentQuestion.choices, trimmed],
      correctChoiceIndexes: nextCorrectIndexes,
    });

    setChoiceDraft("");
    setChoiceDraftIsCorrect(false);
    setChoiceDraftVisible(Boolean(options?.keepDraftVisible ?? false));
    if (options?.refocus) {
      requestAnimationFrame(() => choiceDraftInputRef.current?.focus());
    }
  }

  function changeQuestionType(nextType: QuestionType): void {
    if (!currentQuestion) return;
    let questionForTypeSwitch: DraftQuestionInput = currentQuestion;
    if (currentQuestion.questionType === "multiple_choice") {
      const trimmedDraft = choiceDraft.trim();
      if (trimmedDraft.length > 0) {
        const nextChoiceIndex = currentQuestion.choices.length;
        questionForTypeSwitch = {
          ...currentQuestion,
          choices: [...currentQuestion.choices, trimmedDraft],
          correctChoiceIndexes: choiceDraftIsCorrect
            ? [...currentQuestion.correctChoiceIndexes, nextChoiceIndex]
            : [...currentQuestion.correctChoiceIndexes],
        };
      }
    }

    setChoiceDraft("");
    setChoiceDraftIsCorrect(false);
    setChoiceDraftVisible(false);

    const cacheKey = getCurrentQuestionCacheKey();
    if (questionForTypeSwitch.questionType === "multiple_choice") {
      multipleChoiceStateCacheRef.current[cacheKey] = {
        choices: [...questionForTypeSwitch.choices],
        correctChoiceIndexes: [...questionForTypeSwitch.correctChoiceIndexes],
      };
    }

    const cachedMultipleChoiceState = multipleChoiceStateCacheRef.current[cacheKey];
    updateCurrentQuestion({
      ...questionForTypeSwitch,
      questionType: nextType,
      ...(nextType === "multiple_choice" && cachedMultipleChoiceState
        ? {
            choices: [...cachedMultipleChoiceState.choices],
            correctChoiceIndexes: [...cachedMultipleChoiceState.correctChoiceIndexes],
          }
        : null),
    });
  }

  function updateChoice(index: number, value: string): void {
    if (!currentQuestion) return;
    const nextChoices = [...currentQuestion.choices];
    nextChoices[index] = value;
    updateCurrentQuestion({ ...currentQuestion, choices: nextChoices });
  }

  function appendChoiceFromDraft(): void {
    persistChoiceDraft({ keepDraftVisible: true, refocus: true });
  }

  function toggleCorrectChoice(index: number, checked: boolean): void {
    if (!currentQuestion || currentQuestion.questionType !== "multiple_choice") return;

    const deduped = [...new Set(currentQuestion.correctChoiceIndexes)];
    const nextCorrectIndexes = checked
      ? [...deduped, index].sort((a, b) => a - b)
      : deduped.filter((correctIndex) => correctIndex !== index);

    updateCurrentQuestion({ ...currentQuestion, correctChoiceIndexes: nextCorrectIndexes });
  }

  function removeChoice(index: number): void {
    if (!currentQuestion || currentQuestion.questionType !== "multiple_choice") return;

    const nextChoices = currentQuestion.choices.filter((_, i) => i !== index);
    const nextCorrectIndexes = currentQuestion.correctChoiceIndexes
      .filter((correctIndex) => correctIndex !== index)
      .map((correctIndex) => (correctIndex > index ? correctIndex - 1 : correctIndex));

    updateCurrentQuestion({
      ...currentQuestion,
      choices: nextChoices,
      correctChoiceIndexes: nextCorrectIndexes,
    });

    if (nextChoices.length === 0) {
      setChoiceDraftVisible(true);
    }
  }

  function handleChoiceBlur(index: number): void {
    if (!currentQuestion || currentQuestion.questionType !== "multiple_choice") return;
    if ((currentQuestion.choices[index] ?? "").trim().length > 0) return;
    removeChoice(index);
  }

  function addWaypointAt(lat?: number, lng?: number): void {
    persistChoiceDraft({ keepDraftVisible: false, refocus: false });
    setDrawingLegIndex(null);
    setDrawingLegPoints([]);
    setManualDrawError(null);
    setCoordinatesOverlayOpen(false);
    pendingSelectNewestWaypointRef.current = true;
    setInput((prev) => {
      const waypoint = createDefaultWaypoint(prev.waypoints.length);
      const waypoints = [
        ...prev.waypoints,
        {
          ...waypoint,
          lat: typeof lat === "number" ? lat : routeMapViewport?.lat ?? waypoint.lat,
          lng: typeof lng === "number" ? lng : routeMapViewport?.lng ?? waypoint.lng,
        },
      ];
      return { ...prev, waypoints };
    });
  }

  function addWaypoint(): void {
    addWaypointAt();
  }

  function fitRouteMapToScreen(): void {
    setRouteMapViewportUserControlled(false);
    setRouteMapViewport(null);
  }

  function handleRouteMapClick(lat: number, lng: number): void {
    if (addMultipleWaypointsMode) {
      addWaypointAt(lat, lng);
      return;
    }
    if (!currentWaypoint) return;
    updateCurrentWaypoint({ ...currentWaypoint, lat, lng });
  }

  function removeCurrentWaypoint(): void {
    if (input.waypoints.length <= 1) return;
    persistChoiceDraft({ keepDraftVisible: false, refocus: false });
    setDrawingLegIndex(null);
    setDrawingLegPoints([]);
    setManualDrawError(null);
    setCoordinatesOverlayOpen(false);
    const nextWaypoints = input.waypoints.filter((_, i) => i !== selectedWaypointIndex);
    setInput((prev) => ({ ...prev, waypoints: nextWaypoints }));
    setSelectedWaypointIndex(Math.max(0, selectedWaypointIndex - 1));
    setSelectedQuestionIndex(0);
  }

  async function onCreate(): Promise<void> {
    const hasRequiredIdentityData = input.title.trim().length > 2 && input.description.trim().length > 0;
    if (!hasRequiredIdentityData) {
      setStep(1);
      setError(t("creator.publish.errorIdentityRequired"));
      return;
    }

    setError(null);
    setSavingDraft(true);
    try {
      if (isEditingExistingQuiz) {
        if (editingQuizStatus === "published") {
          setError(t("creator.publish.editNotAllowedPublished"));
          return;
        }
        await updateQuizDraft(editingQuizId, input);
        setResult((previous) => ({
          quizId: editingQuizId,
          editKey: previous?.quizId === editingQuizId ? previous.editKey : "",
        }));
        return;
      }
      const created = await createDraftQuiz(input);
      setResult(created);
    } catch (e) {
      setError(getReadableError(e));
    } finally {
      setSavingDraft(false);
    }
  }

  async function onPublish(): Promise<void> {
    if (!result?.editKey) return;
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

  function setPreviewEditingFromFocus(): void {
    setPreviewEditing(true);
  }

  function clearPreviewEditingFromBlur(): void {
    requestAnimationFrame(() => {
      const activeElement = document.activeElement;
      setPreviewEditing(Boolean(previewEditorRef.current?.contains(activeElement)));
    });
  }

  const questionPositions = useMemo(
    () =>
      input.waypoints.flatMap((waypoint, waypointIndex) =>
        waypoint.questions.map((_, questionIndex) => ({ waypointIndex, questionIndex }))
      ),
    [input.waypoints]
  );
  const currentQuestionPositionIndex = questionPositions.findIndex(
    (position) =>
      position.waypointIndex === selectedWaypointIndex &&
      position.questionIndex === selectedQuestionIndex
  );
  const hasPreviousQuestion = currentQuestionPositionIndex > 0;
  const hasNextQuestion =
    currentQuestionPositionIndex >= 0 &&
    currentQuestionPositionIndex < questionPositions.length - 1;
  function goToPreviousQuestion(): void {
    if (!hasPreviousQuestion) return;
    persistChoiceDraft({ keepDraftVisible: false, refocus: false });
    const previous = questionPositions[currentQuestionPositionIndex - 1];
    if (!previous) return;
    setSelectedWaypointIndex(previous.waypointIndex);
    setSelectedQuestionIndex(previous.questionIndex);
  }

  function goToNextQuestion(): void {
    if (!hasNextQuestion) return;
    persistChoiceDraft({ keepDraftVisible: false, refocus: false });
    const next = questionPositions[currentQuestionPositionIndex + 1];
    if (!next) return;
    setSelectedWaypointIndex(next.waypointIndex);
    setSelectedQuestionIndex(next.questionIndex);
  }

  function selectWaypoint(index: number): void {
    persistChoiceDraft({ keepDraftVisible: false, refocus: false });
    setDrawingLegIndex(null);
    setDrawingLegPoints([]);
    setManualDrawError(null);
    setCoordinatesOverlayOpen(false);
    setSelectedWaypointIndex(index);
    setSelectedQuestionIndex(0);
    const wp = input.waypoints[index];
    if (wp && wp.questions.length === 0) {
      const waypoints = [...input.waypoints];
      waypoints[index] = { ...wp, questions: [createDefaultQuestion()] };
      setInput((prev) => ({ ...prev, waypoints }));
    }
  }

  function beginManualLegDrawing(legIndex: number): void {
    setCoordinatesOverlayOpen(false);
    setDrawingLegIndex(legIndex);
    setDrawingLegPoints([]);
    setManualDrawError(null);
  }

  const cancelManualLegDrawing = useCallback((): void => {
    setDrawingLegIndex(null);
    setDrawingLegPoints([]);
    setManualDrawError(null);
  }, []);

  const undoManualLegPoint = useCallback((): void => {
    setDrawingLegPoints((previous) => previous.slice(0, -1));
    setManualDrawError(null);
  }, []);

  function addManualLegPoint(lat: number, lng: number): void {
    if (drawingLegIndex === null) return;
    setDrawingLegPoints((previous) => [...previous, { lat, lng }]);
    setManualDrawError(null);
  }

  const finishManualLegDrawing = useCallback((): void => {
    if (drawingLegIndex === null) return;
    const fromWaypoint = input.waypoints[drawingLegIndex];
    const toWaypoint = input.waypoints[drawingLegIndex + 1];
    if (!fromWaypoint || !toWaypoint) {
      cancelManualLegDrawing();
      return;
    }
    if (drawingLegPoints.length === 0) {
      setManualDrawError(t("creator.route.manualDrawRequiresPoint"));
      return;
    }

    const nextLegCoordinates = [...input.ruleset.routeLegCoordinates];
    nextLegCoordinates[drawingLegIndex] = [
      { lat: fromWaypoint.lat, lng: fromWaypoint.lng },
      ...drawingLegPoints,
      { lat: toWaypoint.lat, lng: toWaypoint.lng },
    ];
    setInput({
      ...input,
      ruleset: {
        ...input.ruleset,
        routeLegCoordinates: nextLegCoordinates,
      },
    });
    cancelManualLegDrawing();
  }, [cancelManualLegDrawing, drawingLegIndex, drawingLegPoints, input, t]);

  function onPreviewPointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    previewSwipeStartRef.current = { x: event.clientX, y: event.clientY };
  }

  function onPreviewPointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    if (questionPreviewActive) return;
    if (previewEditing) return;
    const start = previewSwipeStartRef.current;
    previewSwipeStartRef.current = null;
    if (!start) return;

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) < 60 || Math.abs(deltaY) > 40) return;

    if (deltaX < 0) {
      goToNextQuestion();
      return;
    }
    goToPreviousQuestion();
  }

  useEffect(() => {
    if (!currentQuestion || currentQuestion.questionType !== "multiple_choice") {
      setChoiceDraft("");
      setChoiceDraftIsCorrect(false);
      setChoiceDraftVisible(false);
      return;
    }

    setChoiceDraft("");
    setChoiceDraftIsCorrect(false);
    setChoiceDraftVisible(currentQuestion.choices.length === 0);
  }, [currentQuestion, selectedWaypointIndex, selectedQuestionIndex]);

  useEffect(() => {
    if (!pendingSelectNewestWaypointRef.current) return;
    const newestWaypointIndex = input.waypoints.length - 1;
    if (newestWaypointIndex < 0) return;
    pendingSelectNewestWaypointRef.current = false;
    focusWaypointNameAfterAddRef.current = newestWaypointIndex;
    setSelectedWaypointIndex(newestWaypointIndex);
    setSelectedQuestionIndex(0);
  }, [input.waypoints.length]);

  useEffect(() => {
    if (!currentWaypoint) return;

    if (selectedQuestionIndex >= currentWaypoint.questions.length) {
      setSelectedQuestionIndex(Math.max(0, currentWaypoint.questions.length - 1));
    }

    setDragQuestionIndex(null);
    setDragOverQuestionIndex(null);
    setMoveMode(false);
    setMoveModePulse(false);
    setFocusedQuestionIndex(null);
  }, [currentWaypoint, selectedWaypointIndex, selectedQuestionIndex]);

  useEffect(() => {
    const focusTargetIndex = focusWaypointNameAfterAddRef.current;
    if (focusTargetIndex === null || selectedWaypointIndex !== focusTargetIndex || !currentWaypoint) return;
    focusWaypointNameAfterAddRef.current = null;
    requestAnimationFrame(() => {
      waypointNameInputRef.current?.focus();
      waypointNameInputRef.current?.select();
    });
  }, [currentWaypoint, selectedWaypointIndex]);

  useEffect(() => {
    if (drawingLegIndex === null) return;
    if (step !== 3 || drawingLegIndex >= input.waypoints.length - 1) {
      cancelManualLegDrawing();
    }
  }, [cancelManualLegDrawing, drawingLegIndex, input.waypoints.length, step]);

  useEffect(() => {
    if (drawingLegIndex === null || step !== 3) return;

    function onKeyDown(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      const isTypingInField =
        Boolean(target?.isContentEditable) ||
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select";
      if (isTypingInField) return;

      if (event.key === "Escape") {
        event.preventDefault();
        cancelManualLegDrawing();
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        finishManualLegDrawing();
        return;
      }

      if (event.key === "Backspace") {
        event.preventDefault();
        undoManualLegPoint();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [cancelManualLegDrawing, drawingLegIndex, finishManualLegDrawing, step, drawingLegPoints.length, input.waypoints.length, undoManualLegPoint]);

  useEffect(() => {
    if (step !== 3 || geolocatedOnce.current || isEditingExistingQuiz) return;
    geolocatedOnce.current = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setRouteMapViewport({ lat, lng, zoom: 15 });
        setInput((prev) => {
          const first = prev.waypoints[0];
          if (!first || (first.lat !== 0 && first.lng !== 0)) return prev;
          const waypoints = [...prev.waypoints];
          waypoints[0] = { ...first, lat, lng };
          return { ...prev, waypoints };
        });
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, [step, isEditingExistingQuiz]);

  const hasWaypointData =
    input.waypoints.length > 0 && input.waypoints.every((w) => w.name.trim().length > 0);
  function isQuestionValid(question: DraftQuestionInput): boolean {
    return getQuestionValidationIssue(question) === null;
  }

  const totalQuestionCount = input.waypoints.reduce((sum, waypoint) => sum + waypoint.questions.length, 0);
  const hasQuestionData =
    totalQuestionCount > 0 &&
    input.waypoints.every((waypoint) => waypoint.questions.every((question) => isQuestionValid(question)));
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
  const currentQuestionForValidation =
    currentQuestion && currentQuestion.questionType === "multiple_choice" && choiceDraft.trim().length > 0
      ? {
          ...currentQuestion,
          choices: [...currentQuestion.choices, choiceDraft.trim()],
          correctChoiceIndexes: choiceDraftIsCorrect
            ? [...currentQuestion.correctChoiceIndexes, currentQuestion.choices.length]
            : [...currentQuestion.correctChoiceIndexes],
        }
      : currentQuestion;
  const currentQuestionIssue = currentQuestionForValidation
    ? getQuestionValidationIssue(currentQuestionForValidation)
    : null;

  const canGoNext =
    (step === 1 && input.title.trim().length > 2 && input.description.trim().length > 0) ||
    step === 2 ||
    (step === 3 && hasWaypointData) ||
    (step === 4 && hasQuestionData) ||
    step === 5;
  const canPublishCurrentQuiz = Boolean(result?.editKey) && editingQuizStatus !== "published";
  const effectivePreviewTimerSeconds =
    currentQuestion?.config.timerSeconds ?? input.ruleset.questionTimeLimitSeconds ?? null;

  const routeMapHeightClassName = coordinatesOverlayOpen
    ? isTwoColumnRouteLayout
      ? "kwiz-map-picker-two-col-expanded"
      : "kwiz-map-picker-single-col-expanded"
    : isTwoColumnRouteLayout
      ? "kwiz-map-picker-two-col"
      : "kwiz-map-picker-single-col";
  const defaultRouteMode = input.ruleset.routeMode ?? "crow";
  const routeModeOptions: Array<{ value: RoutePreviewMode; label: string }> = [
    { value: "none", label: t("creator.route.routeModeNone") },
    { value: "crow", label: t("creator.route.routeModeCrow") },
    { value: "urban", label: t("creator.route.routeModeUrban") },
    { value: "hiking", label: t("creator.route.routeModeHiking") },
    { value: "manual", label: t("creator.route.routeModeManual") },
  ];

  function setLegRouteMode(legIndex: number, mode: RoutePreviewMode): void {
    const nextLegModes = [...input.ruleset.routeLegModes];
    nextLegModes[legIndex] = mode;
    const nextLegCoordinates = [...input.ruleset.routeLegCoordinates];
    if (mode !== "manual") {
      nextLegCoordinates[legIndex] = [];
      if (drawingLegIndex === legIndex) {
        cancelManualLegDrawing();
      }
    }
    setInput({
      ...input,
      ruleset: {
        ...input.ruleset,
        routeLegModes: nextLegModes,
        routeLegCoordinates: nextLegCoordinates,
      },
    });
  }

  function enterQuestionPreview(): void {
    persistChoiceDraft({ keepDraftVisible: false, refocus: false });
    setPreviewEditing(false);
    setQuestionPreviewActive(true);
    setPreviewPhase("back");
    setPreviewCountdown(null);
  }

  function exitQuestionPreview(): void {
    setQuestionPreviewActive(false);
    setPreviewPhase("front");
    setPreviewCountdown(null);
  }

  function revealPreviewCard(): void {
    if (!questionPreviewActive) return;
    if (previewPhase === "pre_countdown") return;
    if (effectivePreviewTimerSeconds !== null) {
      setPreviewPhase("pre_countdown");
      setPreviewCountdown(PREVIEW_PRE_REVEAL_SECONDS);
      return;
    }
    setPreviewPhase("front");
  }

  function renderQuestionPreviewInput(): JSX.Element {
    if (!currentQuestion) return <></>;

    if (currentQuestion.questionType === "numeric") {
      return (
        <Paper withBorder radius="md" p="sm">
          <Text c="dimmed">{t("player.numericAnswer")}</Text>
        </Paper>
      );
    }

    if (currentQuestion.questionType === "letter_order") {
      return (
        <Paper withBorder radius="md" p="sm">
          <Text c="dimmed">{t("player.letterOrderAnswer")}</Text>
        </Paper>
      );
    }

    if (currentQuestion.choices.length === 0) {
      return (
        <Paper withBorder radius="md" p="sm">
          <Text c="dimmed">{t("creator.questions.addChoice")}</Text>
        </Paper>
      );
    }

    return (
      <Stack gap="xs">
        {currentQuestion.choices.map((choice, index) => (
          <Group key={`preview-sim-choice-${index}`} wrap="nowrap" align="flex-start">
            <div className="kwiz-preview-choice-dot" aria-hidden="true" />
            <Text>{choice}</Text>
          </Group>
        ))}
      </Stack>
    );
  }

  useEffect(() => {
    if (!questionPreviewActive) return;
    setPreviewPhase("back");
    setPreviewCountdown(null);
  }, [questionPreviewActive, selectedWaypointIndex, selectedQuestionIndex]);

  useEffect(() => {
    if (previewPhase !== "pre_countdown" || previewCountdown === null) return;

    if (previewCountdown <= 0) {
      setPreviewPhase("front");
      setPreviewCountdown(null);
      return;
    }

    const timeout = setTimeout(() => {
      setPreviewCountdown((previous) => (previous === null ? null : previous - 1));
    }, 1000);

    return () => clearTimeout(timeout);
  }, [previewCountdown, previewPhase]);

  useEffect(() => {
    if (step !== 4 && questionPreviewActive) {
      exitQuestionPreview();
    }
  }, [questionPreviewActive, step]);

  const routeLegs = useMemo(() => {
    if (input.waypoints.length < 2) return [];

    const speedMetersPerSecondByMode: Record<RoutePreviewMode, number> = {
      none: 1,
      crow: 1.35,
      urban: 1.25,
      hiking: 1.05,
      manual: 1.2,
    };

    return input.waypoints.slice(0, -1).map((waypoint, index) => {
      const next = input.waypoints[index + 1];
      const mode = input.ruleset.routeLegModes[index] ?? defaultRouteMode;
      const manualLegPoints = input.ruleset.routeLegCoordinates[index] ?? [];
      const anchoredManualLegPoints = buildAnchoredManualLegPoints(
        { lat: waypoint.lat, lng: waypoint.lng },
        { lat: next.lat, lng: next.lng },
        manualLegPoints
      );
      const meters =
        mode === "manual" && manualLegPoints.length >= 2
          ? routeDistanceMeters(anchoredManualLegPoints)
          : distanceMeters(
              { lat: waypoint.lat, lng: waypoint.lng },
              { lat: next.lat, lng: next.lng }
            );
      const effectiveMeters = mode === "none" ? 0 : meters;
      const estimatedSeconds = Math.round(effectiveMeters / speedMetersPerSecondByMode[mode]);

      return {
        fromIndex: index,
        toIndex: index + 1,
        mode,
        meters: effectiveMeters,
        estimatedSeconds,
      };
    });
  }, [defaultRouteMode, input.waypoints, input.ruleset.routeLegModes, input.ruleset.routeLegCoordinates]);
  const routeDistance = useMemo(
    () => routeLegs.reduce((sum, leg) => sum + leg.meters, 0),
    [routeLegs]
  );
  const routeTotalEstimatedSeconds = useMemo(
    () => routeLegs.reduce((sum, leg) => sum + leg.estimatedSeconds, 0),
    [routeLegs]
  );

  return (
    <div className="kwiz-create-root">
      <Stack gap="md">
        <VisuallyHidden aria-live="polite">{reorderAnnouncement}</VisuallyHidden>
        <Title order={2}>{t("creator.title")}</Title>
        <Text c="dimmed">{t("creator.step", { current: step, total: 5 })}: {[
          t("creator.steps.identity"),
          t("creator.steps.rules"),
          t("creator.steps.route"),
          t("creator.steps.questions"),
          t("creator.steps.publish"),
        ][step - 1]}</Text>
        {isEditingExistingQuiz ? (
          <Alert icon={<IconAlertCircle size={16} />} color="blue" variant="light">
            <Stack gap={4}>
              <Text size="sm" fw={600}>{t("creator.publish.editingBannerTitle")}</Text>
              <Text size="sm">{t("creator.publish.editingBannerBody", { quizId: editingQuizId })}</Text>
              {editingQuizStatus === "published" ? (
                <Text size="sm" c="red">{t("creator.publish.editNotAllowedPublished")}</Text>
              ) : null}
              <Group>
                <Button component={Link} to="/my-quizzes" variant="subtle" size="xs">
                  {t("creator.publish.backToMyQuizzes")}
                </Button>
              </Group>
            </Stack>
          </Alert>
        ) : null}

        <CompactStepper
          step={step}
          labels={[
            t("creator.steps.identity"),
            t("creator.steps.rules"),
            t("creator.steps.route"),
            t("creator.steps.questions"),
            t("creator.steps.publish"),
          ]}
          onStepClick={(n) => {
            if (n < step || isEditingExistingQuiz) setStep(n as WizardStep);
          }}
        />

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
            <Switch
              label={t("creator.identity.labelPublicQuiz")}
              checked={input.isPublic}
              onChange={(event) => {
                const isPublic = event.currentTarget.checked;
                setInput({
                  ...input,
                  isPublic,
                  accessCode: isPublic ? null : input.accessCode ?? generateAutoAccessCodePreview(),
                });
                if (isPublic) {
                  setCustomCodeEditorOpen(false);
                  setCustomCodeDraft("");
                  setCustomCodeStatus("");
                  setCustomCodeSuggestion("");
                }
              }}
            />
            <Switch
              label={t("creator.identity.labelAnonymousOrganizer")}
              checked={input.isAnonymous}
              onChange={(event) => setInput({
                ...input,
                isAnonymous: event.currentTarget.checked,
                organizerName: event.currentTarget.checked ? null : input.organizerName,
                organizerAvatarUrl: event.currentTarget.checked ? null : input.organizerAvatarUrl,
              })}
            />
            {!input.isAnonymous ? (
              <TextInput
                label={t("creator.identity.labelOrganizerName")}
                value={input.organizerName ?? ""}
                onChange={(e) => setInput({
                  ...input,
                  organizerName: e.currentTarget.value.trim().length > 0 ? e.currentTarget.value : null,
                })}
              />
            ) : null}
            {!input.isAnonymous ? (
              <TextInput
                label={t("creator.identity.labelOrganizerAvatarUrl")}
                placeholder="https://..."
                value={input.organizerAvatarUrl ?? ""}
                onChange={(e) => setInput({
                  ...input,
                  organizerAvatarUrl: e.currentTarget.value.trim().length > 0 ? e.currentTarget.value : null,
                })}
              />
            ) : null}

            {!input.isPublic ? (
              <Card withBorder radius="md" className="kwiz-creator-access-code-card">
                <Stack gap="sm">
                  <Group justify="space-between" align="flex-start" wrap="wrap">
                    <Stack gap={2}>
                      <Text fw={600}>{t("creator.identity.accessCodeTitle")}</Text>
                      <Text size="sm" c="dimmed">
                        {t("creator.identity.accessCodeHelp")}
                      </Text>
                    </Stack>
                    <Badge variant="light" color="grape">
                      {t("creator.identity.accessCodePrivateBadge")}
                    </Badge>
                  </Group>

                  <Paper withBorder radius="md" p="sm">
                    <Group justify="space-between" align="center" wrap="wrap">
                      <Stack gap={0}>
                        <Text size="xs" c="dimmed">
                          {t("creator.identity.accessCodeCurrent")}
                        </Text>
                        <Text fw={700}>{displayedAccessCode || "-"}</Text>
                      </Stack>
                      <Group gap="xs" wrap="wrap">
                        <Button variant="light" size="xs" onClick={() => void copyAccessCode()} disabled={!displayedAccessCode}>
                          {t("creator.identity.copyCode")}
                        </Button>
                        <Button
                          variant="light"
                          size="xs"
                          onClick={() => {
                            const nextCode = generateAutoAccessCodePreview();
                            setPrivateAccessCode(nextCode);
                            setCustomCodeDraft(nextCode);
                            setCustomCodeEditorOpen(true);
                            setCustomCodeStatus("");
                            setCustomCodeSuggestion("");
                          }}
                        >
                          {t("creator.identity.generateNewCode")}
                        </Button>
                        <Button
                          variant="light"
                          size="xs"
                          onClick={() => {
                            setCustomCodeEditorOpen((current) => !current);
                            setCustomCodeDraft(displayedAccessCode);
                          }}
                        >
                          {customCodeEditorOpen ? t("common.cancel") : t("creator.identity.customizeCode")}
                        </Button>
                      </Group>
                    </Group>
                  </Paper>

                  {customCodeEditorOpen ? (
                    <Card withBorder radius="md" p="sm">
                      <Stack gap="sm">
                        <TextInput
                          label={t("creator.identity.customCodeLabel")}
                          value={customCodeDraft}
                          onChange={(event) => setCustomCodeDraft(event.currentTarget.value)}
                          description={t("creator.identity.customCodeHelp")}
                        />
                        {customCodeStatus === "invalid" ? (
                          <Alert color="yellow" variant="light">
                            {t("creator.identity.customCodeInvalid")}
                          </Alert>
                        ) : null}
                        {customCodeStatus === "taken" ? (
                          <Alert color="orange" variant="light">
                            <Stack gap={4}>
                              <Text size="sm">{t("creator.identity.customCodeTaken")}</Text>
                              {customCodeSuggestion ? (
                                <Button
                                  variant="subtle"
                                  size="xs"
                                  onClick={() => setCustomCodeDraft(customCodeSuggestion)}
                                >
                                  {t("creator.identity.customCodeUseSuggestion", { code: customCodeSuggestion })}
                                </Button>
                              ) : null}
                            </Stack>
                          </Alert>
                        ) : null}
                        <Group justify="flex-end">
                          <Button variant="default" size="xs" onClick={() => setCustomCodeEditorOpen(false)}>
                            {t("common.cancel")}
                          </Button>
                          <Button
                            size="xs"
                            onClick={() => void saveCustomAccessCode()}
                            loading={savingCustomCode}
                            disabled={customCodeStatus === "invalid" || customCodeStatus === "checking"}
                          >
                            {t("creator.identity.saveCustomCode")}
                          </Button>
                        </Group>
                      </Stack>
                    </Card>
                  ) : null}
                </Stack>
              </Card>
            ) : null}
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
              <Switch
                label={t("creator.rules.labelWaypointOrderRequired")}
                checked={input.ruleset.requireSequentialWaypoints}
                onChange={(event) =>
                  setInput({
                    ...input,
                    ruleset: {
                      ...input.ruleset,
                      requireSequentialWaypoints: event.currentTarget.checked,
                    },
                  })
                }
              />
              <Select
                label={t("creator.rules.labelDefaultRouteMode")}
                data={routeModeOptions}
                value={defaultRouteMode}
                onChange={(value) =>
                  setInput({
                    ...input,
                    ruleset: {
                      ...input.ruleset,
                      routeMode: (value ?? "crow") as RouteMode,
                    },
                  })
                }
              />
              <Select
                label={t("creator.rules.labelQuestionOrderMode")}
                data={[
                  { value: "fixed", label: t("creator.rules.questionOrderFixed") },
                  { value: "any", label: t("creator.rules.questionOrderAny") },
                ]}
                value={input.ruleset.questionOrderMode}
                onChange={(value) =>
                  setInput({
                    ...input,
                    ruleset: {
                      ...input.ruleset,
                      questionOrderMode: (value ?? "fixed") as QuestionOrderMode,
                    },
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

        {step === 3 || step === 4 ? (
          <Stack gap="md">
            <Group
              justify="space-between"
              align="center"
              wrap="nowrap"
              className={isMobilePreviewLayout ? "kwiz-creator-mobile-waypoint-nav" : undefined}
            >
              <Group
                wrap={isMobilePreviewLayout ? "nowrap" : "wrap"}
                gap={6}
                className={`kwiz-creator-waypoint-row${isMobilePreviewLayout ? " kwiz-creator-waypoint-row-scroll" : ""}`}
              >
                {input.waypoints.map((waypoint, index) => {
                  const questionCount = waypoint.questions.length;
                  const invalidCount = waypoint.questions.filter((question) => !isQuestionValid(question)).length;
                  const isActive = selectedWaypointIndex === index;
                  const color = questionCount === 0 ? "gray" : invalidCount > 0 ? "orange" : "teal";

                  return (
                    <button
                      key={`waypoint-dot-${index}`}
                      type="button"
                      className={`kwiz-waypoint-dot${isActive ? " is-active" : ""}`}
                      data-color={color}
                      onClick={() => selectWaypoint(index)}
                      title={`${waypoint.name} (${questionCount})`}
                    >
                      {index + 1}
                    </button>
                  );
                })}
              </Group>
              <Badge>{t("creator.route.waypointCount", { count: input.waypoints.length })}</Badge>
            </Group>

            {step === 3 && routeDistance > 0 ? (
              <Text size="sm" c="dimmed">
                {t("creator.route.routeDistance", { distance: formatDistanceMeters(routeDistance) })}
              </Text>
            ) : null}

          <SimpleGrid cols={coordinatesOverlayOpen ? { base: 1, lg: 1 } : { base: 1, lg: 2 }} spacing="md">
            {step === 3 ? (
            <Stack gap="md">

              {currentWaypoint ? (
                <Stack gap="xs">
                  <Stack gap="xs">
                    <Group justify="space-between" align="end" wrap="nowrap">
                      <TextInput
                        label={t("creator.route.labelName")}
                        className="kwiz-creator-flex-1"
                        ref={waypointNameInputRef}
                        value={currentWaypoint.name}
                        onChange={(e) => updateCurrentWaypoint({ ...currentWaypoint, name: e.currentTarget.value })}
                      />
                      <Group gap="xs" wrap="nowrap" pb={1}>
                        <ActionIcon
                          variant="light"
                          color="gray"
                          size="lg"
                          onClick={() => setCoordinatesOverlayOpen((prev) => !prev)}
                          aria-label={t("creator.route.editCoordinates")}
                          title={t("creator.route.editCoordinates")}
                        >
                          <IconMapPin size={16} />
                        </ActionIcon>
                        <ActionIcon
                          variant="light"
                          color="teal"
                          size="lg"
                          onClick={addWaypoint}
                          aria-label={t("creator.route.addWaypoint")}
                          title={t("creator.route.addWaypoint")}
                        >
                          <IconPlus size={16} />
                        </ActionIcon>
                        <ActionIcon
                          variant={addMultipleWaypointsMode ? "filled" : "light"}
                          color={addMultipleWaypointsMode ? "orange" : "gray"}
                          size="lg"
                          onClick={() => setAddMultipleWaypointsMode((prev) => !prev)}
                          aria-label={t(
                            addMultipleWaypointsMode
                              ? "creator.route.stopAddingMultipleWaypoints"
                              : "creator.route.addMultipleWaypoints"
                          )}
                          title={t(
                            addMultipleWaypointsMode
                              ? "creator.route.stopAddingMultipleWaypoints"
                              : "creator.route.addMultipleWaypoints"
                          )}
                        >
                          <Text size="xs" fw={700}>++</Text>
                        </ActionIcon>
                        <ActionIcon
                          variant="light"
                          color="red"
                          size="lg"
                          onClick={removeCurrentWaypoint}
                          disabled={input.waypoints.length <= 1}
                          aria-label={t("creator.route.removeWaypoint")}
                          title={t("creator.route.removeWaypoint")}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                    </Group>
                  </Stack>
                </Stack>
              ) : null}

              {currentWaypoint ? (
                <Card withBorder radius="md" p="sm">
                  <Stack gap="xs" className="kwiz-creator-map-shell">
                    <Group justify="space-between" align="center" wrap="wrap" gap="xs">
                      <Text size="sm" fw={600}>{t("creator.route.mapHint")}</Text>
                      <Button size="xs" variant="light" onClick={fitRouteMapToScreen}>
                        {t("creator.route.fitScreen")}
                      </Button>
                    </Group>
                    {addMultipleWaypointsMode ? (
                      <Badge color="orange" variant="light" className="kwiz-align-self-start">
                        {t("creator.route.addMultipleWaypointsActive")}
                      </Badge>
                    ) : null}
                    {coordinatesOverlayOpen ? (
                      <Paper
                        withBorder
                        radius="md"
                        p="sm"
                        className="kwiz-creator-coordinates-overlay"
                      >
                        <Stack gap="xs">
                          <Group justify="space-between" align="center" wrap="nowrap" gap="xs">
                            <Text size="xs" fw={700}>{t("creator.route.editCoordinates")}</Text>
                            <ActionIcon
                              variant="subtle"
                              color="gray"
                              size="sm"
                              onClick={() => setCoordinatesOverlayOpen(false)}
                              aria-label={t("creator.route.editCoordinates")}
                            >
                              <IconX size={14} />
                            </ActionIcon>
                          </Group>
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
                        </Stack>
                      </Paper>
                    ) : null}
                    <WaypointPicker
                      waypoints={input.waypoints}
                      selectedWaypointIndex={selectedWaypointIndex}
                      radius={input.ruleset.waypointGateRadiusMeters}
                      orderedRoute={input.ruleset.requireSequentialWaypoints && routeLegs.some((leg) => leg.mode !== "none")}
                      legModes={routeLegs.map((leg) => leg.mode)}
                      legCoordinates={input.ruleset.routeLegCoordinates}
                      drawingLegIndex={drawingLegIndex}
                      drawingLegPoints={drawingLegPoints}
                      mapHeightClassName={routeMapHeightClassName}
                      viewport={routeMapViewport}
                      userViewportControlled={routeMapViewportUserControlled}
                      onViewportChange={setRouteMapViewport}
                      onUserViewportControl={() => setRouteMapViewportUserControlled(true)}
                      onChange={handleRouteMapClick}
                      onDrawPointAdd={addManualLegPoint}
                    />
                  </Stack>
                </Card>
              ) : null}
            </Stack>
            ) : null}

            {step === 4 ? (
            <Stack gap="md">
              {currentQuestion ? (
                <>
                  <Card
                    withBorder={!isMobilePreviewLayout}
                    radius={isMobilePreviewLayout ? "sm" : "md"}
                    p={isMobilePreviewLayout ? 0 : "sm"}
                    className={isMobilePreviewLayout ? "kwiz-creator-mobile-preview-shell" : undefined}
                  >
                    <Stack gap="sm">
                      <Group justify="space-between" align="center" wrap="nowrap">
                        <Text size="sm" fw={600}>{currentWaypoint.name}</Text>
                        {questionPreviewActive ? (
                          <Button size="compact-xs" variant="light" color="gray" onClick={exitQuestionPreview}>
                            {t("creator.questions.previewExit")}
                          </Button>
                        ) : (
                          <Button
                            size="compact-xs"
                            variant="light"
                            color="teal"
                            onClick={enterQuestionPreview}
                            disabled={!currentQuestion}
                          >
                            {t("creator.questions.previewStart")}
                          </Button>
                        )}
                      </Group>

                        <Card
                          withBorder={!isMobilePreviewLayout}
                          radius={isMobilePreviewLayout ? "sm" : "lg"}
                          p={isMobilePreviewLayout ? "sm" : "md"}
                          className={`kwiz-creator-preview-frame${isMobilePreviewLayout ? " kwiz-creator-preview-frame-mobile" : ""}${previewEditing ? " kwiz-touch-auto" : " kwiz-touch-pan-y"}`}
                          onPointerDown={onPreviewPointerDown}
                          onPointerUp={onPreviewPointerUp}
                        >
                          <div ref={previewEditorRef}>
                            <Stack gap="sm">
                              {questionPreviewActive && (previewPhase === "back" || previewPhase === "pre_countdown") ? (
                                <Paper
                                  className="kwiz-card-back kwiz-card-back-clickable kwiz-card-back-min"
                                  withBorder
                                  radius="md"
                                  p="md"
                                  role="button"
                                  tabIndex={0}
                                  onClick={revealPreviewCard}
                                  onKeyDown={(event) => {
                                    if (event.key !== "Enter" && event.key !== " ") return;
                                    event.preventDefault();
                                    revealPreviewCard();
                                  }}
                                >
                                  {previewPhase === "pre_countdown" ? (
                                    <div className="kwiz-countdown-overlay" aria-live="polite">
                                      <Text size="xs" c="dimmed">{t("creator.questions.previewCountdownHint")}</Text>
                                      <Title order={2} className="kwiz-countdown-number">{previewCountdown ?? 0}</Title>
                                    </div>
                                  ) : null}
                                  <Stack align="stretch" justify="center" className="kwiz-card-back-content kwiz-card-back-content-mobile" gap="md">
                                    <div className="kwiz-card-back-art-shell">
                                      <img src="/branding/card-backside.png" alt="KwizHero" className="kwiz-card-back-art" />
                                    </div>
                                  </Stack>
                                </Paper>
                              ) : null}

                              {questionPreviewActive && previewPhase === "front" ? (
                                <div className="kwiz-reveal-enter">
                                  <Stack gap="sm">
                                    <Title order={5}>{currentQuestion?.text || t("creator.questions.labelText")}</Title>
                                    {effectivePreviewTimerSeconds !== null ? (
                                      <Badge color="orange" leftSection={<IconClock size={14} />}>
                                        {`${effectivePreviewTimerSeconds}s`}
                                      </Badge>
                                    ) : null}
                                    {renderQuestionPreviewInput()}
                                    <Group>
                                      <Button disabled>{t("player.submitAnswer")}</Button>
                                    </Group>
                                  </Stack>
                                </div>
                              ) : null}

                              {!questionPreviewActive ? (
                                <>
                                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                                    <Textarea
                                      autosize
                                      minRows={2}
                                      variant="unstyled"
                                      size="lg"
                                      placeholder={t("creator.questions.labelText")}
                                      value={currentQuestion.text}
                                      onFocus={setPreviewEditingFromFocus}
                                      onBlur={clearPreviewEditingFromBlur}
                                      onChange={(e) => updateCurrentQuestion({ ...currentQuestion, text: e.currentTarget.value })}
                                      styles={{ input: { fontSize: 24, fontWeight: 600, lineHeight: 1.3 } }}
                                      className="kwiz-creator-flex-1"
                                    />
                                    <Button
                                      size="compact-xs"
                                      variant="light"
                                      leftSection={<IconSparkles size={12} />}
                                      onClick={openAiGenerator}
                                      style={{ flexShrink: 0, marginTop: 8 }}
                                    >
                                      {t("creator.questions.generateWithAi")}
                                    </Button>
                                  </Group>

                                  {currentQuestion.config.timerSeconds !== null ? (
                                    <Badge color="orange" leftSection={<IconClock size={14} />}>
                                      {`${currentQuestion.config.timerSeconds}s`}
                                    </Badge>
                                  ) : null}

                                  {currentQuestion.questionType === "multiple_choice" ? (
                                    <SimpleGrid cols={2} spacing="sm">
                                      {currentQuestion.choices.map((choice, index) => (
                                        <Card
                                          key={`preview-choice-${index}`}
                                          withBorder
                                          radius="md"
                                          p="sm"
                                          className="kwiz-creator-choice-card"
                                          style={previewChoiceCardStyle(index)}
                                        >
                                          <Stack gap="xs">
                                            <Group justify="space-between" align="center" wrap="nowrap">
                                              <Checkbox
                                                checked={currentQuestion.correctChoiceIndexes.includes(index)}
                                                onChange={(event) => toggleCorrectChoice(index, event.currentTarget.checked)}
                                              />
                                              <ActionIcon variant="subtle" color="red" onClick={() => removeChoice(index)}>
                                                <IconTrash size={14} />
                                              </ActionIcon>
                                            </Group>
                                            <Textarea
                                              autosize
                                              minRows={1}
                                              maxRows={4}
                                              variant="unstyled"
                                              value={choice}
                                              placeholder={t("creator.questions.choiceLabel", { label: String.fromCharCode(65 + index) })}
                                              onFocus={setPreviewEditingFromFocus}
                                              onBlur={() => {
                                                handleChoiceBlur(index);
                                                clearPreviewEditingFromBlur();
                                              }}
                                              onChange={(e) => updateChoice(index, e.currentTarget.value)}
                                              onKeyDown={(event) => {
                                                if (event.key !== "Enter") return;
                                                if ((choice ?? "").trim().length === 0) return;
                                                event.preventDefault();
                                                setChoiceDraftVisible(true);
                                                requestAnimationFrame(() => choiceDraftInputRef.current?.focus());
                                              }}
                                              styles={{ input: { textAlign: "center", fontSize: 18, lineHeight: 1.35, resize: "none" } }}
                                            />
                                          </Stack>
                                        </Card>
                                      ))}

                                      {choiceDraftVisible ? (
                                        <Card
                                          withBorder
                                          radius="md"
                                          p="sm"
                                          className="kwiz-creator-choice-card"
                                          style={previewChoiceCardStyle(currentQuestion.choices.length)}
                                        >
                                          <Stack gap="xs">
                                            <Group justify="space-between" align="center" wrap="nowrap">
                                              <Checkbox
                                                checked={choiceDraftIsCorrect}
                                                onChange={(event) => setChoiceDraftIsCorrect(event.currentTarget.checked)}
                                              />
                                              <ActionIcon
                                                variant="subtle"
                                                color="teal"
                                                onMouseDown={(event) => event.preventDefault()}
                                                onClick={appendChoiceFromDraft}
                                              >
                                                <IconPlus size={14} />
                                              </ActionIcon>
                                            </Group>
                                            <Textarea
                                              autosize
                                              minRows={1}
                                              maxRows={4}
                                              ref={choiceDraftInputRef}
                                              variant="unstyled"
                                              value={choiceDraft}
                                              placeholder={t("creator.questions.choiceLabel", { label: String.fromCharCode(65 + currentQuestion.choices.length) })}
                                              onFocus={setPreviewEditingFromFocus}
                                              onBlur={() => {
                                                if (choiceDraft.trim().length > 0) {
                                                  persistChoiceDraft({ keepDraftVisible: true, refocus: false });
                                                } else {
                                                  setChoiceDraftVisible(false);
                                                }
                                                clearPreviewEditingFromBlur();
                                              }}
                                              onChange={(event) => setChoiceDraft(event.currentTarget.value)}
                                              onKeyDown={(event) => {
                                                if (event.key !== "Enter") return;
                                                event.preventDefault();
                                                appendChoiceFromDraft();
                                              }}
                                              styles={{ input: { textAlign: "center", fontSize: 18, lineHeight: 1.35, resize: "none" } }}
                                            />
                                          </Stack>
                                        </Card>
                                      ) : (
                                        <Card
                                          withBorder
                                          radius="md"
                                          p="sm"
                                          className="kwiz-creator-choice-card"
                                          style={previewChoiceCardStyle(currentQuestion.choices.length)}
                                        >
                                          <Stack justify="center" align="center" className="kwiz-creator-choice-add-shell">
                                            <ActionIcon
                                              variant="subtle"
                                              color="teal"
                                              onMouseDown={(event) => event.preventDefault()}
                                              onClick={() => {
                                                setChoiceDraftVisible(true);
                                                requestAnimationFrame(() => choiceDraftInputRef.current?.focus());
                                              }}
                                            >
                                              <IconPlus size={18} />
                                            </ActionIcon>
                                          </Stack>
                                        </Card>
                                      )}
                                    </SimpleGrid>
                                  ) : null}

                                  {currentQuestion.questionType === "numeric" ? (
                                    <NumberInput
                                      label={t("creator.questions.numericAnswer")}
                                      value={currentQuestion.numericAnswer ?? undefined}
                                      onFocus={setPreviewEditingFromFocus}
                                      onBlur={clearPreviewEditingFromBlur}
                                      onChange={(value) =>
                                        updateCurrentQuestion({
                                          ...currentQuestion,
                                          numericAnswer: typeof value === "number" ? value : null,
                                        })
                                      }
                                    />
                                  ) : null}

                                  {currentQuestion.questionType === "letter_order" ? (
                                    <TextInput
                                      label={t("creator.questions.letterOrderAnswer")}
                                      value={currentQuestion.letterOrderAnswer ?? ""}
                                      onFocus={setPreviewEditingFromFocus}
                                      onBlur={clearPreviewEditingFromBlur}
                                      onChange={(e) =>
                                        updateCurrentQuestion({
                                          ...currentQuestion,
                                          letterOrderAnswer: e.currentTarget.value,
                                        })
                                      }
                                    />
                                  ) : null}
                                </>
                              ) : null}
                            </Stack>
                          </div>
                        </Card>

                      {currentQuestionIssue ? (
                        <Alert color="orange" variant="light" icon={<IconAlertCircle size={16} />}>
                          <Text size="sm">{t("creator.questions.questionNeedsSetup", { issue: currentQuestionIssue })}</Text>
                        </Alert>
                      ) : null}

                      {!currentQuestionIssue && questionIssues.length > 0 ? (
                        <Alert color="yellow" variant="light" icon={<IconAlertCircle size={16} />}>
                          <Text size="sm">{t("creator.questions.questionsNeedSetup", { count: questionIssues.length })}</Text>
                        </Alert>
                      ) : null}
                    </Stack>
                  </Card>

                  <Card withBorder radius="md" p="sm">
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
                      {currentQuestion.questionType === "numeric" ? (
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
                      ) : null}
                    </Stack>
                  </Card>

                </>
              ) : null}
            </Stack>
            ) : (
            <Card withBorder radius="md" p="sm">
              <Stack gap="xs">
                <Text size="sm" fw={600}>{t("creator.route.routeLegsTitle")}</Text>

                {routeLegs.length > 0 ? (
                  <Stack gap={6}>
                    {routeLegs.map((leg, index) => (
                      <Stack
                        key={`route-leg-preview-${index}`}
                        gap={4}
                        p={drawingLegIndex === index ? "xs" : 0}
                        style={drawingLegIndex === index ? { border: "1px solid var(--mantine-color-teal-4)", borderRadius: "8px" } : undefined}
                      >
                        <Group justify="space-between" align="center" wrap="nowrap">
                          <Text size="sm">{t("creator.route.routeLegLabel", { from: leg.fromIndex + 1, to: leg.toIndex + 1 })}</Text>
                          <Text size="xs" c="dimmed">
                            {leg.mode === "none"
                              ? t("creator.route.routeLegHidden")
                              : t("creator.route.routeLegDistanceTime", {
                                  distance: formatDistanceMeters(leg.meters),
                                  minutes: Math.max(1, Math.round(leg.estimatedSeconds / 60)),
                                })}
                          </Text>
                        </Group>
                        <Select
                          size="xs"
                          data={routeModeOptions}
                          value={leg.mode}
                          onChange={(value) => setLegRouteMode(index, (value ?? defaultRouteMode) as RoutePreviewMode)}
                        />
                        {leg.mode === "manual" ? (
                          <Group gap="xs">
                            {drawingLegIndex === index ? (
                              <>
                                <Button size="xs" variant="filled" onClick={finishManualLegDrawing}>
                                  {t("creator.route.manualDrawDone")}
                                </Button>
                                <Button size="xs" variant="light" onClick={undoManualLegPoint} disabled={drawingLegPoints.length === 0}>
                                  {t("creator.route.manualDrawUndo")}
                                </Button>
                                <Button size="xs" variant="default" onClick={cancelManualLegDrawing}>
                                  {t("creator.route.manualDrawCancel")}
                                </Button>
                              </>
                            ) : (
                              <Button size="xs" variant="light" onClick={() => beginManualLegDrawing(index)}>
                                {t("creator.route.manualDrawEdit")}
                              </Button>
                            )}
                          </Group>
                        ) : null}
                        {drawingLegIndex === index ? (
                          <Text size="xs" c="dimmed">
                            {t("creator.route.manualDrawActiveHint", { points: drawingLegPoints.length })}
                          </Text>
                        ) : null}
                      </Stack>
                    ))}
                    <Group justify="space-between" align="center" mt={4}>
                      <Text size="sm" fw={600}>{t("creator.route.routeLegsTotal")}</Text>
                      <Text size="sm" fw={600}>
                        {t("creator.route.routeLegDistanceTime", {
                          distance: formatDistanceMeters(routeDistance),
                          minutes: Math.max(1, Math.round(routeTotalEstimatedSeconds / 60)),
                        })}
                      </Text>
                    </Group>
                    {manualDrawError ? (
                      <Alert color="yellow" variant="light" icon={<IconAlertCircle size={16} />}>
                        <Text size="sm">{manualDrawError}</Text>
                      </Alert>
                    ) : null}
                  </Stack>
                ) : (
                  <Text size="sm" c="dimmed">{t("creator.route.routeLegsEmptyHint")}</Text>
                )}
              </Stack>
            </Card>
            )}
          </SimpleGrid>
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
                  <Button onClick={onCreate} disabled={Boolean(firebaseConfigError) || loadingEditableQuiz} loading={savingDraft}>
                    {isEditingExistingQuiz ? t("creator.publish.saveDraftChanges") : t("creator.publish.createDraft")}
                  </Button>
                  {canPublishCurrentQuiz ? (
                    <Button variant="light" onClick={onPublish} disabled={Boolean(firebaseConfigError) || loadingEditableQuiz} loading={publishing}>
                      {t("creator.publish.publish")}
                    </Button>
                  ) : null}
                </Group>
                {isEditingExistingQuiz && !canPublishCurrentQuiz ? (
                  <Text size="xs" c="dimmed">{t("creator.publish.publishDisabledNoEditKey")}</Text>
                ) : null}
                {result ? (
                  <Alert icon={<IconCircleCheck size={16} />} color="teal" variant="light">
                    <Stack gap={4}>
                      {result.editKey ? <Text size="sm" fw={600}>{t("creator.publish.editKeyWarning")}</Text> : null}
                      <Text size="sm">{t("creator.publish.labelQuizId")}: {result.quizId}</Text>
                      {result.editKey ? <Text size="sm">{t("creator.publish.labelEditKey")}: {result.editKey}</Text> : null}
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

        {renderAiModals()}

        <Group justify="space-between">
          <Button variant="default" onClick={previousStep} disabled={step === 1}>
            {t("common.back")}
          </Button>
          <Group>
            {isEditingExistingQuiz ? (
              <Button
                variant="light"
                onClick={onCreate}
                disabled={Boolean(firebaseConfigError) || loadingEditableQuiz || editingQuizStatus === "published"}
                loading={savingDraft}
              >
                {t("creator.publish.saveDraftChanges")}
              </Button>
            ) : null}
            <Button onClick={nextStep} disabled={step === 5 || !canGoNext}>
              {t("common.next")}
            </Button>
          </Group>
        </Group>

        {error ? (
          <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
            {error}
          </Alert>
        ) : null}
      </Stack>
    </div>
  );
}
