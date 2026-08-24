// src/shared/contract.ts
var RPC_CHANNEL = "/usage-stats";
var RPC_OVERVIEW = "overview";

// src/shared/usage.ts
var HEAT_DAYS = 182;
var RECENT_DAYS = 30;
function emptyBuckets() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
}
function emptyTotals() {
  return { ...emptyBuckets(), total: 0 };
}
function totalsFrom(b) {
  return { ...b, total: b.input + b.output + b.cacheRead + b.cacheWrite };
}
function sortedModels(map) {
  return Object.keys(map).map((model) => {
    const b = map[model];
    return { model, ...b, total: b.input + b.output + b.cacheRead + b.cacheWrite };
  }).sort((a, b) => b.total - a.total);
}
function totalsFromModels(models) {
  const totals = emptyTotals();
  for (const item of models) {
    totals.input += item.input;
    totals.output += item.output;
    totals.cacheRead += item.cacheRead;
    totals.cacheWrite += item.cacheWrite;
    totals.total += item.total;
  }
  return totals;
}
function dayKeyUTC(ts) {
  const d = new Date(ts);
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
}
function parseDayKeyUTC(key) {
  const p = key.split("-");
  return new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
}
function keyOfDateUTC(d) {
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
}
function todayKeyUTC(now) {
  return dayKeyUTC(now);
}
function buildDayWindow(byDay, now) {
  const days = [];
  const today = todayKeyUTC(now);
  const todayDate = parseDayKeyUTC(today);
  for (let i = HEAT_DAYS - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth(), todayDate.getUTCDate() - i));
    const key = keyOfDateUTC(d);
    const record = byDay[key];
    const models = {};
    let total = 0;
    if (record) {
      for (const model of Object.keys(record)) {
        const b = record[model];
        models[model] = totalsFrom(b);
        total += models[model].total;
      }
    }
    days.push({ date: key, total, models });
  }
  return days;
}

