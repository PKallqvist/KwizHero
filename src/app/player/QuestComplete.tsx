import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, Text, Title } from "@mantine/core";

const QUEST_TONE = {
  headline: "Quest Complete!",
  accent: "#EF9F27",
  icon: "🏆",
  tierPhrases: {
    perfect: "Flawless!",
    great: "Excellent!",
    good: "Well done!",
    low: "Keep exploring!",
  },
};

type CelebrationStep = "arrival" | "journey" | "score" | "cta";

interface QuestCompleteProps {
  quizTitle: string;
  revealMode: "instant" | "on_completion" | "scheduled";
  correctCount: number;
  totalQuestions: number;
  waypointsVisited: number;
  totalWaypoints: number;
  xpEarned: number;
  streak: number;
  distanceKm: number;
  onDismiss: () => void;
}

function useCountUp(target: number, durationMs: number, active: boolean): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) { setValue(0); return; }
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const elapsed = Math.min(now - start, durationMs);
      const progress = elapsed / durationMs;
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (elapsed < durationMs) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, active]);
  return value;
}

function getTierPhrase(percent: number): string {
  if (percent >= 100) return QUEST_TONE.tierPhrases.perfect;
  if (percent >= 80) return QUEST_TONE.tierPhrases.great;
  if (percent >= 60) return QUEST_TONE.tierPhrases.good;
  return QUEST_TONE.tierPhrases.low;
}

