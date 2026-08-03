import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent
} from "react";
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  hexPolygonPoints
} from "../game/hex";
import { BOARD_BY_ID, BOARD_CELLS } from "../game/scenario";
import type {
  HexId,
  LineOfSightResult,
  Locale,
  Unit,
  UnitKind
} from "../game/types";
import { translate } from "../i18n";

interface Camera {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

interface DragStart {
  pointer: Point;
  camera: Camera;
}

interface PinchStart {
  distance: number;
  midpoint: Point;
  camera: Camera;
}

interface GameBoardProps {
  locale: Locale;
  units: Unit[];
  activeSide: Unit["side"];
  selectedUnitIds: string[];
  targetUnitId: string | null;
  inspectedHexId: HexId | null;
  legalMoves: Set<HexId>;
  lineOfSights: LineOfSightResult[];
  retreatOrigin: HexId | null;
  retreatDestinations: HexId[];
  selectedRetreatDestination: HexId | null;
  pursuitDestination: HexId | null;
  pursuitUnitIds: string[];
  selectedPursuitUnitId: string | null;
  helpText?: string;
  onHexActivate: (id: HexId) => void;
}

const LANDSCAPE_BOARD_QUERY =
  "(hover: hover) and (pointer: fine) and (min-width: 700px), " +
  "(orientation: landscape) and (min-width: 700px) and (min-height: 500px)";

function prefersLandscapeBoard(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(LANDSCAPE_BOARD_QUERY).matches
  );
}

function getBoardDimensions(landscape: boolean): Point {
  return landscape
    ? { x: MAP_HEIGHT, y: MAP_WIDTH }
    : { x: MAP_WIDTH, y: MAP_HEIGHT };
}

function getFullCamera(landscape: boolean): Camera {
  const dimensions = getBoardDimensions(landscape);
  return {
    x: 0,
    y: 0,
    width: dimensions.x,
    height: dimensions.y
  };
}

