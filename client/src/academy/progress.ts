import { useSyncExternalStore } from "react";
import { ACADEMY_CATALOG, getCourseLessons, type AcademyCourse, type AcademyLesson } from "@/academy/catalog";

export type AcademyLessonProgress = {
  lessonId: string;
  completed: boolean;
  completedAt?: number;
};

export type AcademyCourseProgress = {
  completed: number;
  total: number;
  percentage: number;
};

export type AcademyOverallProgress = AcademyCourseProgress;

export type AcademyContinueLearning = {
  course: AcademyCourse;
  lesson: AcademyLesson;
};

const STORAGE_KEY = "goodtrading.academy.progress.v1";
const STORAGE_VERSION = 1;
type PersistedProgress = {
  version: number;
  lessons: Record<string, AcademyLessonProgress>;
};

const canonicalLessons = ACADEMY_CATALOG.flatMap(getCourseLessons);
const canonicalLessonIds = new Set(canonicalLessons.map((lesson) => lesson.id));
let snapshot: Record<string, AcademyLessonProgress> = loadProgress();
const listeners = new Set<() => void>();

function safeStorage(): Storage | undefined {
  try {
    return typeof window !== "undefined" ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

function normalizeProgress(value: unknown): Record<string, AcademyLessonProgress> {
  if (!value || typeof value !== "object") return {};
  const candidate = value as { version?: unknown; lessons?: unknown };
  if (candidate.version !== STORAGE_VERSION || !candidate.lessons || typeof candidate.lessons !== "object") return {};

  const normalized: Record<string, AcademyLessonProgress> = {};
  for (const [lessonId, raw] of Object.entries(candidate.lessons as Record<string, unknown>)) {
    if (!canonicalLessonIds.has(lessonId) || !raw || typeof raw !== "object") continue;
    const entry = raw as { completed?: unknown; completedAt?: unknown };
    if (entry.completed !== true) continue;
    normalized[lessonId] = {
      lessonId,
      completed: true,
      ...(typeof entry.completedAt === "number" && Number.isFinite(entry.completedAt) ? { completedAt: entry.completedAt } : {}),
    };
  }
  return normalized;
}

function loadProgress(): Record<string, AcademyLessonProgress> {
  const storage = safeStorage();
  if (!storage) return {};
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return normalizeProgress(JSON.parse(raw));
  } catch {
    return {};
  }
}

function persistProgress(next: Record<string, AcademyLessonProgress>): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    const payload: PersistedProgress = { version: STORAGE_VERSION, lessons: next };
    storage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage is an optional adapter; in-memory progress remains usable.
  }
}

function emit(): void {
  listeners.forEach((listener) => listener());
}

function updateProgress(lessonId: string, completed: boolean): void {
  if (!canonicalLessonIds.has(lessonId)) return;
  const next = { ...snapshot };
  if (completed) {
    next[lessonId] = { lessonId, completed: true, completedAt: Date.now() };
  } else {
    delete next[lessonId];
  }
  snapshot = next;
  persistProgress(snapshot);
  emit();
}

export function isLessonCompleted(lessonId: string): boolean {
  return canonicalLessonIds.has(lessonId) && snapshot[lessonId]?.completed === true;
}

export function setLessonCompleted(lessonId: string, completed: boolean): void {
  updateProgress(lessonId, completed);
}

export function toggleLessonCompleted(lessonId: string): void {
  updateProgress(lessonId, !isLessonCompleted(lessonId));
}

export function getCourseProgress(course: AcademyCourse): AcademyCourseProgress {
  const lessons = getCourseLessons(course);
  const completed = lessons.filter((lesson) => isLessonCompleted(lesson.id)).length;
  return {
    completed,
    total: lessons.length,
    percentage: lessons.length === 0 ? 0 : Math.round((completed / lessons.length) * 100),
  };
}

export function getOverallProgress(): AcademyOverallProgress {
  const total = canonicalLessons.length;
  const completed = canonicalLessons.filter((lesson) => isLessonCompleted(lesson.id)).length;
  return { completed, total, percentage: total === 0 ? 0 : Math.round((completed / total) * 100) };
}

function courseForLesson(lessonId: string): AcademyCourse | undefined {
  return ACADEMY_CATALOG.find((course) => getCourseLessons(course).some((lesson) => lesson.id === lessonId));
}

export function getContinueLearningLesson(): AcademyContinueLearning | undefined {
  const completed = canonicalLessons
    .map((lesson, index) => ({ lesson, index, progress: snapshot[lesson.id] }))
    .filter(({ progress }) => progress?.completed)
    .sort((a, b) => (b.progress?.completedAt ?? 0) - (a.progress?.completedAt ?? 0) || b.index - a.index);

  const startIndex = completed.length > 0 ? completed[0].index + 1 : 0;
  const ordered = [...canonicalLessons.slice(startIndex), ...canonicalLessons.slice(0, startIndex)];
  const next = ordered.find((lesson) => !isLessonCompleted(lesson.id));
  if (!next) return undefined;
  const course = courseForLesson(next.id);
  return course ? { course, lesson: next } : undefined;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Record<string, AcademyLessonProgress> {
  return snapshot;
}

export function useAcademyProgress() {
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    isLessonCompleted,
    setLessonCompleted,
    toggleLessonCompleted,
    getCourseProgress,
    getOverallProgress,
    getContinueLearningLesson,
  };
}

export function getAcademyProgressStorageKey(): string {
  return STORAGE_KEY;
}
