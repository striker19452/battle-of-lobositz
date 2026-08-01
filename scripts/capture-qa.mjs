import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const port = Number(process.argv[2] ?? 9223);
const baseUrl = process.argv[3] ?? "http://127.0.0.1:4173";
const outputDir = resolve(process.argv[4] ?? ".vite-qa");
await mkdir(outputDir, { recursive: true });
const target = await fetch(
  `http://127.0.0.1:${port}/json/new?${encodeURIComponent(baseUrl)}`,
  { method: "PUT" }
).then((response) => response.json());

const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
const eventWaiters = new Map();
let sequence = 0;

await new Promise((resolveOpen, rejectOpen) => {
  socket.addEventListener("open", resolveOpen, { once: true });
  socket.addEventListener("error", rejectOpen, { once: true });
});

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve: resolveCommand, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolveCommand(message.result);
    return;
  }

  const waiters = eventWaiters.get(message.method);
  if (waiters?.length) {
    waiters.shift()(message.params);
  }
});

function command(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolveCommand, reject) => {
    pending.set(id, { resolve: resolveCommand, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

function waitForEvent(method) {
  return new Promise((resolveEvent) => {
    const waiters = eventWaiters.get(method) ?? [];
    waiters.push(resolveEvent);
    eventWaiters.set(method, waiters);
  });
}

const wait = (milliseconds) =>
  new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));

async function evaluate(expression) {
  const result = await command("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  return result.result.value;
}

async function screenshot(filename) {
  const result = await command("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
    fromSurface: true
  });
  await writeFile(resolve(outputDir, filename), Buffer.from(result.data, "base64"));
}

async function clickSelector(selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({
    block: "center",
    inline: "center",
    behavior: "auto"
  })`);
  await wait(80);
  const point = await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    const rect = element?.getBoundingClientRect();
    return rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null;
  })()`);
  if (!point) throw new Error(`Missing click target: ${selector}`);
  await command("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1
  });
  await command("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1
  });
}

async function installControlledState() {
  await evaluate(`(() => {
    const key = "lobositz-game-v2";
    const state = JSON.parse(localStorage.getItem(key));
    const positions = {
      "P-I-1": "0,7",
      "P-I-2": "6,4",
      "P-G-1": "7,3",
      "A-I-1": "7,4"
    };
    state.units = state.units.map((unit) => ({
      ...unit,
      hexId: positions[unit.id] ?? null,
      status: "active"
    }));
    state.turn = 1;
    state.activeSide = "prussian";
    state.phase = "move";
    state.movedThisTurn = [];
    state.attackedThisTurn = [];
    state.winner = null;
    state.log = [{ id: 1, key: "log.gameReady", side: "prussian" }];
    localStorage.setItem(key, JSON.stringify(state));
  })()`);
  const controlledReload = waitForEvent("Page.loadEventFired");
  await command("Page.reload");
  await controlledReload;
  await wait(500);
}

await command("Page.enable");
await command("Runtime.enable");
await command("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
  screenWidth: 390,
  screenHeight: 844
});
await command("Emulation.setTouchEmulationEnabled", {
  enabled: true,
  maxTouchPoints: 5
});

const loaded = waitForEvent("Page.loadEventFired");
await command("Page.navigate", { url: baseUrl });
await loaded;
await evaluate(`localStorage.removeItem("lobositz-game-v1")`);
await evaluate(`localStorage.removeItem("lobositz-game-v2")`);
await evaluate(`localStorage.removeItem("lobositz-manual-save-v1")`);
const reloaded = waitForEvent("Page.loadEventFired");
await command("Page.reload");
await reloaded;
await wait(1800);
await evaluate(`document.querySelector(".inspector__footer button")?.click()`);
await wait(180);
await screenshot("mobile-true.png");

const initial = await evaluate(`(() => ({
  viewport: [window.innerWidth, window.innerHeight],
  hexes: document.querySelectorAll('.hex-hit').length,
  counters: document.querySelectorAll('.counter').length,
  artilleryHex: [...document.querySelectorAll('.hex-hit')]
    .find((element) => element.getAttribute('aria-label')?.startsWith('1,5,'))?.getAttribute('aria-label'),
  title: (() => {
    const element = document.querySelector('.title-lockup h1');
    const rect = element?.getBoundingClientRect();
    return element ? {
      text: element.textContent,
      rect: [rect.x, rect.y, rect.width, rect.height],
      color: getComputedStyle(element).color,
      opacity: getComputedStyle(element).opacity
    } : null;
  })(),
  overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth
}))()`);

