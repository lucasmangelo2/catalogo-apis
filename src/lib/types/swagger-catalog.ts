export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options' | 'trace';

export interface EndpointItem {
	method: HttpMethod;
	path: string;
	summary: string;
	description: string;
	operationId: string;
	tags: string[];
	deprecated: boolean;
}

export interface ControllerGroup {
	name: string;
	endpointCount: number;
	endpoints: EndpointItem[];
}

export interface ApiGroup {
	name: string;
	endpointCount: number;
	controllers: ControllerGroup[];
}

export interface ParsedSwaggerResult {
	sourceUrl: string;
	documentVersion: string;
	title: string;
	totalEndpoints: number;
	apiGroups: ApiGroup[];
	fetchedAt: string;
}

export interface StoredSwaggerDocument {
	id: string;
	url: string;
	result: ParsedSwaggerResult;
}
