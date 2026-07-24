import { browser } from '$app/environment';
import { writable } from 'svelte/store';

import type { ParsedSwaggerResult, StoredSwaggerDocument } from '$lib/types/swagger-catalog';

interface SessionState {
	documents: StoredSwaggerDocument[];
	activeId: string | null;
}

const STORAGE_KEY = 'swagger-catalog-session-v1';

function createEmptyState(): SessionState {
	return {
		documents: [],
		activeId: null
	};
}

function loadState(): SessionState {
	if (!browser) {
		return createEmptyState();
	}

	const raw = sessionStorage.getItem(STORAGE_KEY);
	if (!raw) {
		return createEmptyState();
	}

	try {
		const parsed = JSON.parse(raw) as SessionState;
		if (!Array.isArray(parsed.documents)) {
			return createEmptyState();
		}

		return {
			documents: parsed.documents,
			activeId: parsed.activeId ?? null
		};
	} catch {
		return createEmptyState();
	}
}

function persistState(state: SessionState): void {
	if (!browser) {
		return;
	}

	sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function createSwaggerSessionStore() {
	const { subscribe, update } = writable<SessionState>(loadState());

	if (browser) {
		subscribe((state) => {
			persistState(state);
		});
	}

	function upsert(url: string, result: ParsedSwaggerResult) {
		update((state) => {
			const existingIndex = state.documents.findIndex((doc) => doc.url === url);
			if (existingIndex >= 0) {
				const nextDocuments = [...state.documents];
				nextDocuments[existingIndex] = {
					...nextDocuments[existingIndex],
					result
				};

				return {
					documents: nextDocuments,
					activeId: nextDocuments[existingIndex].id
				};
			}

			const newDoc: StoredSwaggerDocument = {
				id: crypto.randomUUID(),
				url,
				result
			};

			return {
				documents: [newDoc, ...state.documents],
				activeId: newDoc.id
			};
		});
	}

	function setActive(id: string) {
		update((state) => ({ ...state, activeId: id }));
	}

	function remove(id: string) {
		update((state) => {
			const nextDocuments = state.documents.filter((doc) => doc.id !== id);
			const nextActive = state.activeId === id ? (nextDocuments[0]?.id ?? null) : state.activeId;

			return {
				documents: nextDocuments,
				activeId: nextActive
			};
		});
	}

	function clear() {
		update(() => createEmptyState());
	}

	return {
		subscribe,
		upsert,
		setActive,
		remove,
		clear
	};
}

export const swaggerSession = createSwaggerSessionStore();
