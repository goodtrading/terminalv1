export type AcademyAccess = "FREE" | "MEMBER";
export type AcademyLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "PRO";
export type AcademyTrack = "FOUNDATION" | "FLOW" | "POSITIONING" | "EDGE";
export type AcademyTerminalTarget =
  | "CHART"
  | "FOOTPRINT"
  | "DOM"
  | "HEATMAP"
  | "GAMMA"
  | "STRATEGY_LAB";
export type AcademyLabType = "NONE" | "QUIZ" | "REPLAY" | "MARKET_SCAN";
export type AcademyAccessSummary = AcademyAccess | "FREE + MEMBER";

export type { AcademyContentBlock } from "@shared/academy-content";
import type { AcademyContentBlock } from "@shared/academy-content";

import { TERMINAL_QUICKSTART_CONTENT } from "@/academy/content/terminalQuickstart";
import { MARKET_MECHANICS_CONTENT } from "@/academy/content/marketMechanics";
import { OPTIONS_FOUNDATIONS_CONTENT } from "@/academy/content/optionsFoundations";
import { EXECUTION_AND_RISK_CONTENT } from "@/academy/content/executionAndRisk";
import { ORDER_FLOW_FOUNDATIONS_CONTENT } from "@/academy/content/orderFlowFoundations";
import { FOOTPRINT_MASTERY_CONTENT } from "@/academy/content/footprintMastery";

export type AcademyLesson = {
  id: string;
  slug: string;
  title: string;
  description?: string;
  order: number;
  estimatedMinutes: number;
  access: AcademyAccess;
  content?: AcademyContentBlock[];
  terminalTarget?: AcademyTerminalTarget;
  labType?: AcademyLabType;
};

export type AcademyModule = {
  id: string;
  title: string;
  order: number;
  lessons: AcademyLesson[];
};

export type AcademyCourse = {
  id: string;
  number: string;
  slug: string;
  title: string;
  description: string;
  track: AcademyTrack;
  level: AcademyLevel;
  order: number;
  modules: AcademyModule[];
};

export const ACADEMY_TRACKS = ["FOUNDATION", "FLOW", "POSITIONING", "EDGE"] as const satisfies readonly AcademyTrack[];

export const ACADEMY_TRACK_DESCRIPTIONS: Record<AcademyTrack, string> = {
  FOUNDATION: "Build the language and process behind every good decision.",
  FLOW: "Read participation, aggression and liquidity as they develop.",
  POSITIONING: "Understand options, gamma and the context around price.",
  EDGE: "Turn observation into a repeatable trading playbook.",
};

type LessonSeed = {
  title: string;
  access?: AcademyAccess;
  estimatedMinutes?: number;
  content?: AcademyContentBlock[];
  terminalTarget?: AcademyTerminalTarget;
  labType?: AcademyLabType;
};

type ModuleSeed = {
  title: string;
  access?: AcademyAccess;
  lessons: readonly (string | LessonSeed)[];
};

const free = (title: string, estimatedMinutes?: number): LessonSeed => ({
  title,
  access: "FREE",
  estimatedMinutes,
});

const member = (
  title: string,
  options: Omit<LessonSeed, "title" | "access"> = {},
): LessonSeed => ({ title, access: "MEMBER", ...options });

const lab = (
  title: string,
  terminalTarget?: AcademyTerminalTarget,
  labType: Exclude<AcademyLabType, "NONE"> = "REPLAY",
): LessonSeed => ({ title, access: "MEMBER", terminalTarget, labType });

const moduleSeed = (
  title: string,
  lessons: readonly (string | LessonSeed)[],
  access?: AcademyAccess,
): ModuleSeed => ({ title, lessons, access });

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function toLessonSeed(seed: string | LessonSeed): LessonSeed {
  return typeof seed === "string" ? { title: seed } : seed;
}