const deployment = await evaluate(`(() => {
  const units = [...document.querySelectorAll('.counter')].map((element) => ({
    id: element.dataset.unitId,
    side: element.dataset.unitSide,
    kind: element.dataset.unitKind,
    hexId: element.dataset.hexId
  }));
  const countKinds = (side) =>
    units
      .filter((unit) => unit.side === side)
      .reduce((counts, unit) => {
        counts[unit.kind] = (counts[unit.kind] ?? 0) + 1;
        return counts;
      }, {});
  return {
    occupiedHexes: new Set(units.map((unit) => unit.hexId)).size,
    prussianGrenadiers: units
      .filter((unit) => unit.side === 'prussian' && unit.kind === 'grenadier')
      .map((unit) => unit.hexId)
      .sort(),
    austrianGrenadiers: units
      .filter((unit) => unit.side === 'austrian' && unit.kind === 'grenadier')
      .map((unit) => unit.hexId)
      .sort(),
    prussianKinds: countKinds('prussian'),
    austrianKinds: countKinds('austrian')
  };
})()`);

await clickSelector(".save-panel__actions button:first-child");
await wait(160);
await screenshot("mobile-save.png");
const savedGame = await evaluate(`(() => {
  const saved = JSON.parse(localStorage.getItem("lobositz-manual-save-v1"));
  return {
    exists: Boolean(saved),
    version: saved?.version,
    unitCount: saved?.state?.units?.length,
    savedAt: saved?.savedAt,
    notice: document.querySelector(".save-panel__notice")?.textContent?.trim(),
    timestamp: document.querySelector(".save-panel time")?.textContent?.trim()
  };
})()`);

await installControlledState();
await clickSelector(".save-panel__actions button:nth-child(2)");
await wait(120);
const loadConfirmation = await evaluate(
  `document.querySelector(".save-panel__actions button:nth-child(2)")?.textContent?.trim()`
);
await clickSelector(".save-panel__actions button:nth-child(2)");
await wait(220);
const loadedGame = await evaluate(`(() => ({
  counterCount: document.querySelectorAll(".counter").length,
  notice: document.querySelector(".save-panel__notice")?.textContent?.trim(),
  autoSaveUnitCount: JSON.parse(localStorage.getItem("lobositz-game-v2"))?.units?.filter(
    (unit) => unit.hexId
  ).length
}))()`);

await installControlledState();

await clickSelector(".phase-switch button:first-child");
await wait(120);
await clickSelector('.hex-hit[data-hex-id="7,4"]');
await wait(160);
const fieldworksInspection = await evaluate(`(() => ({
  inspected: document.querySelector('.hex-hit.is-inspected')?.getAttribute('data-hex-id'),
  labels: [...document.querySelectorAll('.terrain-inspector dt')].map(
    (element) => element.textContent?.trim()
  ),
  description: [...document.querySelectorAll('.terrain-inspector dt')]
    .find((element) => element.textContent?.includes('野战工事'))
    ?.closest('div')
    ?.querySelector('dd')
    ?.textContent?.trim()
}))()`);
await clickSelector('.hex-hit[data-hex-id="7,6"]');
await wait(180);
await screenshot("mobile-terrain.png");
const terrainInspection = await evaluate(`(() => ({
  inspected: document.querySelector('.hex-hit.is-inspected')?.getAttribute('data-hex-id'),
  hexLabel: document.querySelector('.terrain-inspector__heading span')?.textContent?.trim(),
  labels: [...document.querySelectorAll('.terrain-inspector dt')].map(
    (element) => element.textContent?.trim()
  ),
  descriptions: [...document.querySelectorAll('.terrain-inspector dd')].map(
    (element) => element.textContent?.trim()
  )
}))()`);