// src/host/projection.ts
import { z } from "zod";
var bucketSchema = z.object({
  input: z.number(),
  output: z.number(),
  cacheRead: z.number(),
  cacheWrite: z.number()
});
var stepSchema = z.object({
  buckets: bucketSchema,
  lastTime: z.number(),
  model: z.string(),
  provider: z.string(),
  mode: z.enum(["provisional", "authoritative"])
});
var usagePanelSchema = z.object({
  totals: bucketSchema,
  byModel: z.record(z.string(), bucketSchema),
  byDay: z.record(z.string(), z.record(z.string(), bucketSchema)),
  byProvider: z.record(z.string(), bucketSchema),
  retries: z.number(),
  compactionTokens: z.number(),
  firstTime: z.number().nullable(),
  lastTime: z.number().nullable(),
  seedEnd: z.number().nullable(),
  currentModel: z.string(),
  currentProvider: z.string(),
  openStep: z.string().nullable(),
  steps: z.record(z.string(), stepSchema)
});
var USAGE_PANEL_KEY = "usagePanel";
var EMPTY = Object.freeze({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
function initState() {
  return {
    totals: { ...EMPTY },
    byModel: {},
    byDay: {},
    byProvider: {},
    retries: 0,
    compactionTokens: 0,
    firstTime: null,
    lastTime: null,
    seedEnd: null,
    currentModel: "unknown",
    currentProvider: "unknown",
    openStep: null,
    steps: {}
  };
}
function stepKey(turn, step) {
  return turn + ":" + step;
}
function add(a, b) {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite
  };
}
function addInto(map, key, b) {
  const cur = map[key];
  return { ...map, [key]: cur ? add(cur, b) : { ...b } };
}
function addIntoDay(byDay, day, model, b) {
  const dayMap = byDay[day];
  return { ...byDay, [day]: dayMap ? addInto(dayMap, model, b) : { [model]: { ...b } } };
}
function isCounted(state, event) {
  return state.seedEnd !== null && event.seq >= state.seedEnd;
}
function touchTime(state, time) {
  if (state.firstTime === null || time < state.firstTime || time > (state.lastTime ?? 0)) {
    return {
      ...state,
      firstTime: state.firstTime === null ? time : Math.min(state.firstTime, time),
      lastTime: state.lastTime === null ? time : Math.max(state.lastTime, time)
    };
  }
  return state;
}
function commitStep(state, key) {
  const step = state.steps[key];
  if (!step) return state;
  const b = step.buckets;
  if (b.input === 0 && b.output === 0 && b.cacheRead === 0 && b.cacheWrite === 0) {
    const steps = { ...state.steps };
    delete steps[key];
    return { ...state, steps, openStep: state.openStep === key ? null : state.openStep };
  }
  const day = dayKeyUTC(step.lastTime);
  const next = {
    ...state,
    totals: add(state.totals, b),
    byModel: addInto(state.byModel, step.model, b),
    byDay: addIntoDay(state.byDay, day, step.model, b),
    byProvider: addInto(state.byProvider, step.provider, b),
    firstTime: state.firstTime === null ? step.lastTime : Math.min(state.firstTime, step.lastTime),
    lastTime: state.lastTime === null ? step.lastTime : Math.max(state.lastTime, step.lastTime),
    steps: { ...state.steps },
    openStep: state.openStep === key ? null : state.openStep
  };
  delete next.steps[key];
  return next;
}
function commitOpenStep(state, incomingKey) {
  if (state.openStep !== null && state.openStep !== incomingKey) {
    return commitStep(state, state.openStep);
  }
  return state;
}
function applyEvent(state, event) {
  switch (event.type) {
    case "session/end-seed": {
      if (state.seedEnd !== null && event.seq <= state.seedEnd) return state;
      return { ...state, seedEnd: event.seq };
    }
    case "request/context": {
      const { model, provider } = event.data;
      if (!model && !provider) return state;
      return {
        ...state,
        currentModel: model || state.currentModel,
        currentProvider: provider || state.currentProvider
      };
    }
    case "request/header": {
      const cfg = event.data.header && event.data.header.config;
      if (!cfg || !cfg.model && !cfg.provider) return state;
      return {
        ...state,
        currentModel: cfg.model || state.currentModel,
        currentProvider: cfg.provider || state.currentProvider
      };
    }
    case "assistant/chunk": {
      if (!isCounted(state, event)) return state;
      const chunk = event.data.chunk;
      if (!chunk || chunk.type !== "usage" || !chunk.usage) return state;
      const key = stepKey(event.data.turn, event.data.step);
      const usage = chunk.usage;
      const b = {
        input: Number(usage.inputTokens) || 0,
        output: Number(usage.outputTokens) || 0,
        cacheRead: Number(usage.cacheReadTokens) || 0,
        cacheWrite: Number(usage.cacheWriteTokens) || 0
      };
      let next = commitOpenStep(state, key);
      const existing = next.steps[key];
      const step = existing ? { ...existing, buckets: add(existing.buckets, b), lastTime: event.time } : {
        buckets: b,
        lastTime: event.time,
        model: next.currentModel,
        provider: next.currentProvider,
        mode: "provisional"
      };
      return {
        ...next,
        steps: { ...next.steps, [key]: step },
        openStep: key
      };
    }
    case "assistant/message": {
      if (!isCounted(state, event)) return state;
      const usage = event.data.usage;
      if (!usage) return state;
      const key = stepKey(event.data.turn, event.data.step);
      const b = {
        input: Number(usage.inputTokens) || 0,
        output: Number(usage.outputTokens) || 0,
        cacheRead: Number(usage.cacheReadTokens) || 0,
        cacheWrite: Number(usage.cacheWriteTokens) || 0
      };
      let next = commitOpenStep(state, key);
      const step = {
        buckets: b,
        lastTime: event.time,
        model: next.currentModel,
        provider: next.currentProvider,
        mode: "authoritative"
      };
      return {
        ...next,
        steps: { ...next.steps, [key]: step },
        openStep: key
      };
    }
    case "step/end": {
      const key = stepKey(event.data.turn, event.data.step);
      return commitStep(state, key);
    }
    case "turn/end": {
      return state.openStep !== null ? commitStep(state, state.openStep) : state;
    }
    case "llm/retry": {
      if (!isCounted(state, event)) return state;
      return touchTime({ ...state, retries: state.retries + 1 }, event.time);
    }
    case "compaction/summary": {
      if (!isCounted(state, event)) return state;
      const usage = event.data.usage;
      if (!usage) return state;
      const b = {
        input: Number(usage.inputTokens) || 0,
        output: Number(usage.outputTokens) || 0,
        cacheRead: Number(usage.cacheReadTokens) || 0,
        cacheWrite: Number(usage.cacheWriteTokens) || 0
      };
      const model = event.data.model || state.currentModel;
      const provider = event.data.provider || state.currentProvider;
      const day = dayKeyUTC(event.time);
      return {
        ...state,
        totals: add(state.totals, b),
        byModel: addInto(state.byModel, model, b),
        byDay: addIntoDay(state.byDay, day, model, b),
        byProvider: addInto(state.byProvider, provider, b),
        compactionTokens: state.compactionTokens + b.input + b.output + b.cacheRead + b.cacheWrite,
        firstTime: state.firstTime === null ? event.time : Math.min(state.firstTime, event.time),
        lastTime: state.lastTime === null ? event.time : Math.max(state.lastTime, event.time)
      };
    }
    default:
      return state;
  }
}
function recentOf(value, cutoffKey) {
  const totals = { ...EMPTY };
  const byModel = {};
  for (const day of Object.keys(value.byDay)) {
    if (day < cutoffKey) continue;
    for (const model of Object.keys(value.byDay[day])) {
      const b = value.byDay[day][model];
      totals.input += b.input;
      totals.output += b.output;
      totals.cacheRead += b.cacheRead;
      totals.cacheWrite += b.cacheWrite;
      const cur = byModel[model];
      byModel[model] = cur ? {
        input: cur.input + b.input,
        output: cur.output + b.output,
        cacheRead: cur.cacheRead + b.cacheRead,
        cacheWrite: cur.cacheWrite + b.cacheWrite
      } : { ...b };
    }
  }
  return { totals, byModel };
}

// src/host/aggregate.ts
function emptyAggregate() {
  return {
    allTimeTotals: emptyTotals(),
    allTimeByModel: {},
    allTimeByProvider: {},
    byDay: {},
    recentTotals: emptyTotals(),
    recentByModel: {},
    recentSessionCount: 0,
    allTimeSessionCount: 0,
    retries: 0,
    compactionTokens: 0,
    from: null,
    to: null,
    usageSessionsMain: 0,
    usageSessionsSubagent: 0,
    sessions: []
  };
}
function mergeSessionValue(a, value, sessionId, now, depth = 0) {
  const cutoffKey = dayKeyUTC(now - RECENT_DAYS * 24 * 3600 * 1e3);
  const recent = recentOf(value, cutoffKey);
  const totals = totalsFrom(value.totals);
  const next = {
    ...a,
    allTimeTotals: {
      input: a.allTimeTotals.input + totals.input,
      output: a.allTimeTotals.output + totals.output,
      cacheRead: a.allTimeTotals.cacheRead + totals.cacheRead,
      cacheWrite: a.allTimeTotals.cacheWrite + totals.cacheWrite,
      total: a.allTimeTotals.total + totals.total
    },
    recentTotals: {
      input: a.recentTotals.input + recent.totals.input,
      output: a.recentTotals.output + recent.totals.output,
      cacheRead: a.recentTotals.cacheRead + recent.totals.cacheRead,
      cacheWrite: a.recentTotals.cacheWrite + recent.totals.cacheWrite,
      total: a.recentTotals.total + recent.totals.input + recent.totals.output + recent.totals.cacheRead + recent.totals.cacheWrite
    },
    retries: a.retries + value.retries,
    compactionTokens: a.compactionTokens + value.compactionTokens,
    from: a.from === null ? value.firstTime : value.firstTime === null ? a.from : Math.min(a.from, value.firstTime),
    to: a.to === null ? value.lastTime : value.lastTime === null ? a.to : Math.max(a.to, value.lastTime)
  };
  for (const model of Object.keys(value.byModel)) {
    const b = value.byModel[model];
    const cur = next.allTimeByModel[model];
    next.allTimeByModel[model] = cur ? mergeB(cur, b) : { ...b };
  }
  for (const provider of Object.keys(value.byProvider)) {
    const b = value.byProvider[provider];
    const cur = next.allTimeByProvider[provider];
    next.allTimeByProvider[provider] = cur ? mergeB(cur, b) : { ...b };
  }
  for (const day of Object.keys(value.byDay)) {
    const dayMap = value.byDay[day];
    const target = next.byDay[day] || (next.byDay[day] = {});
    for (const model of Object.keys(dayMap)) {
      const b = dayMap[model];
      const cur = target[model];
      target[model] = cur ? mergeB(cur, b) : { ...b };
    }
  }
  for (const model of Object.keys(recent.byModel)) {
    const b = recent.byModel[model];
    const cur = next.recentByModel[model];
    next.recentByModel[model] = cur ? mergeB(cur, b) : { ...b };
  }
  if (recent.totals.input + recent.totals.output + recent.totals.cacheRead + recent.totals.cacheWrite > 0) {
    next.recentSessionCount += 1;
  }
  if (totals.total > 0) {
    next.allTimeSessionCount += 1;
    if (depth > 0) next.usageSessionsSubagent += 1;
    else next.usageSessionsMain += 1;
    next.sessions.push({ id: sessionId, totals, lastActive: value.lastTime ?? 0, depth });
  }
  return next;
}
function mergeB(a, b) {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite
  };
}
function rankSessions(sessions, limit) {
  return [...sessions].sort((a, b) => b.totals.total - a.totals.total).slice(0, limit);
}
function finalizeOverview(input) {
  const { aggregate: a, now, mode, sessionsTotal, sessionsOk, sessionsFailed, sessionsPending, eventsCounted, titles, providerNames } = input;
  const recentByModel = sortedModels(a.recentByModel);
  const allTimeByModel = sortedModels(a.allTimeByModel);
  const providerRows = Object.keys(a.allTimeByProvider).map((id) => {
    const b = a.allTimeByProvider[id];
    return { id, name: providerNames[id] || id, totals: totalsFrom(b) };
  }).sort((x, y) => y.totals.total - x.totals.total);
  const top = rankSessions(a.sessions, 10);
  const topSessions = top.map((s) => ({
    id: s.id,
    title: titles.has(s.id) ? titles.get(s.id) : null,
    totals: s.totals,
    lastActive: s.lastActive,
    depth: s.depth
  }));
  const coverage = {
    mode,
    timezone: "UTC",
    sessionsTotal,
    sessionsOk,
    sessionsFailed,
    sessionsPending,
    eventsCounted,
    retries: a.retries,
    compactionTokens: a.compactionTokens,
    from: a.from,
    to: a.to,
    usageSessionsMain: a.usageSessionsMain,
    usageSessionsSubagent: a.usageSessionsSubagent
  };
  return {
    days: buildDayWindow(a.byDay, now),
    totals: totalsFromModels(recentByModel),
    sessionCount: a.recentSessionCount,
    byModel: recentByModel,
    allTime: {
      totals: totalsFromModels(allTimeByModel),
      sessionCount: a.allTimeSessionCount,
      byModel: allTimeByModel
    },
    coverage,
    topSessions,
    providers: providerRows,
    updatedAt: now
  };
}
function emptyOverview(now) {
  return finalizeOverview({
    aggregate: emptyAggregate(),
    now,
    mode: "none",
    sessionsTotal: 0,
    sessionsOk: 0,
    sessionsFailed: 0,
    sessionsPending: 0,
    eventsCounted: 0,
    titles: /* @__PURE__ */ new Map(),
    providerNames: {}
  });
}