function buildCourse(args: {
  number: string;
  title: string;
  description: string;
  track: AcademyTrack;
  level: AcademyLevel;
  modules: readonly ModuleSeed[];
}): AcademyCourse {
  const courseSlug = slugify(args.title);
  const courseId = `course-${args.number}-${courseSlug}`;
  let lessonOrder = 0;

  const modules = args.modules.map((module, moduleIndex) => {
    const moduleSlug = slugify(module.title);
    const moduleId = `${courseId}-module-${String(moduleIndex + 1).padStart(2, "0")}`;
    const lessons = module.lessons.map((rawLesson, lessonIndex) => {
      const seed = toLessonSeed(rawLesson);
      const access = seed.access ?? module.access ?? "FREE";
      lessonOrder += 1;
      const lessonSlug = slugify(seed.title);
      return {
        id: `${moduleId}-lesson-${String(lessonIndex + 1).padStart(2, "0")}`,
        slug: `${courseSlug}-${String(lessonOrder).padStart(2, "0")}-${lessonSlug}`,
        title: seed.title,
        order: lessonOrder,
        estimatedMinutes: seed.estimatedMinutes ?? (access === "MEMBER" ? 14 : 10),
        access,
        ...(seed.content ? { content: seed.content } : {}),
        ...(seed.terminalTarget ? { terminalTarget: seed.terminalTarget } : {}),
        ...(seed.labType ? { labType: seed.labType } : {}),
      } satisfies AcademyLesson;
    });

    return {
      id: moduleId,
      title: module.title,
      order: moduleIndex + 1,
      lessons,
    } satisfies AcademyModule;
  });

  return {
    id: courseId,
    number: args.number,
    slug: courseSlug,
    title: args.title,
    description: args.description,
    track: args.track,
    level: args.level,
    order: Number(args.number),
    modules,
  } satisfies AcademyCourse;
}

