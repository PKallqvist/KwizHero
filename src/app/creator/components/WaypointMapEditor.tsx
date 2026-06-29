import { Fragment, useEffect } from "react";
import { latLngBounds } from "leaflet";
import { Circle, CircleMarker, MapContainer, Polyline, TileLayer, Tooltip as LeafletTooltip, useMap, useMapEvents } from "react-leaflet";
import { kwizTokens } from "../../../platform/theme/kwizTokens";
import type { DraftWaypointInput, RouteMode } from "../../../domain/types";

type RoutePreviewMode = RouteMode;

export function buildAnchoredManualLegPoints(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  storedPoints: Array<{ lat: number; lng: number }>
): Array<{ lat: number; lng: number }> {
  if (storedPoints.length === 0) {
    return [from, to];
  }
  if (storedPoints.length === 1) {
    return [from, storedPoints[0], to];
  }
  return [from, ...storedPoints.slice(1, -1), to];
}

export interface WaypointPickerProps {
  waypoints: DraftWaypointInput[];
  selectedWaypointIndex: number;
  radius: number;
  orderedRoute: boolean;
  legModes: RoutePreviewMode[];
  legCoordinates: Array<Array<{ lat: number; lng: number }>>;
  drawingLegIndex: number | null;
  drawingLegPoints: Array<{ lat: number; lng: number }>;
  mapHeightClassName: string;
  viewport: { lat: number; lng: number; zoom: number } | null;
  userViewportControlled: boolean;
  onViewportChange: (viewport: { lat: number; lng: number; zoom: number }) => void;
  onUserViewportControl: () => void;
  onChange: (lat: number, lng: number) => void;
  onDrawPointAdd: (lat: number, lng: number) => void;
}

