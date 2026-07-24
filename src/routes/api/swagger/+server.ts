import { json } from '@sveltejs/kit';
import * as yaml from 'js-yaml';

import { normalizeSwaggerDocument } from '$lib/server/swagger-normalizer';
import type { ParsedSwaggerResult } from '$lib/types/swagger-catalog';

interface ParseRequestBody {
	url?: string;
}

interface ParseSwaggerResponse {
	documents: ParsedSwaggerResult[];
	sourceType: 'spec' | 'swagger-ui';
	discoveredUrls: number;
	warnings?: string[];
}

function parseSpecification(rawContent: string): unknown {
	try {
		return JSON.parse(rawContent);
	} catch {
		try {
			return yaml.load(rawContent);
		} catch {
			return null;
		}
	}
}

function isSwaggerDocument(value: unknown): value is Record<string, unknown> {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const maybeDoc = value as Record<string, unknown>;
	return typeof maybeDoc.paths === 'object' && maybeDoc.paths !== null;
}

function isLikelyHtml(rawContent: string, contentType: string | null): boolean {
	if (contentType?.toLowerCase().includes('text/html')) {
		return true;
	}

	return /<html[\s>]|<!doctype html/i.test(rawContent);
}

function toAbsoluteUrl(
	baseUrl: URL,
	candidate: string,
	options?: { allowStaticAsset?: boolean }
): string | null {
	try {
		const absolute = new URL(candidate, baseUrl);
		if (!['http:', 'https:'].includes(absolute.protocol)) {
			return null;
		}

		if (!options?.allowStaticAsset && /\.(?:css|js)(?:[?#].*)?$/i.test(absolute.pathname)) {
			return null;
		}

		return absolute.toString();
	} catch {
		return null;
	}
}

function extractSpecUrlsFromText(rawText: string, sourceUrl: URL): string[] {
	const found = new Set<string>();
	const keyUrl = /["']?url["']?\s*:\s*["']([^"']+)["']/gi;
	const keyUrlsBlock = /["']?urls["']?\s*:\s*\[([\s\S]*?)\]/gi;
	const keyConfigUrl = /["']?configUrl["']?\s*:\s*["']([^"']+)["']/gi;

	for (const match of rawText.matchAll(keyUrl)) {
		const absolute = toAbsoluteUrl(sourceUrl, match[1]);
		if (absolute) {
			found.add(absolute);
		}
	}

	for (const block of rawText.matchAll(keyUrlsBlock)) {
		const blockText = block[1] ?? '';
		for (const match of blockText.matchAll(keyUrl)) {
			const absolute = toAbsoluteUrl(sourceUrl, match[1]);
			if (absolute) {
				found.add(absolute);
			}
		}
	}

	for (const match of rawText.matchAll(keyConfigUrl)) {
		const absolute = toAbsoluteUrl(sourceUrl, match[1]);
		if (absolute) {
			found.add(absolute);
		}
	}

	return [...found];
}

function extractInitializerScriptUrls(rawHtml: string, sourceUrl: URL): string[] {
	const found = new Set<string>();

	for (const match of rawHtml.matchAll(/<script[^>]+src=['"]([^'"]+)['"][^>]*>/gi)) {
		const src = match[1] ?? '';
		if (!/swagger-initializer/i.test(src)) {
			continue;
		}

		const absolute = toAbsoluteUrl(sourceUrl, src, { allowStaticAsset: true });
		if (absolute) {
			found.add(absolute);
		}
	}

	return [...found];
}

async function loadSwaggerUiDefinitions(sourceUrl: URL, htmlContent: string): Promise<string[]> {
	const discovered = new Set<string>();

	for (const specUrl of extractSpecUrlsFromText(htmlContent, sourceUrl)) {
		discovered.add(specUrl);
	}

	const initializerUrls = extractInitializerScriptUrls(htmlContent, sourceUrl);
	for (const initializerUrl of initializerUrls) {
		try {
			const response = await fetch(initializerUrl, {
				headers: {
					accept: 'text/plain, application/javascript, */*'
				},
				signal: AbortSignal.timeout(15000)
			});

			if (!response.ok) {
				continue;
			}

			const scriptContent = await response.text();
			for (const specUrl of extractSpecUrlsFromText(scriptContent, sourceUrl)) {
				discovered.add(specUrl);
			}
		} catch {
			continue;
		}
	}

	return [...discovered];
}

async function fetchAndNormalizeSpec(specUrl: string): Promise<ParsedSwaggerResult | null> {
	const response = await fetch(specUrl, {
		headers: {
			accept: 'application/json, application/yaml, text/yaml, text/plain, */*'
		},
		signal: AbortSignal.timeout(15000)
	});

	if (!response.ok) {
		return null;
	}

	const rawContent = await response.text();
	const parsed = parseSpecification(rawContent);
	if (!isSwaggerDocument(parsed)) {
		return null;
	}

	const normalized = normalizeSwaggerDocument(specUrl, parsed as never, new Date().toISOString());
	return normalized.totalEndpoints > 0 ? normalized : null;
}

export async function POST({ request }) {
	let body: ParseRequestBody;

	try {
		body = (await request.json()) as ParseRequestBody;
	} catch {
		return json({ error: 'Body invalido. Envie JSON com o campo "url".' }, { status: 400 });
	}

	const sourceUrl = body.url?.trim();
	if (!sourceUrl) {
		return json({ error: 'Informe a URL do Swagger/OpenAPI.' }, { status: 400 });
	}

	let validatedUrl: URL;
	try {
		validatedUrl = new URL(sourceUrl);
	} catch {
		return json({ error: 'URL invalida.' }, { status: 400 });
	}

	if (!['http:', 'https:'].includes(validatedUrl.protocol)) {
		return json({ error: 'A URL deve usar http ou https.' }, { status: 400 });
	}

	try {
		const response = await fetch(validatedUrl, {
			headers: {
				accept: 'application/json, application/yaml, text/yaml, text/plain, */*'
			},
			signal: AbortSignal.timeout(15000)
		});

		if (!response.ok) {
			return json(
				{ error: `Falha ao obter o documento remoto (HTTP ${response.status}).` },
				{ status: 400 }
			);
		}

		const rawContent = await response.text();
		const parsedDoc = parseSpecification(rawContent);

		if (isSwaggerDocument(parsedDoc)) {
			const normalized = normalizeSwaggerDocument(
				validatedUrl.toString(),
				parsedDoc as never,
				new Date().toISOString()
			);

			if (normalized.totalEndpoints === 0) {
				return json(
					{
						error:
							'Documento lido, mas sem endpoints em "paths". Verifique se a URL aponta para o JSON/YAML principal da especificacao.'
					},
					{ status: 400 }
				);
			}

			const payload: ParseSwaggerResponse = {
				documents: [normalized],
				sourceType: 'spec',
				discoveredUrls: 1
			};

			return json(payload);
		}

		if (!isLikelyHtml(rawContent, response.headers.get('content-type'))) {
			return json({ error: 'Documento nao reconhecido como Swagger/OpenAPI.' }, { status: 400 });
		}

		const discoveredUrls = await loadSwaggerUiDefinitions(validatedUrl, rawContent);
		if (discoveredUrls.length === 0) {
			return json(
				{
					error:
						'Pagina Swagger UI detectada, mas nenhuma URL de definicao foi encontrada. Verifique se a UI expoe "url" ou "urls" no swagger-initializer.'
				},
				{ status: 400 }
			);
		}

		const warnings: string[] = [];
		const documents: ParsedSwaggerResult[] = [];

		for (const specUrl of discoveredUrls) {
			try {
				const normalized = await fetchAndNormalizeSpec(specUrl);
				if (normalized) {
					documents.push(normalized);
				} else {
					warnings.push(`Nao foi possivel carregar a especificacao em ${specUrl}`);
				}
			} catch {
				warnings.push(`Erro ao processar a especificacao em ${specUrl}`);
			}
		}

		if (documents.length === 0) {
			return json(
				{
					error:
						'Nenhuma definicao Swagger/OpenAPI valida foi encontrada a partir da pagina informada.'
				},
				{ status: 400 }
			);
		}

		const payload: ParseSwaggerResponse = {
			documents,
			sourceType: 'swagger-ui',
			discoveredUrls: discoveredUrls.length,
			warnings: warnings.length > 0 ? warnings : undefined
		};

		return json(payload);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Erro inesperado ao processar o swagger.';
		return json({ error: message }, { status: 500 });
	}
}