const ACADEMY_METADATA_CATALOG: readonly AcademyCourse[] = [
  buildCourse({
    number: "00",
    title: "Terminal Quickstart",
    description: "Learn the terminal layout, core panels and a first market-reading workflow.",
    track: "FOUNDATION",
    level: "BEGINNER",
    modules: [
      moduleSeed("Getting Started", ["Welcome to GoodTrading", "How the Terminal is organized", "Selecting an instrument", "Spot vs Perpetual", "Timeframes", "Layouts and panels"]),
      moduleSeed("Reading the Terminal", ["Bid, Ask, Mid and Last", "Price and Volume", "Understanding each panel", "Gamma panel overview", "Order Flow panel overview", "Liquidity / Heatmap overview", "Alerts"]),
      moduleSeed("First Workflow", ["Analyze BTC in five minutes", "Save your workspace", "Create your first alert", "Introduction to Paper Trading", free("First Market Scan", 12)]),
    ],
  }),
  buildCourse({
    number: "01",
    title: "Market Mechanics",
    description: "Build a clear mental model of markets, liquidity and price discovery.",
    track: "FOUNDATION",
    level: "BEGINNER",
    modules: [
      moduleSeed("How Markets Work", ["What is a market?", "Buyers and sellers", "Bid and Ask", "Spread", "Liquidity", "Order Book"]),
      moduleSeed("Market vs Limit", ["Limit Orders", "Market Orders", "Liquidity Makers", "Liquidity Takers", "Aggressive participation", "Passive participation"]),
      moduleSeed("Price Discovery", ["Why price actually moves", "Liquidity consumption", "Auction process", "Acceptance", "Rejection", "Imbalance"]),
      moduleSeed("Lab", [{ title: "Who controls the auction?", access: "FREE", terminalTarget: "CHART", labType: "QUIZ" }]),
    ],
  }),
  buildCourse({
    number: "02",
    title: "Execution & Risk",
    description: "Understand execution mechanics first, then apply a disciplined risk framework.",
    track: "FOUNDATION",
    level: "BEGINNER",
    modules: [
      moduleSeed("Execution", ["Market Entry", "Limit Entry", "Stop Orders", "Stop Limit", "Reduce Only", "Partial Close", "Full Close"]),
      moduleSeed("Trade Management", ["Stop Loss", "Take Profit", "Break Even", "Trailing", "Invalidation vs arbitrary stop"]),
      moduleSeed("Risk", ["Risk per trade", "Position Size", "Risk / Reward", "Expected Value", "Winrate", "Drawdown", "Why a 40% winrate can be profitable"]),
      moduleSeed("GoodTrading Execution Framework", [member("Aggressive vs confirmed entry"), member("Choosing invalidation"), member("Limit vs Market in context"), member("Partial management"), member("When NOT to move to Break Even"), member("Managing around liquidity"), member("Execution Replay", { labType: "REPLAY" })]),
    ],
  }),
  buildCourse({
    number: "03",
    title: "Order Flow Foundations",
    description: "Learn how executed volume describes participation, aggression and auction behavior.",
    track: "FLOW",
    level: "INTERMEDIATE",
    modules: [
      moduleSeed("Foundations", ["What is Order Flow?", "Order Flow vs Technical Analysis", "Passive vs Aggressive Orders", "Executed Volume", "Bid Volume", "Ask Volume"]),
      moduleSeed("Delta", ["Delta", "Positive Delta", "Negative Delta", "Cumulative Delta", "Delta Divergence", "When Delta lies"]),
      moduleSeed("Auction Behavior", ["Aggression", "Absorption", "Exhaustion", "Acceptance", "Rejection", "Failed Auction"]),
      moduleSeed("Context", ["Order Flow in trend", "Order Flow in range", "Breakout", "Failed Breakout", "Continuation", "Reversal"]),
      moduleSeed("Advanced Interpretation", [member("Absorption + Context"), member("Absorption + Open Interest"), member("Failed Absorption"), member("Contextual Delta"), member("Trapped Traders"), member("Continuation vs Reversal"), member("When to ignore an OF signal")]),
      moduleSeed("Lab", [lab("GoodTrading Order Flow Replay Lab", "FOOTPRINT")]),
    ],
  }),
  buildCourse({
    number: "04",
    title: "Footprint Mastery",
    description: "Read bid-by-ask structure, imbalances and absorption inside the bar.",
    track: "FLOW",
    level: "INTERMEDIATE",
    modules: [
      moduleSeed("Footprint", ["How to read a Footprint", "Bid × Ask", "Volume", "Delta", "Candle Delta", "Bar Statistics"]),
      moduleSeed("Imbalances", ["Bid Imbalance", "Ask Imbalance", "Stacked Imbalance", "Diagonal Imbalance", "Single Imbalance", "Why isolated imbalances matter less"]),
      moduleSeed("Absorption", ["Buyer Absorption", "Seller Absorption", "Repeated Absorption", "Absorption Failure"]),
      moduleSeed("Advanced Footprint", ["Delta Divergence", "Trapped Traders", "Initiative Buying", "Initiative Selling", "Exhaustion", "Poor Highs / Lows", "Unfinished Auctions"]),
      moduleSeed("GoodTrading Footprint Application", [member("Absorption + OI"), member("Repeated Absorption in Context"), member("Footprint + Gamma"), member("Footprint + Heatmap"), member("Trade / Wait Framework"), lab("Footprint Replay Lab", "FOOTPRINT")]),
    ],
  }),
  buildCourse({
    number: "05",
    title: "DOM & Liquidity",
    description: "Understand resting liquidity and how the ladder changes around price.",
    track: "FLOW",
    level: "INTERMEDIATE",
    modules: [
      moduleSeed("DOM Foundations", ["What is the DOM?", "Bids", "Offers", "Depth", "Spread", "Market Depth"]),
      moduleSeed("Resting Liquidity", ["Resting Orders", "Walls", "Liquidity Clusters", "Liquidity Gaps", "Thin Liquidity", "Thick Liquidity"]),
      moduleSeed("Liquidity Behavior", ["Stacking", "Pulling", "Replenishment", "Reloading", "Cancellation", "Liquidity Migration"]),
      moduleSeed("GoodTrading Liquidity Reading", [member("Wall Defended vs Wall Fake"), member("Pull Before Touch"), member("Real Replenishment"), member("Liquidity Migration in Context"), member("Aggressor / Passive Interaction"), member("DOM Execution Setups"), lab("DOM Replay Lab", "DOM")]),
    ],
  }),
  buildCourse({
    number: "06",
    title: "Heatmap & Bookmap",
    description: "Read liquidity through time, persistence and the relationship between passive and aggressive activity.",
    track: "FLOW",
    level: "ADVANCED",
    modules: [
      moduleSeed("Heatmap Foundations", ["What the Heatmap represents", "Price", "Time", "Intensity", "Historical Liquidity", "Live Liquidity"]),
      moduleSeed("Liquidity Behavior", ["Walls", "Stacking", "Pulling", "Replenishment", "Liquidity Migration", "Cancellation"]),
      moduleSeed("Spoofing", ["What is Spoofing?", "What is NOT Spoofing?", "Spoof Lifetime", "Pull Before Touch", "Repeated Spoof", "Spoof as Information, Not a Signal"]),
      moduleSeed("Passive Compression", [member("What is Passive Compression?"), member("Valid Compression"), member("Bullish Passive Compression"), member("Bearish Passive Compression"), member("Compression Breakout"), member("Compression Failure"), member("Compression + OI"), member("Compression + Gamma"), member("Compression + Spoofing"), member("Entry and Invalidation")]),
      moduleSeed("Advanced Heatmap", ["Liquidity Vacuum", "Liquidity Chase", "Liquidity Trap", member("Absorption Around Walls"), member("Aggressive Exhaustion"), member("Failed Liquidity Defence")]),
      moduleSeed("Heatmap Lab", [lab("GoodTrading Heatmap Replay Lab", "HEATMAP")]),
    ],
  }),
  buildCourse({
    number: "07",
    title: "Open Interest & Derivatives",
    description: "Connect futures positioning, open interest and price behavior without reducing context to one metric.",
    track: "FLOW",
    level: "INTERMEDIATE",
    modules: [
      moduleSeed("Futures", ["What is a Perpetual?", "Funding", "Long", "Short", "Leverage", "Liquidation"]),
      moduleSeed("Open Interest", ["What is Open Interest?", "Price Up + OI Up", "Price Up + OI Down", "Price Down + OI Up", "Price Down + OI Down"]),
      moduleSeed("Positioning", ["Short Covering", "Long Liquidation", "New Positioning", "Liquidation Flow"]),
      moduleSeed("GoodTrading OI Application", [member("OI + Aggression"), member("OI + Absorption"), member("OI + Passive Compression"), member("OI + Breakout"), member("OI + Gamma"), member("BTC Positioning Case Studies")]),
    ],
  }),
  buildCourse({
    number: "08",
    title: "Options Foundations",
    description: "Learn options vocabulary, Greeks and dealer positioning from first principles.",
    track: "POSITIONING",
    level: "INTERMEDIATE",
    modules: [
      moduleSeed("Options Basics", ["What is an Option?", "Call", "Put", "Strike", "Expiration", "Premium"]),
      moduleSeed("Greeks", ["Delta", "Gamma", "Theta", "Vega", "Vanna", "Charm"]),
      moduleSeed("Positioning", ["Open Interest", "Dealer", "Market Maker", "Hedging", "Delta Hedging"]),
      moduleSeed("Crypto Options", ["Deribit", "Expirations", "BTC Options", "ETH Options", "Why Options Matter"]),
    ],
  }),
  buildCourse({
    number: "09",
    title: "Gamma & Dealer Hedging",
    description: "Understand gamma exposure, dealer hedging and regime changes around the gamma flip.",
    track: "POSITIONING",
    level: "ADVANCED",
    modules: [
      moduleSeed("Gamma", ["What is Gamma?", "Long Gamma", "Short Gamma", "Positive Gamma", "Negative Gamma"]),
      moduleSeed("Dealer Hedging", ["Dealer Positioning", "Delta Neutrality", "Hedging When Price Rises", "Hedging When Price Falls", "Stabilizing Flows", "Destabilizing Flows"]),
      moduleSeed("GEX", ["Gamma Exposure", "Aggregate GEX", "Strike GEX", "Expiry GEX", "Why GEX Models Disagree"]),
      moduleSeed("Gamma Flip", ["Gamma Flip", "Positive Gamma Regime", "Negative Gamma Regime", "Crossing the Flip"]),
      moduleSeed("Gamma Zones", ["Magnet Zones", "Concentrated Gamma", "Expiration Effects"]),
      moduleSeed("Advanced Greeks", ["Vanna", "Charm", "DTE", "IV Changes", "Expiry Decay"]),
      moduleSeed("GoodTrading Gamma Application", [member("How to prioritize expirations"), member("How to prioritize zones"), member("Gamma Flip Acceptance"), member("Gamma Flip Rejection"), member("Magnet Rotation"), member("Gamma + Order Flow"), member("Gamma + Liquidity"), member("Gamma + Open Interest"), member("When to ignore Gamma"), member("Gamma Invalidation"), lab("Real Market Replay", "GAMMA")]),
    ],
  }),
  buildCourse({
    number: "10",
    title: "Market Structure & Context",
    description: "Classify market state and build context before looking for a trigger.",
    track: "POSITIONING",
    level: "ADVANCED",
    modules: [
      moduleSeed("Market State", ["Trend", "Range", "Expansion", "Compression", "Volatility"]),
      moduleSeed("Structure", ["Swing Structure", "Higher High / Higher Low", "Lower High / Lower Low", "Balance", "Breakout", "Failed Breakout"]),
      moduleSeed("Auction Context", ["Acceptance", "Rejection", "Value Migration", "Price Discovery"]),
      moduleSeed("Multi-Timeframe", ["Higher Timeframe", "Execution Timeframe", "Context vs Trigger", "Why Low-Timeframe Signals Fail"]),
      moduleSeed("GoodTrading Context Framework", [member("Market State Classification"), member("Building Context Before Entry"), member("Context Market Scan", { terminalTarget: "CHART", labType: "MARKET_SCAN" })]),
    ],
  }),
  buildCourse({
    number: "11",
    title: "GoodTrading Playbook",
    description: "Combine context, positioning, liquidity and confirmation into the GoodTrading method.",
    track: "EDGE",
    level: "ADVANCED",
    modules: [
      moduleSeed("The GoodTrading Method", ["What is the GoodTrading Method?", "Market State", "Gamma Map", "Liquidity", "Order Flow", "Acceptance / Rejection", "Execution", "Full Public Example"]),
      moduleSeed("Market Scan", [member("GoodTrading Market Scan"), member("Trade / Wait / Invalid")]),
      moduleSeed("Setups", [member("Gamma Flip Rejection"), member("Gamma Flip Acceptance"), member("Magnet Rotation"), member("Passive Compression Breakout"), member("Compression Failure"), member("Liquidity Wall Rejection"), member("Liquidity Pull Continuation"), member("Spoof + Execution"), member("Absorption Reversal"), member("Failed Breakout")]),
      moduleSeed("Playbook Lab", [lab("GoodTrading Market Replay"), lab("Complete Market Scan", undefined, "MARKET_SCAN")]),
    ],
  }),
  buildCourse({
    number: "12",
    title: "BTC Scalping",
    description: "Apply disciplined context and execution to short-horizon BTC decisions.",
    track: "EDGE",
    level: "ADVANCED",
    modules: [
      moduleSeed("Scalping Foundations", ["What is Scalping?", "What Scalping is NOT", "Context Before Trigger", "Trading Around Liquidity", "BTC Microstructure", "Spot vs Perpetual", "Session Behavior"]),
      moduleSeed("GoodTrading BTC Execution", [member("Gamma + Compression"), member("Absorption Entry"), member("Pulling"), member("Spoofing"), member("Entry Timing"), member("Stop Placement"), member("Invalidation"), member("Partial Management"), member("Full TP"), member("Failed Setup")]),
      moduleSeed("Case Studies", [member("Winning Long"), member("Winning Short"), member("Losing Long"), member("Losing Short"), member("No Trade"), member("Good Decision / Bad Outcome"), member("Bad Decision / Good Outcome")]),
      moduleSeed("BTC Replay Lab", [lab("BTC Scalping Replay")]),
    ],
  }),
  buildCourse({
    number: "13",
    title: "Strategy Lab & Research",
    description: "Form hypotheses, test them honestly and build a repeatable research workflow.",
    track: "EDGE",
    level: "PRO",
    modules: [
      moduleSeed("Strategy Thinking", ["Hypothesis", "Signal", "Condition", "Entry", "Exit", "Invalidation"]),
      moduleSeed("Backtesting Foundations", ["What is a Backtest?", "Sample Size", "In-Sample", "Out-of-Sample", "Overfitting", "Lookahead Bias", "Expected Value", "Profit Factor", "Drawdown"]),
      moduleSeed("Strategy Lab", [member("Create a Strategy", { terminalTarget: "STRATEGY_LAB" }), member("Conditions", { terminalTarget: "STRATEGY_LAB" }), member("Triggers", { terminalTarget: "STRATEGY_LAB" }), member("Filters", { terminalTarget: "STRATEGY_LAB" }), member("Run Test", { terminalTarget: "STRATEGY_LAB" }), member("Compare Versions", { terminalTarget: "STRATEGY_LAB" })]),
      moduleSeed("Advanced Research", [member("Gamma as Filter"), member("OI as Filter"), member("Liquidity Conditions"), member("Market Regime Filters"), member("Session Filters"), member("Volatility Filters")]),
      moduleSeed("Validation & Deployment", [member("Out-of-Sample Validation", { terminalTarget: "STRATEGY_LAB" }), member("Paper Deployment", { terminalTarget: "STRATEGY_LAB" }), member("Strategy Iteration", { terminalTarget: "STRATEGY_LAB" }), member("Final Research Project", { terminalTarget: "STRATEGY_LAB" })]),
    ],
  }),
] as const;

