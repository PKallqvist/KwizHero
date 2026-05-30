import { Suspense, lazy, useState } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, Group, Loader, Modal, Text, useMantineColorScheme } from "@mantine/core";
import {
  IconBooks,
  IconHome2,
  IconLanguage,
  IconMapPin,
  IconMenu2,
  IconMoonStars,
  IconPlus,
  IconTrophy,
  IconUser,
  IconX,
} from "@tabler/icons-react";
import { QuizSessionProvider, useQuizSession } from "./platform/context/QuizSessionContext";

const CreateQuizPage = lazy(async () => {
  const module = await import("./app/creator/CreateQuizPage");
  return { default: module.CreateQuizPage };
});

const PlayQuizPage = lazy(async () => {
  const module = await import("./app/player/PlayQuizPage");
  return { default: module.PlayQuizPage };
});

const QuizBrowsePage = lazy(async () => {
  const module = await import("./app/player/QuizBrowsePage");
  return { default: module.QuizBrowsePage };
});

const LandingPage = lazy(async () => {
  const module = await import("./app/landing/LandingPage");
  return { default: module.LandingPage };
});

const UserQuizzesPage = lazy(async () => {
  const module = await import("./app/user/UserQuizzesPage");
  return { default: module.UserQuizzesPage };
});

const PlayerProfilePage = lazy(async () => {
  const module = await import("./app/player/PlayerProfilePage");
  return { default: module.PlayerProfilePage };
});