export function QuestComplete(props: QuestCompleteProps): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const showScore = props.revealMode !== "scheduled";
  const steps: CelebrationStep[] = showScore
    ? ["arrival", "journey", "score", "cta"]
    : ["arrival", "journey", "cta"];

  const [stepIndex, setStepIndex] = useState(0);
  const currentStep = steps[stepIndex] ?? "cta";

  function advance(): void {
    if (stepIndex < steps.length - 1) {
      setStepIndex((prev) => prev + 1);
    }
  }

  const confettiParticles = useMemo(() => {
    const palette = ["#F6C453", "#1D4ED8", "#34d399", "#f472b6", "#c084fc"];
    return Array.from({ length: 36 }).map((_, i) => ({
      id: `confetti-${i}`,
      left: Math.random() * 100,
      size: 4 + Math.random() * 4,
      delay: Math.random() * 160,
      duration: 1800 + Math.random() * 1400,
      drift: -30 + Math.random() * 60,
      rotate: -220 + Math.random() * 440,
      color: palette[Math.floor(Math.random() * palette.length)] ?? "#F6C453",
    }));
  }, []);

  const animatedCorrect = useCountUp(props.correctCount, 1200, currentStep === "score");
  const animatedXp = useCountUp(props.xpEarned, 800, currentStep === "arrival");
  const percent = props.totalQuestions > 0 ? Math.round((props.correctCount / props.totalQuestions) * 100) : 0;

  const waypointDots = useMemo(() => {
    const count = Math.max(props.totalWaypoints, 3);
    const dots: Array<{ cx: number; cy: number; filled: boolean }> = [];
    for (let i = 0; i < count; i++) {
      const progress = i / (count - 1);
      const cx = 40 + progress * 220;
      const cy = 80 + Math.sin(progress * Math.PI * 1.5) * 40;
      dots.push({ cx, cy, filled: i < props.waypointsVisited });
    }
    return dots;
  }, [props.totalWaypoints, props.waypointsVisited]);

  const pathD = waypointDots.map((d, i) => `${i === 0 ? "M" : "L"} ${d.cx} ${d.cy}`).join(" ");

  return (
    <div className="kwiz-quest-root">
      {/* ── ARRIVAL ── */}
      {currentStep === "arrival" ? (
        <div className="kwiz-quest-step kwiz-quest-arrival" onClick={advance}>
          <div className="kwiz-completion-hero">
            <span className="kwiz-completion-glow kwiz-quest-glow" aria-hidden="true" />
            {confettiParticles.map((p) => (
              <span
                key={p.id}
                className="kwiz-completion-confetti"
                style={{
                  left: `${p.left}%`,
                  width: `${p.size}px`,
                  height: `${p.size}px`,
                  backgroundColor: p.color,
                  animationDelay: `${p.delay}ms`,
                  animationDuration: `${p.duration}ms`,
                  ["--kwiz-confetti-drift" as string]: `${p.drift}px`,
                  ["--kwiz-confetti-rotate" as string]: `${p.rotate}deg`,
                }}
                aria-hidden="true"
              />
            ))}
            <div className="kwiz-quest-icon-ring">
              <span className="kwiz-completion-icon">{QUEST_TONE.icon}</span>
            </div>
          </div>

          <Title order={1} className="kwiz-quest-headline kwiz-completion-enter delay-1">
            {QUEST_TONE.headline}
          </Title>
          <Text className="kwiz-quest-quiz-name kwiz-completion-enter delay-2">
            {props.quizTitle}
          </Text>
          <div className="kwiz-quest-xp-pill kwiz-completion-enter delay-3">
            ⚡ +{animatedXp.toLocaleString("sv-SE")} XP
          </div>

          <Button variant="subtle" className="kwiz-quest-continue" onClick={advance}>
            {t("quest.continue")}
          </Button>
        </div>
      ) : null}

      {/* ── JOURNEY ── */}
      {currentStep === "journey" ? (
        <div className="kwiz-quest-step kwiz-quest-journey" onClick={advance}>
          <Text className="kwiz-quest-section-label kwiz-completion-enter">
            {t("quest.theJourney")}
          </Text>

          <div className="kwiz-quest-map">
            <svg viewBox="0 0 300 200" className="kwiz-quest-path-svg">
              <path
                d={pathD}
                fill="none"
                stroke="var(--kwiz-gold)"
                strokeWidth="2.5"
                strokeDasharray="8 6"
                className="kwiz-quest-path-line"
              />
              {waypointDots.map((dot, i) => (
                <circle
                  key={`wp-${i}`}
                  cx={dot.cx}
                  cy={dot.cy}
                  r={i === waypointDots.length - 1 ? 8 : 5}
                  fill={dot.filled ? "var(--kwiz-gold)" : "var(--kwiz-border-subtle)"}
                  className="kwiz-quest-waypoint-dot"
                  style={{ animationDelay: `${300 + i * 200}ms` }}
                />
              ))}
              {waypointDots.length > 0 ? (
                <text
                  x={waypointDots[waypointDots.length - 1].cx}
                  y={waypointDots[waypointDots.length - 1].cy - 14}
                  textAnchor="middle"
                  fill="var(--kwiz-gold)"
                  fontSize="16"
                  className="kwiz-quest-x-mark"
                >
                  ✕
                </text>
              ) : null}
            </svg>
          </div>

          <div className="kwiz-quest-journey-stats kwiz-completion-enter delay-1">
            <div className="kwiz-quest-journey-stat">
              <span className="kwiz-quest-journey-stat-value">{props.waypointsVisited}</span>
              <span className="kwiz-quest-journey-stat-label">{t("quest.waypointsVisited")}</span>
            </div>
            <div className="kwiz-quest-journey-stat">
              <span className="kwiz-quest-journey-stat-value">{props.totalQuestions}</span>
              <span className="kwiz-quest-journey-stat-label">{t("quest.questionsAnswered")}</span>
            </div>
            <div className="kwiz-quest-journey-stat">
              <span className="kwiz-quest-journey-stat-value">{props.distanceKm.toFixed(1)}</span>
              <span className="kwiz-quest-journey-stat-label">{t("quest.kmWalked")}</span>
            </div>
          </div>

          <Button variant="subtle" className="kwiz-quest-continue" onClick={advance}>
            {t("quest.continue")}
          </Button>
        </div>
      ) : null}

      {/* ── SCORE ── */}
      {currentStep === "score" ? (
        <div className="kwiz-quest-step kwiz-quest-score" onClick={advance}>
          <Text className="kwiz-quest-section-label kwiz-completion-enter">
            {t("quest.yourScore")}
          </Text>

          <div className="kwiz-quest-score-display kwiz-completion-enter delay-1">
            <span className="kwiz-quest-score-number">{animatedCorrect}</span>
            <span className="kwiz-quest-score-divider">/</span>
            <span className="kwiz-quest-score-total">{props.totalQuestions}</span>
          </div>

          <div className="kwiz-quest-score-percent kwiz-completion-enter delay-2">
            {percent}%
          </div>

          <Title order={3} className="kwiz-quest-tier-phrase kwiz-completion-enter delay-3">
            {getTierPhrase(percent)}
          </Title>

          <div className="kwiz-quest-streak kwiz-completion-enter delay-3">
            🔥 {props.streak} {t("quest.streak")}
          </div>

          <Button variant="subtle" className="kwiz-quest-continue" onClick={advance}>
            {t("quest.continue")}
          </Button>
        </div>
      ) : null}

      {/* ── CTA ── */}
      {currentStep === "cta" ? (
        <div className="kwiz-quest-step kwiz-quest-cta">
          <div className="kwiz-quest-icon-ring kwiz-quest-cta-icon">
            <span className="kwiz-completion-icon">🗺️</span>
          </div>

          <Title order={3} className="kwiz-quest-cta-title kwiz-completion-enter delay-1">
            {t("quest.whatsNext")}
          </Title>

          <div className="kwiz-completion-cta-stack kwiz-completion-enter delay-2">
            <Button
              className="kwiz-completion-primary is-instant"
              onClick={() => navigate("/quizzes")}
            >
              {t("quest.playAnother")}
            </Button>
            <Button
              variant="outline"
              className="kwiz-completion-secondary"
              onClick={props.onDismiss}
            >
              {t("quest.backToHome")}
            </Button>
            {typeof navigator.share === "function" ? (
              <Button
                variant="subtle"
                onClick={() => {
                  void navigator.share({
                    title: `${props.quizTitle} — KwizHero`,
                    text: `I completed ${props.quizTitle} on KwizHero!`,
                    url: window.location.href,
                  });
                }}
              >
                {t("quest.share")}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