await clickSelector('.hex-hit[data-hex-id="0,7"]');
await wait(120);
const selectionBeforeToggle = await evaluate(`(() => ({
  selectedCount: document.querySelectorAll('.hex-hit.is-selected').length,
  legalCount: document.querySelectorAll('.hex-hit.is-legal').length,
  heading: document.querySelector('.selection-section h2')?.textContent?.trim(),
  unit: document.querySelector('.selection-section .unit-summary strong')?.textContent?.trim()
}))()`);
await clickSelector('.hex-hit[data-hex-id="0,7"]');
await wait(120);
const deselection = await evaluate(`(() => ({
  selectedCount: document.querySelectorAll('.hex-hit.is-selected').length,
  legalCount: document.querySelectorAll('.hex-hit.is-legal').length,
  inspected: document.querySelector('.hex-hit.is-inspected')?.getAttribute('data-hex-id'),
  heading: document.querySelector('.unit-inspection h2')?.textContent?.trim(),
  unit: document.querySelector('.unit-inspection .unit-summary strong')?.textContent?.trim(),
  context: document.querySelector('.unit-inspection__context')?.textContent?.trim(),
  stats: [...document.querySelectorAll('.unit-inspection .stat-row b')].map(
    (element) => element.textContent?.trim()
  )
}))()`);
await clickSelector('.hex-hit[data-hex-id="7,4"]');
await wait(160);
const enemyUnitInspection = await evaluate(`(() => ({
  selectedCount: document.querySelectorAll('.hex-hit.is-selected').length,
  inspected: document.querySelector('.hex-hit.is-inspected')?.getAttribute('data-hex-id'),
  heading: document.querySelector('.unit-inspection h2')?.textContent?.trim(),
  unit: document.querySelector('.unit-inspection .unit-summary strong')?.textContent?.trim(),
  context: document.querySelector('.unit-inspection__context')?.textContent?.trim(),
  stats: [...document.querySelectorAll('.unit-inspection .stat-row b')].map(
    (element) => element.textContent?.trim()
  )
}))()`);
await screenshot("mobile-unit-info.png");
await clickSelector('.hex-hit[data-hex-id="0,7"]');
await wait(120);
const movementSelection = await evaluate(`(() => ({
  selected: document.querySelector('.hex-hit.is-selected')?.getAttribute('data-hex-id'),
  legalCount: document.querySelectorAll('.hex-hit.is-legal').length,
  phase: document.querySelector('.phase-switch .is-active')?.textContent?.trim(),
  crossingDestinationLegal: document.querySelector('.hex-hit[data-hex-id="0,8"]')?.classList.contains('is-legal'),
  beyondElevationLegal: document.querySelector('.hex-hit[data-hex-id="0,9"]')?.classList.contains('is-legal')
}))()`);
if (!movementSelection.crossingDestinationLegal) {
  throw new Error(`Selected unit has no legal destination: ${JSON.stringify(movementSelection)}`);
}
await clickSelector('.hex-hit[data-hex-id="0,8"]');
await wait(180);
const movement = await evaluate(`(() => ({
  destination: document.querySelector('.hex-hit.is-selected')?.getAttribute('data-hex-id'),
  usage: document.querySelector('.phase-switch button:first-child small')?.textContent?.trim(),
  log: document.querySelector('.dispatch-log li span')?.textContent?.trim()
}))()`);

await evaluate(
  `document.querySelectorAll('.phase-switch button')[1]?.click()`
);
await wait(120);
await clickSelector('.hex-hit[data-hex-id="6,4"]');
await wait(180);
await clickSelector('.hex-hit[data-hex-id="7,3"]');
await wait(180);
await clickSelector('.hex-hit[data-hex-id="7,4"]');
await wait(450);
await screenshot("mobile-los.png");

const interaction = await evaluate(`(() => ({
  activePhase: document.querySelector('.phase-switch .is-active')?.textContent?.trim(),
  selectedHexes: document.querySelectorAll('.hex-hit.is-selected').length,
  selected: document.querySelector('.selection-section .unit-summary strong')?.textContent?.trim(),
  supporting: document.querySelector('.selection-section--supporting .unit-summary strong')?.textContent?.trim(),
  ruling: document.querySelector('.ruling p')?.textContent?.trim(),
  attackButton: document.querySelector('.attack-button')?.textContent?.trim(),
  losLines: document.querySelectorAll('.los-line').length
}))()`);

await evaluate(`Math.random = () => 0`);
await clickSelector(".attack-button:not(:disabled)");
await wait(160);
const rolling = await evaluate(`(() => ({
  visible: Boolean(document.querySelector('.dice-roll.is-rolling')),
  label: document.querySelector('.dice-roll__copy strong')?.textContent?.trim(),
  attackUsage: document.querySelector('.phase-switch button:nth-child(2) small')?.textContent?.trim(),
  attackDisabled: document.querySelector('.attack-button')?.disabled
}))()`);
await screenshot("mobile-dice-rolling.png");
await wait(900);
await screenshot("mobile-dice-result.png");
const resolution = await evaluate(`(() => ({
  usage: document.querySelector('.phase-switch button:nth-child(2) small')?.textContent?.trim(),
  selectedHexes: document.querySelectorAll('.hex-hit.is-selected').length,
  targetRemaining: Boolean(document.querySelector('.hex-hit[data-hex-id="7,4"]')?.getAttribute('aria-label')?.includes('奥地利')),
  log: document.querySelector('.dispatch-log li span')?.textContent?.trim(),
  diceVisible: Boolean(document.querySelector('.dice-roll.is-result')),
  diceResult: document.querySelector('.dice-roll__copy strong')?.textContent?.trim(),
  combatVisible: Boolean(document.querySelector('.combat-result')),
  matchup: document.querySelector('.combat-result__heading strong')?.textContent?.trim(),
  result: document.querySelector('.combat-result__heading > b')?.textContent?.trim(),
  attackTerms: [...document.querySelectorAll('.combat-formula:first-child .combat-equation__term')].map(
    (term) => ({
      value: term.querySelector('b')?.textContent?.trim(),
      label: term.querySelector('small')?.textContent?.trim()
    })
  ),
  attackTotal: document.querySelector('.combat-formula:first-child .combat-equation__total')?.textContent?.trim(),
  defenseTerms: [...document.querySelectorAll('.combat-formula:nth-child(2) .combat-equation__term')].map(
    (term) => ({
      value: term.querySelector('b')?.textContent?.trim(),
      label: term.querySelector('small')?.textContent?.trim()
    })
  ),
  defenseTotal: document.querySelector('.combat-formula:nth-child(2) .combat-equation__total')?.textContent?.trim(),
  outcome: document.querySelector('.combat-result__outcome')?.textContent?.trim()
}))()`);