const editorialCatalog = ACADEMY_METADATA_CATALOG.map((course) => ({
  ...course,
  modules: course.modules.map((module) => ({
    ...module,
    lessons: module.lessons.map((lesson) => {
      const content =
        TERMINAL_QUICKSTART_CONTENT[lesson.slug] ??
        MARKET_MECHANICS_CONTENT[lesson.slug] ??
        OPTIONS_FOUNDATIONS_CONTENT[lesson.slug] ??
        EXECUTION_AND_RISK_CONTENT[lesson.slug] ??
        ORDER_FLOW_FOUNDATIONS_CONTENT[lesson.slug] ??
        FOOTPRINT_MASTERY_CONTENT[lesson.slug];
      return content ? { ...lesson, content } : lesson;
    }),
  })),
}));

export const ACADEMY_CATALOG: readonly AcademyCourse[] = editorialCatalog;
export const ACADEMY_EDITORIAL_CATALOG: readonly AcademyCourse[] = ACADEMY_CATALOG;

export function getAcademyCoursesByTrack(track: AcademyTrack): AcademyCourse[] {
  return ACADEMY_CATALOG.filter((course) => course.track === track).sort((a, b) => a.order - b.order);
}

export function getAcademyCourseBySlug(slug: string): AcademyCourse | undefined {
  return ACADEMY_CATALOG.find((course) => course.slug === slug);
}

