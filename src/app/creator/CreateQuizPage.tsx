import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { latLngBounds } from "leaflet";
import { Circle, CircleMarker, MapContainer, Polyline, TileLayer, Tooltip as LeafletTooltip, useMap, useMapEvents } from "react-leaflet";
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
  Stepper,
  Text,
  TextInput,
  Textarea,
  Switch,
  Radio,
  Title,
  VisuallyHidden,
} from "@mantine/core";
import { IconAlertCircle, IconChevronLeft, IconChevronRight, IconCircleCheck, IconClock, IconMapPin, IconPlus, IconQrcode, IconTrash, IconX } from "@tabler/icons-react";
import { useMediaQuery } from "@mantine/hooks";
import { firebaseConfigError } from "../../platform/firebase/firebase";
import { createDraftQuiz, publishQuiz } from "../../platform/firebase/quizRepository";
import type { DraftQuestionInput, DraftWaypointInput, QuestionType, QuizDraftInput } from "../../domain/types";

const now = new Date();
const plusDays = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

type WizardStep = 1 | 2 | 3 | 4;
type CreatorPreviewPhase = "back" | "pre_countdown" | "front";

const previewChoiceBorderColors = ["#f08c00", "#2f9e44", "#4c6ef5", "#ae3ec9", "#0b7285", "#e8590c"];

interface WaypointPickerProps {
  waypoints: DraftWaypointInput[];
  selectedWaypointIndex: number;
  radius: number;
  orderedRoute: boolean;
  height: number;
  viewport: { lat: number; lng: number; zoom: number } | null;
  onViewportChange: (viewport: { lat: number; lng: number; zoom: number }) => void;
  onChange: (lat: number, lng: number) => void;
}

interface WaypointOverviewMapProps {
  waypoints: DraftWaypointInput[];
  selectedWaypointIndex: number;
  radius: number;
}