export function WaypointPicker(props: WaypointPickerProps): JSX.Element {
  const fallbackCenter = props.waypoints[props.selectedWaypointIndex] ?? props.waypoints[0] ?? { lat: 57.7089, lng: 11.9746 };
  const selectedWaypoint = props.waypoints[props.selectedWaypointIndex] ?? null;

  function ClickCapture(): null {
    useMapEvents({
      click(event) {
        if (props.drawingLegIndex !== null) {
          props.onDrawPointAdd(event.latlng.lat, event.latlng.lng);
          return;
        }
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
      className={`kwiz-map-container ${props.mapHeightClassName}`}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitWaypointsBounds waypoints={props.waypoints} enabled={props.viewport === null} />
      <EnsureSelectedWaypointVisible waypoint={selectedWaypoint} enabled={!props.userViewportControlled} />
      <TrackMapViewport onViewportChange={props.onViewportChange} onUserInteraction={props.onUserViewportControl} />
      {props.orderedRoute && props.waypoints.length > 1 ? (
        <>
          {props.waypoints.slice(0, -1).map((waypoint, index) => {
            const next = props.waypoints[index + 1];
            if (!next) return null;
            const legMode = props.legModes[index] ?? "crow";
            if (legMode === "none") return null;
            const savedManualPath = legMode === "manual" ? props.legCoordinates[index] ?? [] : [];
            const drawPreviewPath =
              props.drawingLegIndex === index
                ? [
                    { lat: waypoint.lat, lng: waypoint.lng },
                    ...props.drawingLegPoints,
                    { lat: next.lat, lng: next.lng },
                  ]
                : [];
            const anchoredManualPath = buildAnchoredManualLegPoints(
              { lat: waypoint.lat, lng: waypoint.lng },
              { lat: next.lat, lng: next.lng },
              savedManualPath
            );
            const legPathPoints =
              drawPreviewPath.length >= 2
                ? drawPreviewPath
                : savedManualPath.length >= 2
                  ? anchoredManualPath
                  : [
                      { lat: waypoint.lat, lng: waypoint.lng },
                      { lat: next.lat, lng: next.lng },
                    ];
            const legPathOptions =
              legMode === "urban"
                ? { color: "#2f9e44", weight: 3, opacity: 0.8 }
                : legMode === "hiking"
                  ? { color: "#f08c00", weight: 3, opacity: 0.8, dashArray: "7 5" }
                  : legMode === "manual"
                    ? { color: "#c92a2a", weight: 3, opacity: 0.8, dashArray: "10 6" }
                    : { color: kwizTokens.map.routePath, weight: 3, opacity: 0.65 };
            return (
              <Polyline
                key={`route-segment-${index}`}
                positions={legPathPoints.map((point) => [point.lat, point.lng] as [number, number])}
                pathOptions={legPathOptions}
              />
            );
          })}
          {props.waypoints.slice(0, -1).map((waypoint, index) => {
            const next = props.waypoints[index + 1];
            if (!next) return null;
            const legMode = props.legModes[index] ?? "crow";
            if (legMode === "none") return null;
            const legColor =
              legMode === "urban"
                ? "#2f9e44"
                : legMode === "hiking"
                  ? "#f08c00"
                  : legMode === "manual"
                    ? "#c92a2a"
                    : kwizTokens.map.routePath;
            const legMarker = legMode === "urban" ? "U" : legMode === "hiking" ? "H" : legMode === "manual" ? "M" : "➜";
            return (
              <CircleMarker
                key={`route-arrow-${index}`}
                center={[(waypoint.lat + next.lat) / 2, (waypoint.lng + next.lng) / 2]}
                radius={2}
                pathOptions={{ color: legColor, fillColor: legColor, fillOpacity: 0 }}
              >
                <LeafletTooltip permanent direction="center" offset={[0, 0]}>{legMarker}</LeafletTooltip>
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
              pathOptions={{
                color: isSelected ? kwizTokens.map.selectedWaypoint : kwizTokens.map.waypointMuted,
                fillOpacity: isSelected ? 0.2 : 0.1,
              }}
            />
            <CircleMarker
              center={[waypoint.lat, waypoint.lng]}
              radius={isSelected ? 8 : 6}
              pathOptions={{
                color: isSelected ? kwizTokens.map.selectedWaypoint : kwizTokens.map.waypointMuted,
                fillColor: isSelected ? kwizTokens.map.selectedWaypoint : kwizTokens.map.waypointDefault,
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
                pathOptions={{ color: kwizTokens.map.startFlag, fillColor: kwizTokens.map.startFlag, fillOpacity: 0 }}
              >
                <LeafletTooltip permanent direction="bottom" offset={[0, 10]}>START</LeafletTooltip>
              </CircleMarker>
            ) : null}
            {props.orderedRoute && isLast && props.waypoints.length > 1 ? (
              <CircleMarker
                center={[waypoint.lat, waypoint.lng]}
                radius={1}
                pathOptions={{ color: kwizTokens.map.endFlag, fillColor: kwizTokens.map.endFlag, fillOpacity: 0 }}
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

function EnsureSelectedWaypointVisible({ waypoint, enabled = true }: { waypoint: DraftWaypointInput | null; enabled?: boolean }): null {
  const map = useMap();

  useEffect(() => {
    if (!enabled) return;
    if (!waypoint) return;

    const target: [number, number] = [waypoint.lat, waypoint.lng];
    map.panTo(target, { animate: true, duration: 0.35 });
  }, [enabled, map, waypoint, waypoint?.lat, waypoint?.lng]);

  return null;
}

function TrackMapViewport({
  onViewportChange,
  onUserInteraction,
}: {
  onViewportChange: (viewport: { lat: number; lng: number; zoom: number }) => void;
  onUserInteraction: () => void;
}): null {
  const map = useMap();

  useEffect(() => {
    const reportViewport = () => {
      const center = map.getCenter();
      onViewportChange({ lat: center.lat, lng: center.lng, zoom: map.getZoom() });
    };

    reportViewport();
    map.on("moveend", reportViewport);
    map.on("zoomend", reportViewport);

    return () => {
      map.off("moveend", reportViewport);
      map.off("zoomend", reportViewport);
    };
  }, [map, onViewportChange]);

  useEffect(() => {
    const container = map.getContainer();
    const reportInteraction = () => onUserInteraction();

    container.addEventListener("wheel", reportInteraction, { passive: true });
    container.addEventListener("mousedown", reportInteraction);
    container.addEventListener("touchstart", reportInteraction, { passive: true });

    return () => {
      container.removeEventListener("wheel", reportInteraction);
      container.removeEventListener("mousedown", reportInteraction);
      container.removeEventListener("touchstart", reportInteraction);
    };
  }, [map, onUserInteraction]);

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
