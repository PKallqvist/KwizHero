import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  PasswordInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { IconAlertCircle, IconSparkles } from "@tabler/icons-react";
import {
  consumeAiToken,
  getCurrentUserTokens,
  seedAiAdminPreviewTokens,
} from "../../../platform/firebase/quizRepository";
import { generateAiQuestion, type AiDifficulty, type AiLanguage, type AiTopicCategory } from "../../../platform/ai/aiGenerator";
import { buildDraftQuestionFromAiResponse, mapAiErrorToI18nKey } from "../aiQuestionMapping";
import type { DraftQuestionInput, QuestionConfig, QuestionType } from "../../../domain/types";

const AI_UNLOCK_STORAGE_KEY = "ai_gen_unlocked";
const AI_LOADING_LABELS = [
  "Consulting the oracle...",
  "Brewing a question...",
  "Digging through the archives...",
];

export interface AiGeneratorApi {
  openAiGenerator: () => void;
}

export function useAiGenerator(params: {
  currentQuestionType: QuestionType | undefined;
  currentQuestionConfig: QuestionConfig | undefined;
  locale: string;
  onApply: (question: DraftQuestionInput) => void;
}): AiGeneratorApi & { renderModals: () => JSX.Element } {
  const { t } = useTranslation();

  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiUnlockModalOpen, setAiUnlockModalOpen] = useState(false);
  const [aiUnlocked, setAiUnlocked] = useState(false);
  const [aiPasswordDraft, setAiPasswordDraft] = useState("");
  const [aiPasswordShake, setAiPasswordShake] = useState(false);
  const [aiTopic, setAiTopic] = useState("");
  const [aiTopicCategory, setAiTopicCategory] = useState<AiTopicCategory>("history");
  const [aiFreePrompt, setAiFreePrompt] = useState("");
  const [aiDifficulty, setAiDifficulty] = useState<AiDifficulty>("medium");
  const [aiQuestionType, setAiQuestionType] = useState<QuestionType>("multiple_choice");
  const [aiLanguage, setAiLanguage] = useState<AiLanguage>("sv");
  const [aiChoiceCount, setAiChoiceCount] = useState(4);
  const [aiCorrectAnswerCount, setAiCorrectAnswerCount] = useState(1);
  const [aiTokenBalance, setAiTokenBalance] = useState<number | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiLoadingLabelIndex, setAiLoadingLabelIndex] = useState(0);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiPreviewQuestion, setAiPreviewQuestion] = useState<DraftQuestionInput | null>(null);
  const [aiPreviewSourceVerified, setAiPreviewSourceVerified] = useState(true);

  const aiPassword = (import.meta.env.VITE_AI_GEN_PASSWORD ?? "").trim();
  const aiPasswordConfigured = aiPassword.length > 0;

  useEffect(() => {
    setAiUnlocked(localStorage.getItem(AI_UNLOCK_STORAGE_KEY) === "true");
  }, []);

  useEffect(() => {
    if (!aiLoading) {
      setAiLoadingLabelIndex(0);
      return;
    }
    const timer = setInterval(() => {
      setAiLoadingLabelIndex((index) => (index + 1) % AI_LOADING_LABELS.length);
    }, 1400);
    return () => clearInterval(timer);
  }, [aiLoading]);

  useEffect(() => {
    setAiCorrectAnswerCount((previous) => Math.max(1, Math.min(previous, aiChoiceCount)));
  }, [aiChoiceCount]);

  async function refreshAiTokenBalance(): Promise<void> {
    try {
      const tokens = await getCurrentUserTokens();
      setAiTokenBalance(tokens.aiTokens);
    } catch {
      setAiTokenBalance(0);
    }
  }

  function openAiGenerator(): void {
    setAiError(null);
    setAiPreviewQuestion(null);
    setAiPreviewSourceVerified(true);
    setAiQuestionType(params.currentQuestionType ?? "multiple_choice");
    setAiLanguage(params.locale === "sv" ? "sv" : "en");
    if (!aiUnlocked) {
      setAiUnlockModalOpen(true);
      return;
    }
    setAiPanelOpen(true);
    void refreshAiTokenBalance();
  }

  async function submitAiUnlock(): Promise<void> {
    if (!aiPasswordConfigured) {
      setAiError(t("creator.questions.aiErrorApiKeyMissing"));
      return;
    }
    if (aiPasswordDraft === aiPassword) {
      try {
        const seeded = await seedAiAdminPreviewTokens(9999);
        setAiTokenBalance(seeded.aiTokens);
      } catch {
        setAiError(t("creator.questions.aiErrorTokenUpdate"));
        return;
      }
      localStorage.setItem(AI_UNLOCK_STORAGE_KEY, "true");
      setAiUnlocked(true);
      setAiUnlockModalOpen(false);
      setAiPasswordDraft("");
      setAiPanelOpen(true);
      void refreshAiTokenBalance();
      return;
    }
    setAiPasswordShake(true);
    window.setTimeout(() => setAiPasswordShake(false), 350);
  }

  async function generateQuestionWithAi(): Promise<void> {
    setAiError(null);
    const topic = aiTopic.trim();
    if (topic.length < 2) {
      setAiError(t("creator.questions.aiErrorInvalidJson"));
      return;
    }

    const currentBalance = aiTokenBalance ?? 0;
    if (currentBalance < 1) {
      setAiError(t("creator.questions.aiNoTokens"));
      return;
    }

    setAiLoading(true);
    setAiPreviewQuestion(null);
    setAiPreviewSourceVerified(true);
    try {
      const response = await generateAiQuestion({
        topic,
        topicCategory: aiTopicCategory,
        freePrompt: aiFreePrompt.trim() || undefined,
        difficulty: aiDifficulty,
        questionType: aiQuestionType,
        language: aiLanguage,
        choiceCount: aiQuestionType === "multiple_choice" ? aiChoiceCount : undefined,
        correctAnswerCount: aiQuestionType === "multiple_choice" ? aiCorrectAnswerCount : undefined,
      });

      const previewQuestion = buildDraftQuestionFromAiResponse({
        questionType: aiQuestionType,
        response,
        config: params.currentQuestionConfig ?? { timerSeconds: null, numericTolerance: null },
      });

      try {
        const tokenUpdate = await consumeAiToken();
        setAiTokenBalance(tokenUpdate.aiTokens);
      } catch {
        setAiError(t("creator.questions.aiErrorTokenUpdate"));
        setAiPreviewQuestion(null);
        return;
      }

      setAiPreviewQuestion(previewQuestion);
      setAiPreviewSourceVerified(response.sourceVerified);
    } catch (error) {
      setAiError(t(mapAiErrorToI18nKey(error)));
    } finally {
      setAiLoading(false);
    }
  }

  function applyAiPreviewQuestion(): void {
    if (!aiPreviewQuestion) return;
    params.onApply(aiPreviewQuestion);
    setAiPanelOpen(false);
  }

  function renderModals(): JSX.Element {
    return (
      <>
        <Modal
          opened={aiUnlockModalOpen}
          onClose={() => setAiUnlockModalOpen(false)}
          title={t("creator.questions.aiUnlockTitle")}
          centered
          size="sm"
        >
          <Stack className={aiPasswordShake ? "kwiz-ai-shake" : undefined}>
            <PasswordInput
              label={t("creator.questions.aiUnlockPassword")}
              value={aiPasswordDraft}
              onChange={(event) => setAiPasswordDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void submitAiUnlock();
                }
              }}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setAiUnlockModalOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={() => void submitAiUnlock()}>{t("creator.questions.aiUnlockAction")}</Button>
            </Group>
          </Stack>
        </Modal>

        <Modal
          opened={aiPanelOpen}
          onClose={() => setAiPanelOpen(false)}
          title={t("creator.questions.generateWithAi")}
          centered
          size="lg"
        >
          <Stack gap="sm">
            <Group justify="space-between" align="center">
              <Text size="sm" c="dimmed">{t("creator.questions.aiPanelSubtitle")}</Text>
              <Badge color={(aiTokenBalance ?? 0) > 0 ? "teal" : "orange"} variant="light">
                {(aiTokenBalance ?? 0) > 0
                  ? t("creator.questions.aiTokensRemaining", { count: aiTokenBalance ?? 0 })
                  : t("creator.questions.aiNoTokens")}
              </Badge>
            </Group>

            <TextInput
              label={t("creator.questions.aiTopic")}
              placeholder={t("creator.questions.aiTopicPlaceholder")}
              value={aiTopic}
              onChange={(event) => setAiTopic(event.currentTarget.value)}
            />

            <Select
              label={t("creator.questions.aiTopicCategory")}
              value={aiTopicCategory}
              data={[
                { value: "history", label: t("creator.questions.aiTopicCategoryHistory") },
                { value: "music", label: t("creator.questions.aiTopicCategoryMusic") },
                { value: "sports", label: t("creator.questions.aiTopicCategorySports") },
                { value: "climate", label: t("creator.questions.aiTopicCategoryClimate") },
                { value: "science", label: t("creator.questions.aiTopicCategoryScience") },
                { value: "geography", label: t("creator.questions.aiTopicCategoryGeography") },
                { value: "culture", label: t("creator.questions.aiTopicCategoryCulture") },
                { value: "politics", label: t("creator.questions.aiTopicCategoryPolitics") },
                { value: "nature", label: t("creator.questions.aiTopicCategoryNature") },
                { value: "technology", label: t("creator.questions.aiTopicCategoryTechnology") },
                { value: "food", label: t("creator.questions.aiTopicCategoryFood") },
                { value: "art", label: t("creator.questions.aiTopicCategoryArt") },
                { value: "custom", label: t("creator.questions.aiTopicCategoryCustom") },
              ]}
              onChange={(value) => setAiTopicCategory((value ?? "history") as AiTopicCategory)}
            />

            <Textarea
              label={t("creator.questions.aiFreePrompt")}
              placeholder={t("creator.questions.aiFreePromptPlaceholder")}
              maxLength={300}
              minRows={2}
              autosize
              value={aiFreePrompt}
              onChange={(event) => setAiFreePrompt(event.currentTarget.value)}
            />

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <SegmentedControl
                fullWidth
                data={[
                  { value: "easy", label: t("creator.questions.aiDifficultyEasy") },
                  { value: "medium", label: t("creator.questions.aiDifficultyMedium") },
                  { value: "hard", label: t("creator.questions.aiDifficultyHard") },
                ]}
                value={aiDifficulty}
                onChange={(value) => setAiDifficulty(value as AiDifficulty)}
              />
              <SegmentedControl
                fullWidth
                data={[
                  { value: "multiple_choice", label: "A/B/C" },
                  { value: "numeric", label: "123" },
                  { value: "letter_order", label: "ABC" },
                ]}
                value={aiQuestionType}
                onChange={(value) => setAiQuestionType(value as QuestionType)}
              />
            </SimpleGrid>

            <Select
              label={t("creator.questions.aiLanguage")}
              data={[
                { value: "sv", label: "Svenska" },
                { value: "en", label: "English" },
              ]}
              value={aiLanguage}
              onChange={(value) => setAiLanguage((value ?? "sv") as AiLanguage)}
            />

            {aiQuestionType === "multiple_choice" ? (
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                <NumberInput
                  label={t("creator.questions.aiChoiceCount")}
                  min={2}
                  max={8}
                  value={aiChoiceCount}
                  onChange={(value) => setAiChoiceCount(typeof value === "number" ? value : 4)}
                />
                <NumberInput
                  label={t("creator.questions.aiCorrectAnswerCount")}
                  min={1}
                  max={aiChoiceCount}
                  value={aiCorrectAnswerCount}
                  onChange={(value) => setAiCorrectAnswerCount(typeof value === "number" ? value : 1)}
                />
              </SimpleGrid>
            ) : null}

            {aiError ? (
              <Alert color="red" variant="light" icon={<IconAlertCircle size={16} />}>
                {aiError}
              </Alert>
            ) : null}

            {aiLoading ? (
              <Paper withBorder radius="md" p="md">
                <Stack align="center" gap="xs">
                  <Loader size="sm" />
                  <Text size="sm">{AI_LOADING_LABELS[aiLoadingLabelIndex]}</Text>
                </Stack>
              </Paper>
            ) : null}

            {aiPreviewQuestion ? (
              <Card withBorder radius="md" p="sm">
                <Stack gap="xs">
                  {!aiPreviewSourceVerified ? (
                    <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
                      {t("creator.questions.aiSourceNotVerified")}
                    </Alert>
                  ) : null}
                  <Text fw={600}>{aiPreviewQuestion.text}</Text>
                  {aiPreviewQuestion.questionType === "multiple_choice" ? (
                    <Stack gap={4}>
                      {aiPreviewQuestion.choices.map((choice, index) => (
                        <Text key={`ai-preview-choice-${index}`} size="sm">
                          {`${index + 1}. ${choice}${aiPreviewQuestion.correctChoiceIndexes.includes(index) ? "  ✓" : ""}`}
                        </Text>
                      ))}
                    </Stack>
                  ) : null}
                  {aiPreviewQuestion.questionType === "numeric" ? (
                    <Text size="sm">{`${t("creator.questions.numericAnswer")}: ${String(aiPreviewQuestion.numericAnswer ?? "")}`}</Text>
                  ) : null}
                  {aiPreviewQuestion.questionType === "letter_order" ? (
                    <Text size="sm">{`${t("creator.questions.letterOrderAnswer")}: ${aiPreviewQuestion.letterOrderAnswer ?? ""}`}</Text>
                  ) : null}
                  {aiPreviewQuestion.sourceUrl ? (
                    <Group gap={6}>
                      <Text size="sm" c="dimmed">{t("creator.questions.aiSource")}</Text>
                      <Anchor href={aiPreviewQuestion.sourceUrl} target="_blank" rel="noopener noreferrer" size="sm">
                        {t("creator.questions.aiOpenSource")}
                      </Anchor>
                    </Group>
                  ) : null}
                </Stack>
              </Card>
            ) : null}

            <Group justify="flex-end">
              <Button variant="default" onClick={() => setAiPanelOpen(false)}>
                {t("common.cancel")}
              </Button>
              {aiPreviewQuestion ? (
                <>
                  <Button
                    variant="light"
                    onClick={() => void generateQuestionWithAi()}
                    disabled={aiLoading || (aiTokenBalance ?? 0) < 1}
                  >
                    {t("creator.questions.aiRegenerate")}
                  </Button>
                  <Button onClick={applyAiPreviewQuestion}>{t("creator.questions.aiUseQuestion")}</Button>
                </>
              ) : (
                <Button
                  leftSection={<IconSparkles size={14} />}
                  onClick={() => void generateQuestionWithAi()}
                  loading={aiLoading}
                  disabled={(aiTokenBalance ?? 0) < 1}
                >
                  {t("creator.questions.aiGenerate")}
                </Button>
              )}
            </Group>
          </Stack>
        </Modal>
      </>
    );
  }

  return { openAiGenerator, renderModals };
}
