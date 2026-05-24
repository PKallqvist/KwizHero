import i18next from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
  en: {
    translation: {
      navCreator: "Create quiz",
      navPlay: "Play quiz",
      creatorTitle: "Create quiz draft",
      publish: "Publish",
      shareLink: "Share link",
      joinTitle: "Join quiz",
      nickname: "Nickname",
      start: "Start",
      noQuiz: "Quiz not found",
    },
  },
  sv: {
    translation: {
      navCreator: "Skapa quiz",
      navPlay: "Spela quiz",
      creatorTitle: "Skapa quizutkast",
      publish: "Publicera",
      shareLink: "Dela lank",
      joinTitle: "Ga med i quiz",
      nickname: "Smeknamn",
      start: "Starta",
      noQuiz: "Quiz hittades inte",
    },
  },
};

export const i18n = i18next.createInstance();

i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});
