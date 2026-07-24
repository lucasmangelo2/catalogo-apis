import type {
	ApiGroup,
	ControllerGroup,
	EndpointItem,
	HttpMethod,
	ParsedSwaggerResult
} from '$lib/types/swagger-catalog';

const HTTP_METHODS: HttpMethod[] = [
	'get',
	'post',
	'put',
	'patch',
	'delete',
	'head',
	'options',
	'trace'
];

interface GenericDocument {
	openapi?: string;
	swagger?: string;
	info?: {
		title?: string;
		version?: string;
	};
	paths?: Record<string, Record<string, Record<string, unknown>>>;
}

function guessVersion(doc: GenericDocument): string {
	if (typeof doc.openapi === 'string' && doc.openapi.trim()) {
		return `OpenAPI ${doc.openapi}`;
	}

	if (typeof doc.swagger === 'string' && doc.swagger.trim()) {
		return `Swagger ${doc.swagger}`;
	}

	return 'Versao nao identificada';
}

function cleanSegment(segment: string): string {
	if (!segment) {
		return '(root)';
	}

	const trimmed = segment.trim();
	if (!trimmed) {
		return '(root)';
	}

	return trimmed;
}

function splitPath(path: string): string[] {
	return path
		.split('/')
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0)
		.map((segment) => segment.replace(/[{}]/g, ''));
}

function createEndpoint(
	path: string,
	method: HttpMethod,
	operation: Record<string, unknown>
): EndpointItem {
	const tags = Array.isArray(operation.tags)
		? operation.tags.filter(
				(tag): tag is string => typeof tag === 'string' && tag.trim().length > 0
			)
		: [];

	const summary = typeof operation.summary === 'string' ? operation.summary : '';
	const description = typeof operation.description === 'string' ? operation.description : '';
	const operationId = typeof operation.operationId === 'string' ? operation.operationId : '';

	return {
		method,
		path,
		summary,
		description,
		operationId,
		tags,
		deprecated: Boolean(operation.deprecated)
	};
}

export function normalizeSwaggerDocument(
	sourceUrl: string,
	doc: GenericDocument,
	fetchedAtIso: string
): ParsedSwaggerResult {
	const paths = doc.paths ?? {};
	const apiMap = new Map<string, Map<string, EndpointItem[]>>();
	let totalEndpoints = 0;

	for (const [rawPath, operationsByMethod] of Object.entries(paths)) {
		if (!operationsByMethod || typeof operationsByMethod !== 'object') {
			continue;
		}

		const segments = splitPath(rawPath);
		const apiName = cleanSegment(segments[0] ?? '(root)');

		for (const method of HTTP_METHODS) {
			const operation = operationsByMethod[method];
			if (!operation || typeof operation !== 'object') {
				continue;
			}

			const endpoint = createEndpoint(rawPath, method, operation as Record<string, unknown>);
			const fallbackController = cleanSegment(segments[1] ?? segments[0] ?? '(sem-controller)');
			const controllerName = endpoint.tags[0] ?? fallbackController;

			if (!apiMap.has(apiName)) {
				apiMap.set(apiName, new Map<string, EndpointItem[]>());
			}

			const controllers = apiMap.get(apiName);
			if (!controllers) {
				continue;
			}

			if (!controllers.has(controllerName)) {
				controllers.set(controllerName, []);
			}

			controllers.get(controllerName)?.push(endpoint);
			totalEndpoints += 1;
		}
	}

	const apiGroups: ApiGroup[] = [...apiMap.entries()]
		.map(([apiName, controllersMap]) => {
			const controllers: ControllerGroup[] = [...controllersMap.entries()]
				.map(([controllerName, endpoints]) => ({
					name: controllerName,
					endpointCount: endpoints.length,
					endpoints: endpoints.sort(
						(a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method)
					)
				}))
				.sort((a, b) => a.name.localeCompare(b.name));

			const endpointCount = controllers.reduce(
				(acc, controller) => acc + controller.endpointCount,
				0
			);

			return {
				name: apiName,
				endpointCount,
				controllers
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name));

	const title = doc.info?.title?.trim() || 'Documento sem titulo';
	const apiVersion = doc.info?.version?.trim() || undefined;

	return {
		sourceUrl,
		documentVersion: guessVersion(doc),
		title,
		apiVersion,
		totalEndpoints,
		apiGroups,
		fetchedAt: fetchedAtIso
	};
}