// src/host/projection-unit.ts
var PROJECTION_STATE_VERSION = 1;
var usagePanelProjectionDefinition = {
  key: USAGE_PANEL_KEY,
  stateVersion: PROJECTION_STATE_VERSION,
  stateSchema: usagePanelSchema,
  init: initState,
  apply: applyEvent,
  wire: {
    viewSchema: usagePanelSchema,
    view: (state) => state
  }
};

// src/host/scan.ts
function isCountedEvent(state, event) {
  if (state.seedEnd === null || event.seq < state.seedEnd) return false;
  switch (event.type) {
    case "assistant/message":
      return !!event.data.usage;
    case "assistant/chunk":
      return !!event.data.chunk && event.data.chunk.type === "usage" && !!event.data.chunk.usage;
    case "compaction/summary":
      return !!event.data.usage;
    case "llm/retry":
      return true;
    default:
      return false;
  }
}
async function scanFallback(deps, now) {
  const { sq, providerNames, logFailure } = deps;
  let a = emptyAggregate();
  const titles = /* @__PURE__ */ new Map();
  let sessionsTotal = 0;
  let sessionsOk = 0;
  let sessionsFailed = 0;
  let sessionsPending = 0;
  let eventsCounted = 0;
  let sessions = [];
  try {
    sessions = await sq.listSessions();
  } catch (err) {
    logFailure("listSessions failed: " + String(err?.message ?? err));
    return finalizeOverview({
      aggregate: a,
      now,
      mode: "scan",
      sessionsTotal: 0,
      sessionsOk: 0,
      sessionsFailed: 0,
      sessionsPending: 0,
      eventsCounted: 0,
      titles,
      providerNames
    });
  }
  for (const rec of sessions) {
    const header = rec && rec.header;
    if (!header) {
      sessionsTotal += 1;
      sessionsFailed += 1;
      continue;
    }
    const sessionId = header.id;
    sessionsTotal += 1;
    if (!rec.persisted) {
      sessionsPending += 1;
      continue;
    }
    let snapshot = null;
    try {
      snapshot = await sq.readSession(header.id);
    } catch (err) {
      sessionsFailed += 1;
      logFailure("readSession " + sessionId + " failed: " + String(err?.message ?? err));
      continue;
    }
    const events = snapshot && snapshot.events;
    if (!events || !events.length) {
      sessionsOk += 1;
      continue;
    }
    const seedLength = Number(header.seedLength) || 0;
    let seedEnd = 0;
    for (const event of events) {
      if (event.type === "session/end-seed") seedEnd = event.seq;
    }
    if (seedEnd === 0 && seedLength > 0) seedEnd = seedLength + 1;
    let state = { ...initState(), seedEnd };
    let title = null;
    for (const event of events) {
      if (event.type === "session/title") {
        title = event.data.title;
      }
      if (isCountedEvent(state, event)) eventsCounted += 1;
      state = applyEvent(state, event);
    }
    titles.set(sessionId, title);
    const depth = Number(header.delegationDepth) || 0;
    a = mergeSessionValue(a, state, sessionId, now, depth);
    sessionsOk += 1;
  }
  return finalizeOverview({
    aggregate: a,
    now,
    mode: "scan",
    sessionsTotal,
    sessionsOk,
    sessionsFailed,
    sessionsPending,
    eventsCounted,
    titles,
    providerNames
  });
}