export function getAcademyLessonBySlug(course: AcademyCourse, lessonSlug: string): AcademyLesson | undefined {
  return getCourseLessons(course).find((lesson) => lesson.slug === lessonSlug);
}

export function getAcademyLessonPosition(course: AcademyCourse, lesson: AcademyLesson): { position: number; total: number } {
  const lessons = getCourseLessons(course);
  const index = lessons.findIndex((candidate) => candidate.id === lesson.id);
  if (index < 0) return { position: 0, total: lessons.length };
  return { position: index + 1, total: lessons.length };
}

export function getAcademyLessonContext(course: AcademyCourse, lesson: AcademyLesson) {
  const moduleIndex = course.modules.findIndex((module) => module.lessons.some((candidate) => candidate.id === lesson.id));
  const module = moduleIndex >= 0 ? course.modules[moduleIndex] : undefined;
  return {
    module,
    moduleIndex: moduleIndex >= 0 ? moduleIndex : undefined,
    ...getAcademyLessonPosition(course, lesson),
  };
}

export function getAdjacentAcademyLessons(course: AcademyCourse, lesson: AcademyLesson): {
  previous?: AcademyLesson;
  next?: AcademyLesson;
} {
  const lessons = getCourseLessons(course);
  const index = lessons.findIndex((candidate) => candidate.id === lesson.id);
  if (index < 0) return {};
  return { previous: lessons[index - 1], next: lessons[index + 1] };
}