function BottomBarAndDrawer(): JSX.Element {
  const { t, i18n } = useTranslation();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const { session, profile } = useQuizSession();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmAbandon, setConfirmAbandon] = useState(false);

  const quizActive = session !== null;

  function closeDrawer(): void {
    setDrawerOpen(false);
  }

  function navigateTo(path: string): void {
    navigate(path);
    closeDrawer();
  }

  return (
    <>
      {/* Persistent bottom bar */}
      <div className={`kwiz-bottom-bar${quizActive ? " is-quiz-active" : ""}`}>
        {quizActive ? (
          <div className="kwiz-bar-quiz-info">
            <span className="kwiz-bar-pulse-dot" aria-hidden="true" />
            <div>
              <span className="kwiz-bar-quiz-label">{t("player.quizInProgress")}</span>
              <span className="kwiz-bar-quiz-sub">{session.progressLabel}</span>
            </div>
          </div>
        ) : (
          <>
            <span className="kwiz-wordmark" aria-label="KwizHero">
              <span className="kwiz-wordmark-kwiz">Kwiz</span>
              <span className="kwiz-wordmark-hero">Hero</span>
            </span>
            <div className="kwiz-bar-chips">
              <span className="kwiz-xp-chip">⚡ {profile.xpTotal.toLocaleString("sv-SE")}</span>
              <span className="kwiz-streak-chip">🔥 {profile.streakDays}</span>
            </div>
          </>
        )}
        <button
          type="button"
          className={`kwiz-hamburger-btn${quizActive ? " is-quiz-active" : ""}`}
          onClick={() => setDrawerOpen(true)}
          aria-label={t("player.menu")}
        >
          <IconMenu2 size={18} color="white" />
        </button>
      </div>

      {/* Slide-up drawer */}
      {drawerOpen && (
        <div
          className="kwiz-drawer-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={closeDrawer}
          onKeyDown={(e) => {
            if (e.key === "Escape") closeDrawer();
          }}
          tabIndex={-1}
        >
          <div className="kwiz-drawer-panel" onClick={(e) => e.stopPropagation()}>
            <div className="kwiz-drawer-handle" aria-hidden="true" />

            {quizActive ? (
              <>
                <div className="kwiz-drawer-toggle-row">
                  <div className="kwiz-drawer-toggle-left">
                    <IconLanguage size={20} className="kwiz-drawer-icon" />
                    <span className="kwiz-drawer-label">
                      {i18n.language === "en" ? "Svenska" : "English"}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`kwiz-toggle-pill${i18n.language === "sv" ? " is-on" : ""}`}
                    onClick={() => i18n.changeLanguage(i18n.language === "en" ? "sv" : "en")}
                    aria-label={t("player.toggleLanguage")}
                    aria-pressed={i18n.language === "sv"}
                  />
                </div>
                <div className="kwiz-drawer-toggle-row">
                  <div className="kwiz-drawer-toggle-left">
                    <IconMoonStars size={20} className="kwiz-drawer-icon" />
                    <span className="kwiz-drawer-label">{t("player.darkMode")}</span>
                  </div>
                  <button
                    type="button"
                    className={`kwiz-toggle-pill${colorScheme === "dark" ? " is-on" : ""}`}
                    onClick={() => setColorScheme(colorScheme === "dark" ? "light" : "dark")}
                    aria-label={t("player.toggleDarkMode")}
                    aria-pressed={colorScheme === "dark"}
                  />
                </div>
                <button
                  type="button"
                  className="kwiz-drawer-item is-danger"
                  onClick={() => {
                    closeDrawer();
                    setConfirmAbandon(true);
                  }}
                >
                  <IconX size={20} className="kwiz-drawer-icon" />
                  <div>
                    <span className="kwiz-drawer-label">{t("player.abandonQuiz")}</span>
                    <span className="kwiz-drawer-sublabel">{t("player.abandonSubLabel")}</span>
                  </div>
                </button>
              </>
            ) : (
              <>
                <button type="button" className="kwiz-drawer-item" onClick={() => navigateTo("/")}>
                  <IconHome2 size={20} className="kwiz-drawer-icon" />
                  <span className="kwiz-drawer-label">{t("nav.home")}</span>
                </button>
                <button type="button" className="kwiz-drawer-item" onClick={() => navigateTo("/my-quizzes")}>
                  <IconBooks size={20} className="kwiz-drawer-icon" />
                  <span className="kwiz-drawer-label">{t("nav.myQuizzes")}</span>
                </button>
                <button type="button" className="kwiz-drawer-item" onClick={() => navigateTo("/quizzes")}>
                  <IconMapPin size={20} className="kwiz-drawer-icon" />
                  <span className="kwiz-drawer-label">{t("nav.play")}</span>
                </button>
                <button type="button" className="kwiz-drawer-item" onClick={() => navigateTo("/profile")}>
                  <IconUser size={20} className="kwiz-drawer-icon" />
                  <span className="kwiz-drawer-label">{t("nav.profile")}</span>
                </button>
                <button type="button" className="kwiz-drawer-item" onClick={() => navigateTo("/create")}>
                  <IconPlus size={20} className="kwiz-drawer-icon" />
                  <span className="kwiz-drawer-label">{t("nav.creator")}</span>
                </button>
                <div className="kwiz-drawer-item is-coming-soon" aria-disabled="true">
                  <IconTrophy size={20} className="kwiz-drawer-icon" />
                  <div>
                    <span className="kwiz-drawer-label">{t("player.leaderboardItem")}</span>
                    <span className="kwiz-drawer-sublabel">{t("player.comingSoon")}</span>
                  </div>
                </div>
                <div className="kwiz-drawer-toggle-row">
                  <div className="kwiz-drawer-toggle-left">
                    <IconLanguage size={20} className="kwiz-drawer-icon" />
                    <span className="kwiz-drawer-label">
                      {i18n.language === "en" ? "Svenska" : "English"}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`kwiz-toggle-pill${i18n.language === "sv" ? " is-on" : ""}`}
                    onClick={() => i18n.changeLanguage(i18n.language === "en" ? "sv" : "en")}
                    aria-label={t("player.toggleLanguage")}
                    aria-pressed={i18n.language === "sv"}
                  />
                </div>
                <div className="kwiz-drawer-toggle-row">
                  <div className="kwiz-drawer-toggle-left">
                    <IconMoonStars size={20} className="kwiz-drawer-icon" />
                    <span className="kwiz-drawer-label">{t("player.darkMode")}</span>
                  </div>
                  <button
                    type="button"
                    className={`kwiz-toggle-pill${colorScheme === "dark" ? " is-on" : ""}`}
                    onClick={() => setColorScheme(colorScheme === "dark" ? "light" : "dark")}
                    aria-label={t("player.toggleDarkMode")}
                    aria-pressed={colorScheme === "dark"}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Abandon quiz confirmation */}
      <Modal
        opened={confirmAbandon}
        onClose={() => setConfirmAbandon(false)}
        title={t("player.abandonTitle")}
        centered
        size="sm"
        zIndex={3000}
      >
        <Text size="sm">{t("player.abandonBody")}</Text>
        <Group mt="md" justify="flex-end">
          <Button variant="light" onClick={() => setConfirmAbandon(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            color="red"
            onClick={() => {
              navigate("/");
              setConfirmAbandon(false);
              closeDrawer();
            }}
          >
            {t("player.abandonConfirm")}
          </Button>
        </Group>
      </Modal>
    </>
  );
}

export function App(): JSX.Element {
  const location = useLocation();
  const isPlayRoute = location.pathname.startsWith("/play/");
  const isLandingRoute = location.pathname === "/";

  return (
    <QuizSessionProvider>
      <div className="kwiz-app-root">
        <div className={isPlayRoute ? "kwiz-play-layout" : isLandingRoute ? "kwiz-landing-layout" : "kwiz-standard-layout"}>
          <Suspense fallback={<Group justify="center" mt="xl"><Loader /><Text>Loading…</Text></Group>}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/create" element={<CreateQuizPage />} />
              <Route path="/quizzes" element={<QuizBrowsePage />} />
              <Route path="/play/:quizId" element={<PlayQuizPage />} />
              <Route path="/my-quizzes" element={<UserQuizzesPage />} />
              <Route path="/profile" element={<PlayerProfilePage />} />
            </Routes>
          </Suspense>
        </div>
        <BottomBarAndDrawer />
      </div>
    </QuizSessionProvider>
  );
}
