import { json } from '@sveltejs/kit';
import * as yaml from 'js-yaml';

import { normalizeSwaggerDocument } from '$lib/server/swagger-normalizer';

interface ParseRequestBody {
	url?: string;
}

function parseSpecification(rawContent: string): unknown {
	try {
		return JSON.parse(rawContent);
	} catch {
		return yaml.load(rawContent);
	}
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

		if (!parsedDoc || typeof parsedDoc !== 'object') {
			return json({ error: 'Documento nao reconhecido como Swagger/OpenAPI.' }, { status: 400 });
		}

		const now = new Date().toISOString();
		const normalized = normalizeSwaggerDocument(validatedUrl.toString(), parsedDoc as never, now);

		if (normalized.totalEndpoints === 0) {
			return json(
				{
					error:
						'Documento lido, mas sem endpoints em "paths". Verifique se a URL aponta para o JSON/YAML principal da especificacao.'
				},
				{ status: 400 }
			);
		}

		return json(normalized);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Erro inesperado ao processar o swagger.';
		return json({ error: message }, { status: 500 });
	}
}