export function getCourseLessons(course: AcademyCourse): AcademyLesson[] {
  return course.modules.flatMap((module) => module.lessons).sort((a, b) => a.order - b.order);
}

export function getModuleLessonCount(module: AcademyModule): number {
  return module.lessons.length;
}

export function getModuleEstimatedMinutes(module: AcademyModule): number {
  return module.lessons.reduce((total, lesson) => total + lesson.estimatedMinutes, 0);
}

export function getCourseLessonCount(course: AcademyCourse): number {
  return getCourseLessons(course).length;
}

export function getCourseEstimatedMinutes(course: AcademyCourse): number {
  return getCourseLessons(course).reduce((total, lesson) => total + lesson.estimatedMinutes, 0);
}

export function getCourseAccessSummary(course: AcademyCourse): AcademyAccessSummary {
  const accesses = new Set(getCourseLessons(course).map((lesson) => lesson.access));
  if (accesses.size === 1) return accesses.has("MEMBER") ? "MEMBER" : "FREE";
  return "FREE + MEMBER";
}

export function getAcademyAccessStats(courses: readonly AcademyCourse[] = ACADEMY_CATALOG) {
  const lessons = courses.flatMap(getCourseLessons);
  const freeLessons = lessons.filter((lesson) => lesson.access === "FREE").length;
  const memberLessons = lessons.filter((lesson) => lesson.access === "MEMBER").length;
  const totalLessons = lessons.length;
  return {
    totalLessons,
    freeLessons,
    memberLessons,
    freePercentage: totalLessons === 0 ? 0 : (freeLessons / totalLessons) * 100,
    memberPercentage: totalLessons === 0 ? 0 : (memberLessons / totalLessons) * 100,
  };
}

export const ACADEMY_ACCESS_STATS = getAcademyAccessStats();