const retreat = await evaluate(`(() => ({
  visible: Boolean(document.querySelector('.retreat-panel')),
  destinations: [...document.querySelectorAll('.retreat-panel__destinations > button strong')].map(
    (element) => element.textContent?.trim()
  ),
  selectedCount: document.querySelectorAll('.retreat-panel__destinations > button.is-selected').length,
  mayHold: Boolean(document.querySelector('.retreat-panel__hold')),
  phaseLocked: [...document.querySelectorAll('.phase-switch button')].every((button) => button.disabled),
  endTurnLocked: document.querySelector('.end-turn-button')?.disabled
}))()`);
if (!retreat.visible || retreat.destinations.length === 0) {
  throw new Error(`Retreat choice missing: ${JSON.stringify(retreat)}`);
}
await clickSelector('.retreat-panel__destinations > button:first-child');
await wait(120);
await screenshot("mobile-retreat-choice.png");
const chosenRetreat = await evaluate(
  `document.querySelector('.retreat-panel__destinations > button.is-selected strong')?.textContent?.trim()`
);
await clickSelector('.retreat-panel__confirm');
await wait(180);
const retreatResolved = await evaluate(`(() => ({
  visible: Boolean(document.querySelector('.retreat-panel')),
  defenderHex: document.querySelector('.counter[data-unit-id="A-I-1"]')?.dataset.hexId,
  pursuitVisible: Boolean(document.querySelector('.pursuit-panel')),
  result: document.querySelector('.combat-result__heading > b')?.textContent?.trim(),
  outcome: document.querySelector('.combat-result__outcome')?.textContent?.trim(),
  log: document.querySelector('.dispatch-log li span')?.textContent?.trim()
}))()`);
if (retreatResolved.defenderHex !== chosenRetreat || !retreatResolved.pursuitVisible) {
  throw new Error(`Retreat did not resolve correctly: ${JSON.stringify({ chosenRetreat, retreatResolved })}`);
}
await screenshot("mobile-retreat-resolved.png");

const pursuit = await evaluate(`(() => ({
  visible: Boolean(document.querySelector('.pursuit-panel')),
  destination: document.querySelector('.pursuit-panel__heading > strong')?.textContent?.trim(),
  candidates: [...document.querySelectorAll('.pursuit-panel__candidates > button')].map(
    (button) => button.textContent?.trim()
  ),
  selectedCount: document.querySelectorAll('.pursuit-panel__candidates > button.is-selected').length,
  phaseLocked: [...document.querySelectorAll('.phase-switch button')].every((button) => button.disabled),
  endTurnLocked: document.querySelector('.end-turn-button')?.disabled
}))()`);
if (!pursuit.visible || pursuit.candidates.length !== 2) {
  throw new Error(`Pursuit choice missing: ${JSON.stringify(pursuit)}`);
}
await clickSelector('.pursuit-panel__candidates > button:nth-child(2)');
await wait(120);
await screenshot("mobile-pursuit-choice.png");
await clickSelector('.pursuit-panel__confirm');
await wait(180);
const pursuitResolved = await evaluate(`(() => ({
  visible: Boolean(document.querySelector('.pursuit-panel')),
  destinationUnit: document.querySelector('.counter[data-hex-id="7,4"]')?.dataset.unitId,
  log: document.querySelector('.dispatch-log li span')?.textContent?.trim(),
  phaseLocked: [...document.querySelectorAll('.phase-switch button')].every((button) => button.disabled),
  endTurnLocked: document.querySelector('.end-turn-button')?.disabled
}))()`);
await screenshot("mobile-pursuit-resolved.png");

process.stdout.write(
  JSON.stringify(
    {
      initial,
      deployment,
      savedGame,
      loadConfirmation,
      loadedGame,
      fieldworksInspection,
      terrainInspection,
      selectionBeforeToggle,
      deselection,
      enemyUnitInspection,
      movementSelection,
      movement,
      interaction,
      rolling,
      resolution,
      retreat,
      chosenRetreat,
      retreatResolved,
      pursuit,
      pursuitResolved
    },
    null,
    2
  )
);
socket.close();
