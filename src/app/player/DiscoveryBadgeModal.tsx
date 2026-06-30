import { Button, Text, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { BadgeUnlockEvent } from "../../domain/badges";

interface DiscoveryBadgeModalProps {
  event: BadgeUnlockEvent;
  showFirstHint: boolean;
  onDismiss: () => void;
}

export function DiscoveryBadgeModal({ event, showFirstHint, onDismiss }: DiscoveryBadgeModalProps): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="kwiz-discovery-overlay" role="dialog" aria-modal="true">
      <div className="kwiz-discovery-shell">
        <Text className="kwiz-discovery-label">{t("player.discoveryLabel")}</Text>
        <div className="kwiz-discovery-icon" aria-hidden="true">
          🌙
        </div>
        <Title order={2} className="kwiz-discovery-title">
          {event.displayName}
        </Title>
        <Text className="kwiz-discovery-text">{event.flavourText}</Text>
        <Button className="kwiz-discovery-cta" onClick={onDismiss}>
          {t("player.badgeKeepGoing")}
        </Button>
        {showFirstHint ? <Text className="kwiz-discovery-hint">{t("player.discoveryFirstHint")}</Text> : null}
      </div>
    </div>
  );
}
