import type { CitationRef, KnowledgeNode } from "./types";
export function knowledgeCitation(node: KnowledgeNode): CitationRef { return { id: `[K:${node.id}]`, kind: "K", label: node.title, sourceId: node.id }; }
export function experimentCitation(experimentId: string, label = experimentId): CitationRef { return { id: `[E:${experimentId}]`, kind: "E", label, sourceId: experimentId }; }
export function tradeCitation(experimentId: string, tradeId: string): CitationRef { return { id: `[T:${tradeId}]`, kind: "T", label: `${experimentId}/${tradeId}`, sourceId: tradeId }; }
export function decisionCitation(experimentId: string, decisionId: string): CitationRef { return { id: `[D:${decisionId}]`, kind: "D", label: `${experimentId}/${decisionId}`, sourceId: decisionId }; }
export function uniqueCitations(items: CitationRef[]): CitationRef[] { return items.filter((item, index, list) => list.findIndex((x) => x.id === item.id) === index); }