// src/host/index.ts
var name = "dsh-usage-panel";
var inject = [
  "timer",
  "connection",
  "sessionProjections",
  "sessionQuery",
  "sessionProjectionCache"
];
var STALE_MS = 10 * 60 * 1e3;
var RESCAN_MS = 10 * 60 * 1e3;
function apply(ctx) {
  const tag = "[dsh-usage-panel]";
  const sq = ctx.get("sessionQuery");
  const registry = ctx.get("sessionProjections");
  const projCache = ctx.get("sessionProjectionCache");
  const connection = ctx.get("connection");
  const llm = ctx.get("llm");
  let mode = "projection";
  console.log(
    tag,
    "boot: mode=" + mode,
    "services: sessionQuery=" + Boolean(sq) + " sessionProjections=" + Boolean(registry) + " sessionProjectionCache=" + Boolean(projCache)
  );
  let disposeUnit = null;
  try {
    disposeUnit = ctx.sessionProjections.register(
      // Desktop harness register() reads stateSchema + wire; npm rc.6 d.ts still wants schema + view.
      usagePanelProjectionDefinition
    );
  } catch (err) {
    console.warn(tag, "projection registration failed; falling back to full scan:", String(err?.message ?? err));
    disposeUnit = null;
    mode = "scan";
  }
  let providerNames = {};
  if (llm && typeof llm.listProviders === "function") {
    Promise.resolve(llm.listProviders()).then((infos) => {
      providerNames = Object.fromEntries((infos || []).map((p) => [p.id, p.name]));
    }).catch((err) => console.warn(tag, "listProviders failed:", String(err?.message ?? err)));
  }
  let cache = null;
  let inflight = null;
  let disposed = false;
  function logFailure(message) {
    console.warn(tag, message);
  }
  async function scanProjection(now) {
    let a = emptyAggregate();
    let sessionsTotal = 0;
    let sessionsOk = 0;
    let sessionsFailed = 0;
    let sessionsPending = 0;
    const failures = [];
    let sessions = [];
    try {
      sessions = await sq.listSessions();
    } catch (err) {
      logFailure("listSessions failed: " + String(err?.message ?? err));
      return emptyOverview(now);
    }
    for (const rec of sessions) {
      const header = rec && rec.header;
      if (!header) {
        sessionsTotal += 1;
        sessionsFailed += 1;
        continue;
      }
      const id = header.id;
      sessionsTotal += 1;
      if (!rec.persisted) {
        sessionsPending += 1;
        continue;
      }
      try {
        const snap = await projCache.coldSnapshot(id);
        const value = snap.values.usagePanel;
        if (!value) {
          sessionsPending += 1;
          continue;
        }
        a = mergeSessionValue(a, value, id, now);
        sessionsOk += 1;
      } catch (err) {
        sessionsFailed += 1;
        if (failures.length < 3) failures.push(String(err?.message ?? err));
      }
    }
    if (failures.length > 0) {
      logFailure(sessionsFailed + " session(s) failed to read (first " + failures.length + "): " + failures.join(" | "));
    }
    const titles = /* @__PURE__ */ new Map();
    await Promise.all(
      rankSessions(a.sessions, 10).map(async (s) => {
        try {
          const t = await sq.readTitle(s.id);
          titles.set(s.id, t ? t.title : null);
        } catch {
          titles.set(s.id, null);
        }
      })
    );
    return finalizeOverview({
      aggregate: a,
      now,
      mode: "projection",
      sessionsTotal,
      sessionsOk,
      sessionsFailed,
      sessionsPending,
      eventsCounted: 0,
      titles,
      providerNames
    });
  }
  async function scan(now) {
    if (disposed) return cache ? cache.payload : emptyOverview(now);
    if (mode === "projection") return scanProjection(now);
    return scanFallback({ sq, providerNames, logFailure }, now);
  }
  function startScan() {
    if (disposed) return Promise.resolve(cache ? cache.payload : emptyOverview(Date.now()));
    if (inflight) return inflight;
    const run = scan(Date.now()).then((payload) => {
      if (!disposed) cache = { at: Date.now(), payload };
      return payload;
    });
    inflight = run;
    run.catch(() => {
    }).then(() => {
      if (inflight === run) inflight = null;
    });
    return run;
  }
  function overview(args) {
    const force = !!(args && args.force);
    if (!force && cache) {
      if (Date.now() - cache.at < STALE_MS) return Promise.resolve(cache.payload);
      startScan();
      return Promise.resolve(Object.assign({}, cache.payload, { stale: true }));
    }
    return startScan();
  }
  const disposeRpc = connection && connection.rpc.handle(
    RPC_CHANNEL,
    (endpoint, payload) => {
      if (endpoint === RPC_OVERVIEW) {
        return overview(payload).then(
          (value) => ({ ok: true, value }),
          (err) => ({
            ok: false,
            error: {
              code: "internal",
              message: String(err?.message ?? err),
              details: {}
            }
          })
        );
      }
      return Promise.resolve({
        ok: false,
        error: { code: "bad-request", message: "unknown endpoint: " + String(endpoint), details: { issues: [] } }
      });
    },
    { authority: "loopback" }
  );
  startScan().then((o) => {
    console.log(
      tag,
      "first scan done:",
      "mode=" + o.coverage.mode,
      "sessions=" + o.coverage.sessionsTotal + "/" + o.coverage.sessionsOk + " (failed " + o.coverage.sessionsFailed + ", pending " + o.coverage.sessionsPending + ")",
      "withUsage=" + o.allTime.sessionCount,
      "dataRange=" + (o.coverage.from === null ? "-" : new Date(o.coverage.from).toISOString()) + ".." + (o.coverage.to === null ? "-" : new Date(o.coverage.to).toISOString())
    );
  });
  const stopTimer = ctx.interval(() => {
    if (!inflight) startScan();
  }, RESCAN_MS);
  ctx.effect(() => () => {
    disposed = true;
    if (disposeUnit) disposeUnit();
    if (stopTimer) stopTimer();
    if (disposeRpc) disposeRpc();
  });
}
export {
  apply,
  inject,
  name
};