function clampCamera(camera: Camera, landscape: boolean): Camera {
  const dimensions = getBoardDimensions(landscape);
  const width = Math.min(
    dimensions.x,
    Math.max(dimensions.x / 4, camera.width)
  );
  const height = (width / dimensions.x) * dimensions.y;
  return {
    width,
    height,
    x: Math.min(dimensions.x - width, Math.max(0, camera.x)),
    y: Math.min(dimensions.y - height, Math.max(0, camera.y))
  };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function UnitGlyph({ kind }: { kind: UnitKind }) {
  if (kind === "artillery") {
    return (
      <g className="unit-glyph">
        <circle cx="42" cy="40" r="12" fill="none" stroke="currentColor" strokeWidth="4" />
        <circle cx="42" cy="40" r="3" />
        <path d="M20 30h29l17-9 2 5-17 11H20z" />
      </g>
    );
  }

  if (kind === "cavalry" || kind === "lightCavalry") {
    return (
      <g className="unit-glyph">
        <path d="M25 51c2-15 9-25 23-27l8-8 8 3-3 10c7 5 7 14 1 20l-8-5-6 10H35l-3-10z" />
        <circle cx="41" cy="16" r="5" />
        <path d="M37 21l7 16M50 27l-8 12" fill="none" stroke="currentColor" strokeWidth="4" />
      </g>
    );
  }

  const count = kind === "lightInfantry" ? 2 : 3;
  return (
    <g className="unit-glyph">
      {Array.from({ length: count }, (_, index) => {
        const x = 31 + index * 11;
        return (
          <g key={x}>
            <circle cx={x} cy="26" r="5" />
            <path
              d={`M${x} 32v22M${x - 6} 39l6-5 6 5M${x} 54l-5 10M${x} 54l5 10`}
              fill="none"
              stroke="currentColor"
              strokeWidth="3.4"
              strokeLinecap="round"
            />
          </g>
        );
      })}
    </g>
  );
}

function Counter({
  unit,
  selected,
  active,
  selectionIndex,
  retreating,
  pursuitCandidate,
  pursuitSelected,
  landscape
}: {
  unit: Unit;
  selected: boolean;
  active: boolean;
  selectionIndex?: number;
  retreating: boolean;
  pursuitCandidate: boolean;
  pursuitSelected: boolean;
  landscape: boolean;
}) {
  if (!unit.hexId) return null;
  const cell = BOARD_BY_ID.get(unit.hexId);
  if (!cell) return null;
  const counterRotation =
    (landscape ? -90 : 0) + (unit.status === "disordered" ? 90 : 0);
  const transform = `translate(${cell.center.x - 42} ${cell.center.y - 42}) rotate(${counterRotation} 42 42)`;

  return (
    <g
      className={[
        "counter",
        `counter--${unit.side}`,
        selected ? "is-selected" : "",
        selectionIndex === 1 ? "is-supporting" : "",
        retreating ? "is-retreating" : "",
        pursuitCandidate ? "is-pursuit-candidate" : "",
        pursuitSelected ? "is-pursuit-selected" : "",
        active ? "is-active-side" : "",
        unit.status === "disordered" ? "is-disordered" : ""
      ].join(" ")}
      transform={transform}
      pointerEvents="none"
      data-unit-id={unit.id}
      data-unit-kind={unit.kind}
      data-unit-side={unit.side}
      data-hex-id={unit.hexId}
    >
      <rect className="counter__shadow" x="4" y="5" width="78" height="78" rx="8" />
      <rect className="counter__body" x="2" y="2" width="78" height="78" rx="7" />
      <path className="counter__band" d="M2 60h78v20H2z" />
      <UnitGlyph kind={unit.kind} />
      {unit.kind === "grenadier" && <text className="counter__badge" x="62" y="20">G</text>}
      {(unit.kind === "lightInfantry" || unit.kind === "lightCavalry") && (
        <text className="counter__badge counter__badge--light" x="62" y="20">L</text>
      )}
      <text className="counter__defense" x="11" y="18">{unit.stats.defense}</text>
      <text className="counter__stat" x="12" y="75">{unit.stats.attack}</text>
      <text className="counter__stat" x="40" y="75" textAnchor="middle">{unit.stats.range}</text>
      <text className="counter__stat" x="70" y="75" textAnchor="end">{unit.stats.movement}</text>
      {selectionIndex !== undefined && (
        <g className="counter__selection-index">
          <circle cx="79" cy="42" r="11" />
          <text x="79" y="47" textAnchor="middle">{selectionIndex + 1}</text>
        </g>
      )}
    </g>
  );
}

export function GameBoard({
  locale,
  units,
  activeSide,
  selectedUnitIds,
  targetUnitId,
  inspectedHexId,
  legalMoves,
  lineOfSights,
  retreatOrigin,
  retreatDestinations,
  selectedRetreatDestination,
  pursuitDestination,
  pursuitUnitIds,
  selectedPursuitUnitId,
  helpText,
  onHexActivate
}: GameBoardProps) {
  const [landscape, setLandscape] = useState(prefersLandscapeBoard);
  const [camera, setCamera] = useState<Camera>(() =>
    getFullCamera(prefersLandscapeBoard())
  );
  const svgRef = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const dragStart = useRef<DragStart | null>(null);
  const pinchStart = useRef<PinchStart | null>(null);
  const didPan = useRef(false);
  const pressedHex = useRef<HexId | null>(null);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }

    const media = window.matchMedia(LANDSCAPE_BOARD_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      setLandscape(event.matches);
      setCamera(getFullCamera(event.matches));
      pointers.current.clear();
      dragStart.current = null;
      pinchStart.current = null;
      pressedHex.current = null;
    };
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  const targetUnit = units.find((unit) => unit.id === targetUnitId);
  const blockerSet = useMemo(
    () =>
      new Set(
        lineOfSights.flatMap((lineOfSight) =>
          lineOfSight.visible ? [] : lineOfSight.blockers
        )
      ),
    [lineOfSights]
  );

  const setZoom = useCallback((factor: number, anchor = { x: 0.5, y: 0.5 }) => {
    setCamera((current) => {
      const width = current.width / factor;
      const height = current.height / factor;
      const worldX = current.x + current.width * anchor.x;
      const worldY = current.y + current.height * anchor.y;
      return clampCamera({
        x: worldX - width * anchor.x,
        y: worldY - height * anchor.y,
        width,
        height
      }, landscape);
    });
  }, [landscape]);

  function eventPoint(event: ReactPointerEvent<SVGSVGElement>): Point {
    return { x: event.clientX, y: event.clientY };
  }

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, eventPoint(event));
    didPan.current = false;
    const activePointers = [...pointers.current.values()];
    if (activePointers.length === 1) {
      const hit = (event.target as Element).closest?.(".hex-hit");
      const hexId = hit?.getAttribute("data-hex-id") as HexId | null;
      pressedHex.current = hexId && BOARD_BY_ID.has(hexId) ? hexId : null;
      dragStart.current = { pointer: activePointers[0], camera };
      pinchStart.current = null;
    } else if (activePointers.length === 2) {
      pressedHex.current = null;
      pinchStart.current = {
        distance: distance(activePointers[0], activePointers[1]),
        midpoint: midpoint(activePointers[0], activePointers[1]),
        camera
      };
      dragStart.current = null;
    }
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, eventPoint(event));
    const activePointers = [...pointers.current.values()];
    const rect = event.currentTarget.getBoundingClientRect();

    if (activePointers.length === 1 && dragStart.current) {
      const dx = activePointers[0].x - dragStart.current.pointer.x;
      const dy = activePointers[0].y - dragStart.current.pointer.y;
      if (Math.hypot(dx, dy) > 5) {
        didPan.current = true;
        pressedHex.current = null;
      }
      setCamera(
        clampCamera({
          ...dragStart.current.camera,
          x: dragStart.current.camera.x - (dx / rect.width) * dragStart.current.camera.width,
          y: dragStart.current.camera.y - (dy / rect.height) * dragStart.current.camera.height
        }, landscape)
      );
    } else if (activePointers.length === 2 && pinchStart.current) {
      didPan.current = true;
      const currentDistance = distance(activePointers[0], activePointers[1]);
      const currentMidpoint = midpoint(activePointers[0], activePointers[1]);
      const scale = currentDistance / Math.max(1, pinchStart.current.distance);
      const width = pinchStart.current.camera.width / scale;
      const height = pinchStart.current.camera.height / scale;
      const startRectX = (pinchStart.current.midpoint.x - rect.left) / rect.width;
      const startRectY = (pinchStart.current.midpoint.y - rect.top) / rect.height;
      const currentRectX = (currentMidpoint.x - rect.left) / rect.width;
      const currentRectY = (currentMidpoint.y - rect.top) / rect.height;
      const worldX =
        pinchStart.current.camera.x + pinchStart.current.camera.width * startRectX;
      const worldY =
        pinchStart.current.camera.y + pinchStart.current.camera.height * startRectY;
      setCamera(
        clampCamera({
          x: worldX - width * currentRectX,
          y: worldY - height * currentRectY,
          width,
          height
        }, landscape)
      );
    }
  }

  function onPointerUp(
    event: ReactPointerEvent<SVGSVGElement>,
    activatePressedHex = true
  ) {
    const hexToActivate =
      activatePressedHex && !didPan.current ? pressedHex.current : null;
    pointers.current.delete(event.pointerId);
    pressedHex.current = null;
    const remaining = [...pointers.current.values()];
    pinchStart.current = null;
    dragStart.current =
      remaining.length === 1 ? { pointer: remaining[0], camera } : null;
    if (hexToActivate) onHexActivate(hexToActivate);
  }

  function onWheel(event: WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    setZoom(Math.exp(-event.deltaY * 0.001), {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height
    });
  }

  const renderedLines = lineOfSights.map((lineOfSight) => ({
    lineOfSight,
    points: lineOfSight.chosenPath
      .map((id) => BOARD_BY_ID.get(id)?.center)
      .filter((point): point is Point => point !== undefined)
      .map((point) => `${point.x},${point.y}`)
      .join(" ")
  }));

  const fullCamera = getFullCamera(landscape);
  const boardTransform = landscape
    ? `translate(${MAP_HEIGHT} 0) rotate(90)`
    : undefined;

  return (
    <section
      className={`board-frame ${landscape ? "is-landscape" : "is-portrait"}`}
      data-board-orientation={landscape ? "landscape" : "portrait"}
      aria-label={translate(locale, "board.label")}
    >
      <svg
        ref={svgRef}
        className="game-board"
        viewBox={`${camera.x} ${camera.y} ${camera.width} ${camera.height}`}
        preserveAspectRatio="xMidYMid meet"
        role="application"
        aria-label={translate(locale, "board.label")}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(event) => onPointerUp(event, false)}
        onWheel={onWheel}
      >
        <g className="board-orientation" transform={boardTransform}>
          <image
            href={`${import.meta.env.BASE_URL}assets/field.webp`}
            width={MAP_WIDTH}
            height={MAP_HEIGHT}
          />
          <g className="hex-layer">
            {BOARD_CELLS.map((cell) => {
              const occupyingUnit = units.find(
                (unit) => unit.hexId === cell.id
              );
              const selectionIndex = occupyingUnit
                ? selectedUnitIds.indexOf(occupyingUnit.id)
                : -1;
              const selected = selectionIndex >= 0;
              const target = occupyingUnit?.id === targetUnitId;
              const pursuitCandidate = occupyingUnit
                ? pursuitUnitIds.includes(occupyingUnit.id)
                : false;
              const classes = [
                "hex-hit",
                legalMoves.has(cell.id) ? "is-legal" : "",
                selected ? "is-selected" : "",
                selectionIndex === 1 ? "is-supporting" : "",
                target ? "is-target" : "",
                blockerSet.has(cell.id) ? "is-blocker" : "",
                cell.id === retreatOrigin ? "is-retreat-origin" : "",
                retreatDestinations.includes(cell.id)
                  ? "is-retreat-destination"
                  : "",
                cell.id === selectedRetreatDestination
                  ? "is-retreat-selected"
                  : "",
                pursuitCandidate ? "is-pursuit-candidate" : "",
                cell.id === pursuitDestination
                  ? "is-pursuit-destination"
                  : "",
                occupyingUnit?.id === selectedPursuitUnitId
                  ? "is-pursuit-selected"
                  : "",
                cell.id === inspectedHexId ? "is-inspected" : "",
                cell.victory ? "is-victory" : "",
                cell.terrain.includes("elbe") ? "is-impassable" : ""
              ].join(" ");
              const terrain = cell.terrain
                .map((kind) => translate(locale, `terrain.${kind}`))
                .join(", ");
              const label = `${cell.id}, ${terrain}${
                occupyingUnit
                  ? `, ${translate(locale, `side.${occupyingUnit.side}`)} ${translate(
                      locale,
                      `unit.${occupyingUnit.kind}`
                    )}`
                  : ""
              }${
                cell.id === selectedRetreatDestination
                  ? `, ${translate(locale, "retreat.confirm")}`
                  : retreatDestinations.includes(cell.id)
                    ? `, ${translate(locale, "retreat.choose")}`
                    : cell.id === pursuitDestination
                      ? `, ${translate(locale, "pursuit.destination", { hex: cell.id })}`
                      : pursuitCandidate
                        ? `, ${translate(locale, "pursuit.choose")}`
                        : ""
              }`;

              return (
                <polygon
                  key={cell.id}
                  className={classes}
                  points={hexPolygonPoints(cell.center)}
                  role="button"
                  tabIndex={0}
                  data-hex-id={cell.id}
                  aria-label={label}
                  aria-pressed={
                    cell.id === inspectedHexId ||
                    cell.id === selectedRetreatDestination ||
                    occupyingUnit?.id === selectedPursuitUnitId
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onHexActivate(cell.id);
                    }
                  }}
                />
              );
            })}
          </g>

          {renderedLines.map(({ lineOfSight, points }, index) =>
            points ? (
              <polyline
                key={`${index}-${points}`}
                className={`los-line ${lineOfSight.visible ? "is-clear" : "is-blocked"}`}
                points={points}
                pointerEvents="none"
              />
            ) : null
          )}

          <g className="unit-layer">
            {units.map((unit) => (
              <Counter
                key={unit.id}
                unit={unit}
                selected={
                  selectedUnitIds.includes(unit.id) ||
                  unit.id === targetUnit?.id ||
                  unit.id === selectedPursuitUnitId
                }
                selectionIndex={
                  selectedUnitIds.includes(unit.id)
                    ? selectedUnitIds.indexOf(unit.id)
                    : undefined
                }
                retreating={unit.hexId === retreatOrigin}
                pursuitCandidate={pursuitUnitIds.includes(unit.id)}
                pursuitSelected={unit.id === selectedPursuitUnitId}
                active={unit.side === activeSide}
                landscape={landscape}
              />
            ))}
          </g>
        </g>
      </svg>

      <div className="zoom-controls" aria-label={translate(locale, "board.label")}>
        <button type="button" onClick={() => setZoom(1.35)} aria-label={translate(locale, "board.zoomIn")}>
          +
        </button>
        <button type="button" onClick={() => setZoom(1 / 1.35)} aria-label={translate(locale, "board.zoomOut")}>
          −
        </button>
        <button type="button" onClick={() => setCamera(fullCamera)} aria-label={translate(locale, "board.fit")}>
          ⤢
        </button>
      </div>
      <p className="board-hint">
        {helpText ?? translate(locale, "board.help")}
      </p>
    </section>
  );
}
