import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Image, Text, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { getUserQuizzes } from "../../platform/firebase/quizRepository";
import type { QuizListItem } from "../../domain/types";

export function LandingPage(): JSX.Element {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [quizzes, setQuizzes] = useState<QuizListItem[]>([]);

  useEffect(() => {
    let mounted = true;

    async function loadLandingState(): Promise<void> {
      setLoading(true);
      try {
        const ownQuizzes = await getUserQuizzes();
        if (!mounted) return;
        setQuizzes(ownQuizzes);
      } catch {
        if (!mounted) return;
        setQuizzes([]);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }

    loadLandingState().catch(() => {
      if (!mounted) return;
      setLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, []);

  const isReturningPlayer = quizzes.length > 0;
  const publishedQuizzes = quizzes.filter((quiz) => quiz.status === "published");
  const playCtaTarget = "/quizzes";

  if (loading) {
    return (
      <section className="landing-native-page" aria-busy="true" aria-live="polite">
        <div className="landing-loading-shell">
          <Image
            src="/branding/kwizherologo.png"
            alt="KwizHero logo"
            className="landing-native-logo"
            fit="contain"
            fallbackSrc="/robots.txt"
          />
        </div>
      </section>
    );
  }

  return (
    <section className="landing-native-page">
      <div className="landing-native-content">
        <Image
          src="/branding/kwizherologo.png"
          alt="KwizHero logo"
          className="landing-native-logo"
          fit="contain"
          fallbackSrc="/robots.txt"
        />

        <div className="landing-native-main">
          {!isReturningPlayer ? (
            <>
              <Text className="landing-tagline">{t("landing.tagline")}</Text>
              <Title order={1} className="landing-headline">
                {t("landing.titleStart")}
                <span className="landing-headline-accent"> {t("landing.titleAccent")}</span>
                {t("landing.titleEnd")}
              </Title>
              <Text className="landing-subtext">{t("landing.subtitle")}</Text>

              <div className="landing-feature-pills" aria-hidden="true">
                <span>{t("landing.pillWaypoints")}</span>
                <span>{t("landing.pillCards")}</span>
                <span>{t("landing.pillShare")}</span>
              </div>
            </>
          ) : (
            <div className="landing-welcome-strip">
              <div className="landing-welcome-avatar">KH</div>
              <div>
                <Text className="landing-welcome-title">{t("landing.welcomeBack")}</Text>
                <Text className="landing-welcome-meta">⚡ 1 240 XP · 🔥 7 day streak</Text>
              </div>
            </div>
          )}

          <div className="landing-cta-stack">
            <Button component={Link} to={playCtaTarget} className="landing-cta-primary">
              {t("landing.playCta")}
            </Button>
            <Button component={Link} to="/create" className="landing-cta-secondary" variant="outline">
              {t("landing.createCta")}
            </Button>
          </div>

          {isReturningPlayer && publishedQuizzes.length > 0 ? (
            <div className="landing-my-quizzes">
              <Text className="landing-my-quizzes-label">{t("landing.myQuizzesLabel")}</Text>
              <div className="landing-my-quizzes-list">
                {publishedQuizzes.map((quiz) => (
                  <Link key={quiz.id} to={`/play/${quiz.id}`} className="landing-quiz-card">
                    <div>
                      <Text className="landing-quiz-title">{quiz.title}</Text>
                      <Text className="landing-quiz-subtitle">
                        {quiz.waypointCount} {t("landing.waypoints")}
                        {" · "}
                        {(quiz.routeDistanceKm ?? 0).toFixed(1)} km
                      </Text>
                    </div>
                    <Text className="landing-quiz-play">{t("landing.playLabel")}</Text>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