function WaypointPicker(props: WaypointPickerProps): JSX.Element {
  const fallbackCenter = props.waypoints[props.selectedWaypointIndex] ?? props.waypoints[0] ?? { lat: 57.7089, lng: 11.9746 };
  const selectedWaypoint = props.waypoints[props.selectedWaypointIndex] ?? null;

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
      center={[props.viewport?.lat ?? fallbackCenter.lat, props.viewport?.lng ?? fallbackCenter.lng]}
      zoom={props.viewport?.zoom ?? 14}
      scrollWheelZoom
      style={{ height: props.height, width: "100%", borderRadius: 12, border: "1px solid var(--mantine-color-gray-4)" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitWaypointsBounds waypoints={props.waypoints} enabled={props.viewport === null} />
      <EnsureSelectedWaypointVisible waypoint={selectedWaypoint} />
      <TrackMapViewport onViewportChange={props.onViewportChange} />
      {props.orderedRoute && props.waypoints.length > 1 ? (
        <>
          <Polyline
            positions={props.waypoints.map((waypoint) => [waypoint.lat, waypoint.lng] as [number, number])}
            pathOptions={{ color: "#1971c2", weight: 3, opacity: 0.65 }}
          />
          {props.waypoints.slice(0, -1).map((waypoint, index) => {
            const next = props.waypoints[index + 1];
            if (!next) return null;
            return (
              <CircleMarker
                key={`route-arrow-${index}`}
                center={[(waypoint.lat + next.lat) / 2, (waypoint.lng + next.lng) / 2]}
                radius={2}
                pathOptions={{ color: "#1971c2", fillColor: "#1971c2", fillOpacity: 0 }}
              >
                <LeafletTooltip permanent direction="center" offset={[0, 0]}>➜</LeafletTooltip>
              </CircleMarker>
            );
          })}
        </>
      ) : null}
      {props.waypoints.map((waypoint, index) => {
        const isSelected = index === props.selectedWaypointIndex;
        const zoneRadius = isSelected ? props.radius : Math.max(8, Math.round(props.radius * 0.55));
        const isFirst = index === 0;
        const isLast = index === props.waypoints.length - 1;

        return (
          <Fragment key={`waypoint-picker-layer-${index}`}>
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
            {props.orderedRoute && isFirst ? (
              <CircleMarker
                center={[waypoint.lat, waypoint.lng]}
                radius={1}
                pathOptions={{ color: "#2f9e44", fillColor: "#2f9e44", fillOpacity: 0 }}
              >
                <LeafletTooltip permanent direction="bottom" offset={[0, 10]}>START</LeafletTooltip>
              </CircleMarker>
            ) : null}
            {props.orderedRoute && isLast && props.waypoints.length > 1 ? (
              <CircleMarker
                center={[waypoint.lat, waypoint.lng]}
                radius={1}
                pathOptions={{ color: "#d9480f", fillColor: "#d9480f", fillOpacity: 0 }}
              >
                <LeafletTooltip permanent direction="bottom" offset={[0, 10]}>END</LeafletTooltip>
              </CircleMarker>
            ) : null}
          </Fragment>
        );
      })}
      <ClickCapture />
    </MapContainer>
  );
}

function EnsureSelectedWaypointVisible(props: { waypoint: DraftWaypointInput | null }): null {
  const map = useMap();

  useEffect(() => {
    if (!props.waypoint) return;

    const target: [number, number] = [props.waypoint.lat, props.waypoint.lng];
    map.panTo(target, { animate: true, duration: 0.35 });
  }, [map, props.waypoint?.lat, props.waypoint?.lng]);

  return null;
}

function TrackMapViewport(props: {
  onViewportChange: (viewport: { lat: number; lng: number; zoom: number }) => void;
}): null {
  const map = useMap();

  useEffect(() => {
    const reportViewport = () => {
      const center = map.getCenter();
      props.onViewportChange({ lat: center.lat, lng: center.lng, zoom: map.getZoom() });
    };

    reportViewport();
    map.on("moveend", reportViewport);
    map.on("zoomend", reportViewport);

    return () => {
      map.off("moveend", reportViewport);
      map.off("zoomend", reportViewport);
    };
  }, [map, props.onViewportChange]);

  return null;
}

function FitWaypointsBounds(props: { waypoints: DraftWaypointInput[]; enabled?: boolean }): null {
  const map = useMap();

  useEffect(() => {
    if (props.enabled === false) return;
    if (props.waypoints.length === 0) return;

    if (props.waypoints.length === 1) {
      const only = props.waypoints[0];
      map.setView([only.lat, only.lng], 14);
      return;
    }

    const bounds = latLngBounds(props.waypoints.map((waypoint) => [waypoint.lat, waypoint.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [28, 28] });
  }, [map, props.enabled, props.waypoints]);

  return null;
}

function WaypointOverviewMap(props: WaypointOverviewMapProps): JSX.Element {
  const fallbackCenter = props.waypoints[props.selectedWaypointIndex] ?? props.waypoints[0] ?? { lat: 57.7089, lng: 11.9746 };

  return (
    <MapContainer
      center={[fallbackCenter.lat, fallbackCenter.lng]}
      zoom={13}
      scrollWheelZoom
      style={{ height: 170, width: "100%", borderRadius: 12, border: "1px solid var(--mantine-color-gray-4)" }}
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
      correctChoiceIndexes: [],
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
      correctChoiceIndexes: [],
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
    choices: [],
    correctChoiceIndexes: [],
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
  const isTwoColumnRouteLayout = useMediaQuery("(min-width: 75em)");
  const isMobilePreviewLayout = useMediaQuery("(max-width: 48em)");
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
      requireSequentialWaypoints: true,
      scoringStrategy: "binary_correct_1_point",
    },
  });
  const [selectedWaypointIndex, setSelectedWaypointIndex] = useState(0);
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0);
  const [result, setResult] = useState<{ quizId: string; editKey: string } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [error, setError] = useState<string | null>(firebaseConfigError);
  const [publishing, setPublishing] = useState(false);
  const [choiceDraft, setChoiceDraft] = useState("");
  const [choiceDraftIsCorrect, setChoiceDraftIsCorrect] = useState(false);
  const [choiceDraftVisible, setChoiceDraftVisible] = useState(true);
  const [previewPhase, setPreviewPhase] = useState<CreatorPreviewPhase>("front");
  const [dragQuestionIndex, setDragQuestionIndex] = useState<number | null>(null);
  const [dragOverQuestionIndex, setDragOverQuestionIndex] = useState<number | null>(null);
  const [moveMode, setMoveMode] = useState(false);
  const [moveModePulse, setMoveModePulse] = useState(false);
  const [focusedQuestionIndex, setFocusedQuestionIndex] = useState<number | null>(null);
  const [reorderAnnouncement, setReorderAnnouncement] = useState("");
  const [previewEditing, setPreviewEditing] = useState(false);
  const [coordinatesOverlayOpen, setCoordinatesOverlayOpen] = useState(false);
  const [addMultipleWaypointsMode, setAddMultipleWaypointsMode] = useState(false);
  const [routeMapViewport, setRouteMapViewport] = useState<{ lat: number; lng: number; zoom: number } | null>(null);
  const choiceDraftInputRef = useRef<HTMLTextAreaElement | null>(null);
  const previewSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moveModePulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewEditorRef = useRef<HTMLDivElement | null>(null);
  const multipleChoiceStateCacheRef = useRef<Record<string, { choices: string[]; correctChoiceIndexes: number[] }>>({});

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
    setCoordinatesOverlayOpen(false);
    let nextWaypointIndex = 0;
    setInput((prev) => {
      nextWaypointIndex = prev.waypoints.length;
      const waypoint = createDefaultWaypoint(nextWaypointIndex);
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
    setSelectedWaypointIndex(nextWaypointIndex);
    setSelectedQuestionIndex(0);
  }

  function addWaypoint(): void {
    addWaypointAt();
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
    setCoordinatesOverlayOpen(false);
    const nextWaypoints = input.waypoints.filter((_, i) => i !== selectedWaypointIndex);
    setInput((prev) => ({ ...prev, waypoints: nextWaypoints }));
    setSelectedWaypointIndex(Math.max(0, selectedWaypointIndex - 1));
    setSelectedQuestionIndex(0);
  }

  function addQuestionToCurrentWaypoint(): void {
    if (!currentWaypoint) return;
    persistChoiceDraft({ keepDraftVisible: false, refocus: false });
    updateCurrentWaypoint({
      ...currentWaypoint,
      questions: [...currentWaypoint.questions, createDefaultQuestion()],
    });
    setSelectedQuestionIndex(currentWaypoint.questions.length);
  }

  function removeCurrentQuestion(): void {
    if (!currentWaypoint || currentWaypoint.questions.length === 0) return;
    persistChoiceDraft({ keepDraftVisible: false, refocus: false });
    const nextQuestions = currentWaypoint.questions.filter((_, i) => i !== selectedQuestionIndex);
    updateCurrentWaypoint({ ...currentWaypoint, questions: nextQuestions });
    setSelectedQuestionIndex(nextQuestions.length === 0 ? 0 : Math.max(0, selectedQuestionIndex - 1));
  }

  function moveCurrentQuestionByStep(direction: -1 | 1): void {
    if (!currentQuestion) return;
    if (currentQuestionPositionIndex < 0) return;

    const targetPosition = questionPositions[currentQuestionPositionIndex + direction];
    if (!targetPosition) return;

    let currentQuestionForMove: DraftQuestionInput = currentQuestion;
    if (currentQuestion.questionType === "multiple_choice") {
      const trimmedDraft = choiceDraft.trim();
      if (trimmedDraft.length > 0) {
        const nextChoiceIndex = currentQuestion.choices.length;
        currentQuestionForMove = {
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

    const sourceWaypointIndex = selectedWaypointIndex;
    const sourceQuestionIndex = selectedQuestionIndex;
    const isSameWaypointMove = targetPosition.waypointIndex === sourceWaypointIndex;
    const targetWaypointLengthBeforeMove = input.waypoints[targetPosition.waypointIndex]?.questions.length ?? 0;

    setInput((prev) => {
      const nextWaypoints = prev.waypoints.map((waypoint) => ({
        ...waypoint,
        questions: [...waypoint.questions],
      }));

      const sourceWaypoint = nextWaypoints[sourceWaypointIndex];
      const targetWaypoint = nextWaypoints[targetPosition.waypointIndex];
      if (!sourceWaypoint || !targetWaypoint) return prev;

      if (isSameWaypointMove) {
        const targetQuestion = targetWaypoint.questions[targetPosition.questionIndex];
        if (!targetQuestion) return prev;
        sourceWaypoint.questions[sourceQuestionIndex] = targetQuestion;
        targetWaypoint.questions[targetPosition.questionIndex] = currentQuestionForMove;
      } else {
        sourceWaypoint.questions.splice(sourceQuestionIndex, 1);
        const insertIndex = direction === -1 ? targetWaypoint.questions.length : 0;
        targetWaypoint.questions.splice(insertIndex, 0, currentQuestionForMove);
      }

      return { ...prev, waypoints: nextWaypoints };
    });

    if (isSameWaypointMove) {
      setSelectedWaypointIndex(targetPosition.waypointIndex);
      setSelectedQuestionIndex(targetPosition.questionIndex);
      return;
    }

    setSelectedWaypointIndex(targetPosition.waypointIndex);
    setSelectedQuestionIndex(direction === -1 ? targetWaypointLengthBeforeMove : 0);
  }

  function reorderQuestionsInCurrentWaypoint(fromIndex: number, toIndex: number): void {
    if (!currentWaypoint) return;
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || toIndex < 0) return;
    if (fromIndex >= currentWaypoint.questions.length || toIndex >= currentWaypoint.questions.length) return;

    const nextQuestions = [...currentWaypoint.questions];
    const [moved] = nextQuestions.splice(fromIndex, 1);
    nextQuestions.splice(toIndex, 0, moved);
    updateCurrentWaypoint({ ...currentWaypoint, questions: nextQuestions });
    setSelectedQuestionIndex(toIndex);
    setFocusedQuestionIndex(toIndex);
    setReorderAnnouncement(
      t("creator.questions.reorderMoved", {
        from: fromIndex + 1,
        to: toIndex + 1,
      })
    );
  }

  function handleQuestionPointerDown(index: number): void {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = setTimeout(() => {
      setSelectedQuestionIndex(index);
      setMoveMode(true);
      setMoveModePulse(true);
      if (moveModePulseTimerRef.current) {
        clearTimeout(moveModePulseTimerRef.current);
      }
      moveModePulseTimerRef.current = setTimeout(() => setMoveModePulse(false), 180);
    }, 450);
  }

  function clearLongPressTimer(): void {
    if (!longPressTimerRef.current) return;
    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  }

  useEffect(() => {
    return () => {
      if (moveModePulseTimerRef.current) {
        clearTimeout(moveModePulseTimerRef.current);
      }
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

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
    setStep((prev) => (prev < 4 ? ((prev + 1) as WizardStep) : prev));
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

  const questionCountInCurrentWaypoint = currentWaypoint?.questions.length ?? 0;
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
  const currentQuestionGlobalNumber = input.waypoints
    .slice(0, selectedWaypointIndex)
    .reduce((sum, waypoint) => sum + waypoint.questions.length, 0) +
    selectedQuestionIndex +
    1;
  const currentQuestionOrdinal =
    questionCountInCurrentWaypoint > 1 ? ` (${selectedQuestionIndex + 1}/${questionCountInCurrentWaypoint})` : "";

  function getQuestionGlobalNumber(questionIndex: number): number {
    return (
      input.waypoints.slice(0, selectedWaypointIndex).reduce((sum, waypoint) => sum + waypoint.questions.length, 0) +
      questionIndex +
      1
    );
  }

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
    setCoordinatesOverlayOpen(false);
    setSelectedWaypointIndex(index);
    setSelectedQuestionIndex(0);
  }

  function selectQuestion(index: number): void {
    persistChoiceDraft({ keepDraftVisible: false, refocus: false });
    setSelectedQuestionIndex(index);
  }

  function onPreviewPointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    previewSwipeStartRef.current = { x: event.clientX, y: event.clientY };
  }

  function onPreviewPointerUp(event: React.PointerEvent<HTMLDivElement>): void {
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

  function moveSelectedQuestionLeft(): void {
    if (!hasPreviousQuestion) return;
    reorderQuestionsInCurrentWaypoint(selectedQuestionIndex, selectedQuestionIndex - 1);
  }

  function moveSelectedQuestionRight(): void {
    if (!hasNextQuestion) return;
    reorderQuestionsInCurrentWaypoint(selectedQuestionIndex, selectedQuestionIndex + 1);
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
  }, [selectedWaypointIndex, selectedQuestionIndex, currentQuestion?.questionType]);

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
  }, [selectedWaypointIndex, currentWaypoint?.questions.length, selectedQuestionIndex]);

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
    (step === 1 && input.title.trim().length > 2) ||
    step === 2 ||
    (step === 3 && hasWaypointData && hasQuestionData) ||
    step === 4;

  const routeMapHeight = coordinatesOverlayOpen
    ? isTwoColumnRouteLayout
      ? 620
      : 500
    : isTwoColumnRouteLayout
      ? 460
      : 320;

  const mobileWaypointNavStyle = isMobilePreviewLayout
    ? {
        position: "sticky" as const,
        top: 8,
        zIndex: 260,
        background: "var(--mantine-color-body)",
        border: "1px solid var(--mantine-color-gray-3)",
        borderRadius: 10,
        padding: "8px",
      }
    : undefined;

  return (
    <Paper withBorder shadow="sm" radius="md" p="lg">
      <Stack gap="md">
        <VisuallyHidden aria-live="polite">{reorderAnnouncement}</VisuallyHidden>
        <Title order={2}>{t("creator.title")}</Title>
        <Text c="dimmed">{t("creator.step", { current: step, total: 4 })}</Text>

        <Stepper active={step - 1} onStepClick={(n) => setStep((n + 1) as WizardStep)} allowNextStepsSelect={false}>
          <Stepper.Step label={t("creator.steps.identity")} />
          <Stepper.Step label={t("creator.steps.rules")} />
          <Stepper.Step label={t("creator.steps.routeAndQuestions")} />
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
            <Group justify="space-between" align="center" wrap="nowrap" style={mobileWaypointNavStyle}>
              <Group
                wrap={isMobilePreviewLayout ? "nowrap" : "wrap"}
                style={{
                  flex: 1,
                  overflowX: isMobilePreviewLayout ? "auto" : undefined,
                  scrollbarWidth: "thin",
                }}
              >
                {input.waypoints.map((waypoint, index) => {
                  const questionCount = waypoint.questions.length;
                  const invalidCount = waypoint.questions.filter((question) => !isQuestionValid(question)).length;
                  const isActive = selectedWaypointIndex === index;
                  const color = questionCount === 0 ? "gray" : invalidCount > 0 ? "orange" : "teal";

                  return (
                    <Button
                      key={`waypoint-question-tab-${index}`}
                      variant={isActive ? "filled" : "light"}
                      color={color}
                      size="xs"
                      onClick={() => {
                        selectWaypoint(index);
                      }}
                    >
                      {`${index + 1}. ${waypoint.name} (${questionCount})`}
                    </Button>
                  );
                })}
              </Group>
              <Badge>{t("creator.route.waypointCount", { count: input.waypoints.length })}</Badge>
            </Group>

          <SimpleGrid cols={coordinatesOverlayOpen ? { base: 1, lg: 1 } : { base: 1, lg: 2 }} spacing="md">
            <Stack gap="md">

              {currentWaypoint ? (
                <Stack gap="xs">
                  <Stack gap="xs">
                    <Group justify="space-between" align="end" wrap="nowrap">
                      <TextInput
                        label={t("creator.route.labelName")}
                        style={{ flex: 1 }}
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
                  <Stack gap="xs" style={{ position: "relative" }}>
                    <Text size="sm" fw={600}>{t("creator.route.mapHint")}</Text>
                    {addMultipleWaypointsMode ? (
                      <Badge color="orange" variant="light" style={{ alignSelf: "flex-start" }}>
                        {t("creator.route.addMultipleWaypointsActive")}
                      </Badge>
                    ) : null}
                    {coordinatesOverlayOpen ? (
                      <Paper
                        withBorder
                        radius="md"
                        p="sm"
                        style={{
                          position: "absolute",
                          top: 42,
                          right: 8,
                          zIndex: 600,
                          width: 238,
                          background: "rgba(255, 255, 255, 0.84)",
                          backdropFilter: "blur(4px)",
                        }}
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
                      orderedRoute={input.ruleset.requireSequentialWaypoints}
                      height={routeMapHeight}
                      viewport={routeMapViewport}
                      onViewportChange={setRouteMapViewport}
                      onChange={handleRouteMapClick}
                    />
                  </Stack>
                </Card>
              ) : null}
            </Stack>

            <Stack gap="md">
              {currentWaypoint ? (
                <Stack gap="sm">

                  {currentWaypoint.questions.length === 0 ? (
                    <Card withBorder radius="md" p="xl">
                      <Stack align="center" justify="center" gap="md" style={{ minHeight: 220 }}>
                        <Text size="sm" c="dimmed">This waypoint has no cards yet.</Text>
                        <Button leftSection={<IconPlus size={16} />} onClick={addQuestionToCurrentWaypoint}>
                          {t("creator.questions.addCard")}
                        </Button>
                      </Stack>
                    </Card>
                  ) : null}
                </Stack>
              ) : null}

              {currentQuestion ? (
                <>
                  <Card
                    withBorder={!isMobilePreviewLayout}
                    radius={isMobilePreviewLayout ? "sm" : "md"}
                    p={isMobilePreviewLayout ? 0 : "sm"}
                    style={
                      isMobilePreviewLayout
                        ? {
                            marginInline: -8,
                            background: "transparent",
                          }
                        : undefined
                    }
                  >
                    <Stack gap="sm">
                      <Group justify="space-between" align="center" wrap="nowrap">
                        <Text size="sm" fw={600}>
                          {t("creator.questions.previewQuestionWithWaypoint", {
                            number: currentQuestionGlobalNumber,
                            waypointName: currentWaypoint.name,
                            questionOrdinal: currentQuestionOrdinal,
                          })}
                        </Text>
                        <Group gap={6} wrap="nowrap" align="center">
                          <Text size="xs" c="dimmed">{t("creator.questions.reorderShort")}</Text>
                          <ActionIcon
                            variant="subtle"
                            color="teal"
                            onClick={addQuestionToCurrentWaypoint}
                            aria-label={t("creator.questions.addCard")}
                            title={t("creator.questions.addCard")}
                          >
                            <IconPlus size={14} />
                          </ActionIcon>
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            onClick={removeCurrentQuestion}
                            disabled={currentWaypoint.questions.length === 0}
                            aria-label={t("creator.questions.removeQuestion")}
                            title={t("creator.questions.removeQuestion")}
                          >
                            <IconTrash size={14} />
                          </ActionIcon>
                          <Button
                            size="compact-xs"
                            variant="subtle"
                            color="gray"
                            onClick={() => moveCurrentQuestionByStep(-1)}
                            disabled={!hasPreviousQuestion}
                            leftSection={<IconChevronLeft size={12} />}
                            title={t("creator.questions.moveQuestionToPreviousWaypoint")}
                          >
                            {"<"}
                          </Button>
                          <Button
                            size="compact-xs"
                            variant="subtle"
                            color="gray"
                            onClick={() => moveCurrentQuestionByStep(1)}
                            disabled={!hasNextQuestion}
                            rightSection={<IconChevronRight size={12} />}
                            title={t("creator.questions.moveQuestionToNextWaypoint")}
                          >
                            {">"}
                          </Button>
                        </Group>
                      </Group>

                      {currentQuestionIssue ? (
                        <Alert color="orange" variant="light" icon={<IconAlertCircle size={16} />}>
                          <Text size="sm">{`This card needs setup: ${currentQuestionIssue}.`}</Text>
                        </Alert>
                      ) : null}

                      {!currentQuestionIssue && questionIssues.length > 0 ? (
                        <Alert color="yellow" variant="light" icon={<IconAlertCircle size={16} />}>
                          <Text size="sm">{`${questionIssues.length} card(s) still need setup before Next is enabled.`}</Text>
                        </Alert>
                      ) : null}

                      {isMobilePreviewLayout ? (
                        <Group justify="center" gap="xs" wrap="nowrap" style={{ width: "100%" }}>
                          <ActionIcon
                            variant="subtle"
                            size="sm"
                            onClick={goToPreviousQuestion}
                            disabled={!hasPreviousQuestion || previewEditing}
                            aria-label={t("creator.questions.navPrevious")}
                          >
                            <IconChevronLeft size={14} />
                          </ActionIcon>
                          <Text size="xs" c="dimmed">{t("creator.questions.swipeHint")}</Text>
                          <ActionIcon
                            variant="subtle"
                            size="sm"
                            onClick={goToNextQuestion}
                            disabled={!hasNextQuestion || previewEditing}
                            aria-label={t("creator.questions.navNext")}
                          >
                            <IconChevronRight size={14} />
                          </ActionIcon>
                        </Group>
                      ) : null}

                      <Group justify="center" align="stretch" wrap="nowrap">
                        {!isMobilePreviewLayout ? (
                          <Button
                            variant="subtle"
                            onClick={goToPreviousQuestion}
                            disabled={!hasPreviousQuestion || previewEditing}
                            style={{ alignSelf: "center" }}
                          >
                            <IconChevronLeft size={20} />
                          </Button>
                        ) : null}

                        <Card
                          withBorder={!isMobilePreviewLayout}
                          radius={isMobilePreviewLayout ? "sm" : "lg"}
                          p={isMobilePreviewLayout ? "sm" : "md"}
                          style={{
                            width: isMobilePreviewLayout ? "calc(100% + 16px)" : "100%",
                            maxWidth: isMobilePreviewLayout ? "none" : 390,
                            minHeight: isMobilePreviewLayout ? 0 : 620,
                            marginInline: isMobilePreviewLayout ? -8 : 0,
                            background: isMobilePreviewLayout
                              ? "linear-gradient(180deg, #ffffff 0%, #f8f9fa 100%)"
                              : "linear-gradient(180deg, #ffffff 0%, #f6f8fa 100%)",
                            borderTop: isMobilePreviewLayout ? "1px solid var(--mantine-color-gray-3)" : undefined,
                            borderBottom: isMobilePreviewLayout ? "1px solid var(--mantine-color-gray-3)" : undefined,
                            touchAction: previewEditing ? "auto" : "pan-y",
                          }}
                          onPointerDown={onPreviewPointerDown}
                          onPointerUp={onPreviewPointerUp}
                        >
                          <div ref={previewEditorRef}>
                            <Stack gap="sm">
                              {previewPhase === "back" || previewPhase === "pre_countdown" ? (
                                <Paper className="kwiz-card-back" withBorder radius="md" p="md">
                                  {previewPhase === "pre_countdown" ? (
                                    <div className="kwiz-countdown-overlay" aria-live="polite">
                                      <Text size="xs" c="dimmed">{t("creator.questions.previewCountdownHint")}</Text>
                                      <Title order={2} className="kwiz-countdown-number">3</Title>
                                    </div>
                                  ) : null}
                                  <Stack align="center" gap="xs">
                                    <Image
                                      src="/branding/kwizherologo.png"
                                      alt="KwizHero"
                                      h={62}
                                      w="100%"
                                      style={{ maxWidth: 220 }}
                                      fit="contain"
                                    />
                                    <Text fw={700} size="lg">{t("creator.questions.previewQuestionCardTitle")}</Text>
                                    <Text c="dimmed">{t("creator.questions.previewQuestionCardHint")}</Text>
                                  </Stack>
                                </Paper>
                              ) : null}

                              {previewPhase === "front" ? (
                                <>
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
                                  />

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
                                          style={{ borderColor: previewChoiceBorderColors[index % previewChoiceBorderColors.length] }}
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
                                          style={{ borderColor: previewChoiceBorderColors[currentQuestion.choices.length % previewChoiceBorderColors.length] }}
                                        >
                                          <Stack gap="xs">
                                            <Group justify="space-between" align="center" wrap="nowrap">
                                              <Checkbox
                                                checked={choiceDraftIsCorrect}
                                                onChange={(event) => setChoiceDraftIsCorrect(event.currentTarget.checked)}
                                              />
                                              <ActionIcon variant="subtle" color="teal" onClick={appendChoiceFromDraft}>
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
                                                if (choiceDraft.trim().length === 0) {
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
                                          style={{ borderColor: previewChoiceBorderColors[currentQuestion.choices.length % previewChoiceBorderColors.length] }}
                                        >
                                          <Stack justify="center" align="center" style={{ minHeight: 92 }}>
                                            <ActionIcon variant="subtle" color="teal" onClick={() => {
                                              setChoiceDraftVisible(true);
                                              requestAnimationFrame(() => choiceDraftInputRef.current?.focus());
                                            }}>
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

                        {!isMobilePreviewLayout ? (
                          <Button
                            variant="subtle"
                            onClick={goToNextQuestion}
                            disabled={!hasNextQuestion || previewEditing}
                            style={{ alignSelf: "center" }}
                          >
                            <IconChevronRight size={20} />
                          </Button>
                        ) : null}
                      </Group>
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

                  {false ? (
                  <Card withBorder radius="md" p="sm">
                    <Stack gap="sm">
                      <Group justify="space-between" align="center" wrap="wrap">
                        <Text size="sm" fw={600}>{t("creator.questions.reorderTitle")}</Text>
                        <Text size="xs" c="dimmed">{t("creator.questions.reorderHint")}</Text>
                      </Group>
                      <Text size="xs" c="dimmed">{t("creator.questions.reorderKeyboardHint")}</Text>

                      <Group gap="xs" wrap="wrap">
                        {currentWaypoint.questions.map((question, index) => {
                          const isSelected = selectedQuestionIndex === index;
                          const isValid = isQuestionValid(question);
                          const isDragSource = dragQuestionIndex === index;
                          const isDropTarget = dragOverQuestionIndex === index && dragQuestionIndex !== index;
                          return (
                            <Paper
                              key={`question-order-item-${index}`}
                              withBorder
                              radius="md"
                              p="xs"
                              draggable={!previewEditing}
                              tabIndex={0}
                              role="button"
                              aria-label={t("creator.questions.previewQuestionBadge", { number: index + 1 })}
                              onDragStart={() => {
                                setDragQuestionIndex(index);
                                selectQuestion(index);
                              }}
                              onDragOver={(event) => {
                                event.preventDefault();
                                setDragOverQuestionIndex(index);
                              }}
                              onDragLeave={() => {
                                if (dragOverQuestionIndex === index) {
                                  setDragOverQuestionIndex(null);
                                }
                              }}
                              onDrop={() => {
                                if (dragQuestionIndex === null) return;
                                reorderQuestionsInCurrentWaypoint(dragQuestionIndex, index);
                                setDragQuestionIndex(null);
                                setDragOverQuestionIndex(null);
                              }}
                              onDragEnd={() => {
                                setDragQuestionIndex(null);
                                setDragOverQuestionIndex(null);
                              }}
                              onClick={() => selectQuestion(index)}
                              onFocus={() => {
                                selectQuestion(index);
                                setFocusedQuestionIndex(index);
                              }}
                              onBlur={() => {
                                if (focusedQuestionIndex === index) {
                                  setFocusedQuestionIndex(null);
                                }
                              }}
                              onKeyDown={(event) => {
                                if ((event.key === "Enter" || event.key === " ") && !event.repeat) {
                                  event.preventDefault();
                                  const nextMoveMode = !moveMode;
                                  setMoveMode(nextMoveMode);
                                  if (nextMoveMode) {
                                    setMoveModePulse(true);
                                    if (moveModePulseTimerRef.current) {
                                      clearTimeout(moveModePulseTimerRef.current);
                                    }
                                    moveModePulseTimerRef.current = setTimeout(() => setMoveModePulse(false), 180);
                                  }
                                  return;
                                }

                                if (event.key === "Escape") {
                                  setMoveMode(false);
                                  setReorderAnnouncement(t("creator.questions.reorderDone"));
                                  return;
                                }

                                if (event.key === "ArrowLeft" && (event.ctrlKey || moveMode) && index > 0) {
                                  event.preventDefault();
                                  reorderQuestionsInCurrentWaypoint(index, index - 1);
                                  return;
                                }

                                if (
                                  event.key === "ArrowRight" &&
                                  (event.ctrlKey || moveMode) &&
                                  index < currentWaypoint.questions.length - 1
                                ) {
                                  event.preventDefault();
                                  reorderQuestionsInCurrentWaypoint(index, index + 1);
                                }
                              }}
                              onPointerDown={() => !previewEditing && handleQuestionPointerDown(index)}
                              onPointerUp={clearLongPressTimer}
                              onPointerLeave={clearLongPressTimer}
                              style={{
                                cursor: previewEditing ? "default" : "grab",
                                borderStyle: isDropTarget ? "dashed" : "solid",
                                borderWidth: isDropTarget ? 2 : 1,
                                borderColor: isSelected ? "var(--mantine-color-teal-6)" : undefined,
                                background: isSelected ? "var(--mantine-color-teal-0)" : undefined,
                                outline: focusedQuestionIndex === index ? "2px solid var(--mantine-color-blue-6)" : "none",
                                outlineOffset: focusedQuestionIndex === index ? 2 : 0,
                                opacity: isDragSource ? 0.45 : 1,
                                transform: moveModePulse && isSelected ? "scale(1.025)" : "scale(1)",
                                boxShadow: moveModePulse && isSelected ? "0 0 0 3px rgba(15, 107, 95, 0.18)" : "none",
                                transition: "transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease",
                                minWidth: 150,
                              }}
                            >
                              <Stack gap={2}>
                                <Text size="xs" fw={700}>{`Q${getQuestionGlobalNumber(index)}`}</Text>
                                <Text size="xs" lineClamp={2}>{question.text || t("creator.questions.untitledQuestion")}</Text>
                                <Badge size="xs" color={isValid ? "teal" : "orange"} variant="light">
                                  {isValid ? t("creator.questions.reorderReady") : t("creator.questions.reorderNeedsSetup")}
                                </Badge>
                              </Stack>
                            </Paper>
                          );
                        })}
                      </Group>

                      {moveMode ? (
                        <Group>
                          <Button
                            variant="light"
                            onClick={moveSelectedQuestionLeft}
                            disabled={!hasPreviousQuestion}
                            leftSection={<IconChevronLeft size={16} />}
                          >
                            {t("creator.questions.reorderMoveLeft")}
                          </Button>
                          <Button
                            variant="light"
                            onClick={moveSelectedQuestionRight}
                            disabled={!hasNextQuestion}
                            rightSection={<IconChevronRight size={16} />}
                          >
                            {t("creator.questions.reorderMoveRight")}
                          </Button>
                          <Button variant="default" onClick={() => setMoveMode(false)}>{t("creator.questions.reorderDone")}</Button>
                        </Group>
                      ) : null}
                    </Stack>
                  </Card>
                  ) : null}
                </>
              ) : null}
            </Stack>
          </SimpleGrid>
          </Stack>
        ) : null}

        {step === 4 ? (
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
          <Button onClick={nextStep} disabled={step === 4 || !canGoNext}>
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
