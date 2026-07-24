<script lang="ts">
	import { fromStore } from 'svelte/store';

	import { swaggerSession } from '$lib/stores/swagger-session';
	import type {
		ApiGroup,
		EndpointItem,
		HttpMethod,
		ParsedSwaggerResult
	} from '$lib/types/swagger-catalog';

	const sessionState = fromStore(swaggerSession);
	const methods: Array<'all' | HttpMethod> = [
		'all',
		'get',
		'post',
		'put',
		'patch',
		'delete',
		'options',
		'head',
		'trace'
	];

	let swaggerUrl = $state('');
	let searchText = $state('');
	let methodFilter = $state<'all' | HttpMethod>('all');
	let isLoading = $state(false);
	let errorMessage = $state('');

	const activeDocument = $derived.by(() => {
		const state = sessionState.current;
		if (!state.activeId) {
			return null;
		}

		return state.documents.find((doc) => doc.id === state.activeId) ?? null;
	});

	const filteredGroups = $derived.by(() => {
		if (!activeDocument) {
			return [] as ApiGroup[];
		}

		const query = searchText.trim().toLowerCase();
		return activeDocument.result.apiGroups
			.map((group) => {
				const controllers = group.controllers
					.map((controller) => {
						const endpoints = controller.endpoints.filter((endpoint) => {
							const matchesMethod = methodFilter === 'all' || endpoint.method === methodFilter;
							if (!matchesMethod) {
								return false;
							}

							if (!query) {
								return true;
							}

							const text = [
								endpoint.path,
								endpoint.summary,
								endpoint.description,
								endpoint.operationId,
								endpoint.tags.join(' ')
							]
								.filter(Boolean)
								.join(' ')
								.toLowerCase();

							return text.includes(query);
						});

						if (endpoints.length === 0) {
							return null;
						}

						return {
							...controller,
							endpointCount: endpoints.length,
							endpoints
						};
					})
					.filter(
						(controller): controller is NonNullable<typeof controller> => controller !== null
					);

				if (controllers.length === 0) {
					return null;
				}

				const endpointCount = controllers.reduce(
					(acc, controller) => acc + controller.endpointCount,
					0
				);

				return {
					...group,
					endpointCount,
					controllers
				};
			})
			.filter((group): group is NonNullable<typeof group> => group !== null);
	});

	const filteredEndpointCount = $derived.by(() =>
		filteredGroups.reduce((acc, group) => acc + group.endpointCount, 0)
	);

	async function addSwaggerUrl(event: SubmitEvent) {
		event.preventDefault();

		const trimmed = swaggerUrl.trim();
		if (!trimmed) {
			errorMessage = 'Informe a URL do Swagger/OpenAPI.';
			return;
		}

		isLoading = true;
		errorMessage = '';

		try {
			const response = await fetch('/api/swagger', {
				method: 'POST',
				headers: {
					'content-type': 'application/json'
				},
				body: JSON.stringify({ url: trimmed })
			});

			const payload = (await response.json()) as ParsedSwaggerResult | { error?: string };

			if (!response.ok || !('apiGroups' in payload)) {
				const responseError =
					typeof payload === 'object' && payload !== null && 'error' in payload
						? payload.error
						: undefined;

				throw new Error(responseError ?? 'Falha ao processar a URL informada.');
			}

			swaggerSession.upsert(trimmed, payload);
			swaggerUrl = '';
		} catch (error) {
			errorMessage =
				error instanceof Error ? error.message : 'Erro inesperado ao carregar o swagger.';
		} finally {
			isLoading = false;
		}
	}

	function activateDocument(id: string): void {
		swaggerSession.setActive(id);
	}

	function removeDocument(id: string): void {
		swaggerSession.remove(id);
	}

	function clearSession(): void {
		swaggerSession.clear();
	}

	function formatMethod(method: HttpMethod): string {
		return method.toUpperCase();
	}

	function methodClass(method: HttpMethod): string {
		switch (method) {
			case 'get':
				return 'method get';
			case 'post':
				return 'method post';
			case 'put':
				return 'method put';
			case 'patch':
				return 'method patch';
			case 'delete':
				return 'method delete';
			default:
				return 'method default';
		}
	}

	function endpointKey(endpoint: EndpointItem): string {
		return `${endpoint.method}:${endpoint.path}:${endpoint.operationId}`;
	}
</script>

<svelte:head>
	<title>Catalogo de APIs Swagger</title>
	<meta
		name="description"
		content="Importe URLs Swagger/OpenAPI, organize endpoints por API, controller e endpoint, e mantenha a navegacao em memoria de sessao."
	/>
</svelte:head>

<main class="page">
	<section class="hero">
		<h1>Catalogo Dinamico de APIs</h1>
		<p>
			Importe uma ou varias URLs Swagger/OpenAPI. O sistema interpreta versoes Swagger 2.0 e OpenAPI
			3.x automaticamente, sem configuracao manual.
		</p>

		<form class="import-form" onsubmit={addSwaggerUrl}>
			<input
				type="url"
				bind:value={swaggerUrl}
				placeholder="https://api.exemplo.com/swagger/v1/swagger.json"
				autocomplete="off"
				required
			/>
			<button type="submit" disabled={isLoading}>{isLoading ? 'Lendo...' : 'Adicionar URL'}</button>
		</form>

		{#if errorMessage}
			<p class="error">{errorMessage}</p>
		{/if}
	</section>

	<section class="content">
		<aside class="sources">
			<div class="aside-header">
				<h2>Swaggers na sessao</h2>
				{#if sessionState.current.documents.length > 0}
					<button type="button" class="clear-btn" onclick={clearSession}>Limpar</button>
				{/if}
			</div>

			{#if sessionState.current.documents.length === 0}
				<p class="empty">Nenhuma URL adicionada nesta sessao.</p>
			{:else}
				<ul class="source-list">
					{#each sessionState.current.documents as doc (doc.id)}
						<li class:active={sessionState.current.activeId === doc.id}>
							<button type="button" class="source-item" onclick={() => activateDocument(doc.id)}>
								<strong>{doc.result.title}</strong>
								<span>{doc.result.documentVersion}</span>
								<span>{doc.result.totalEndpoints} endpoint(s)</span>
								<small>{doc.url}</small>
							</button>
							<button type="button" class="remove-btn" onclick={() => removeDocument(doc.id)}>
								Remover
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</aside>

		<section class="catalog">
			{#if !activeDocument}
				<div class="empty-catalog">
					<h2>Pronto para mapear APIs</h2>
					<p>
						Adicione uma URL Swagger/OpenAPI para visualizar agrupamentos por API principal,
						controller e endpoint.
					</p>
				</div>
			{:else}
				<header class="catalog-header">
					<div>
						<h2>{activeDocument.result.title}</h2>
						<p>
							{activeDocument.result.documentVersion} • {activeDocument.result.totalEndpoints}
							endpoint(s)
						</p>
					</div>

					<div class="filters">
						<input
							type="search"
							bind:value={searchText}
							placeholder="Buscar por path, tag ou operationId"
						/>
						<select bind:value={methodFilter}>
							{#each methods as method (method)}
								<option value={method}
									>{method === 'all' ? 'Todos os metodos' : method.toUpperCase()}</option
								>
							{/each}
						</select>
					</div>
				</header>

				<p class="result-count">{filteredEndpointCount} endpoint(s) no filtro atual</p>

				{#if filteredGroups.length === 0}
					<p class="empty">Nenhum endpoint corresponde ao filtro aplicado.</p>
				{:else}
					<div class="groups">
						{#each filteredGroups as apiGroup (apiGroup.name)}
							<article class="api-group">
								<h3>/ {apiGroup.name} <span>{apiGroup.endpointCount}</span></h3>

								{#each apiGroup.controllers as controller (controller.name)}
									<details open>
										<summary>
											<strong>{controller.name}</strong>
											<span>{controller.endpointCount} endpoint(s)</span>
										</summary>

										<ul>
											{#each controller.endpoints as endpoint (endpointKey(endpoint))}
												<li>
													<span class={methodClass(endpoint.method)}
														>{formatMethod(endpoint.method)}</span
													>
													<div>
														<p class="path">{endpoint.path}</p>
														{#if endpoint.summary}
															<p>{endpoint.summary}</p>
														{/if}
														{#if endpoint.operationId}
															<small>operationId: {endpoint.operationId}</small>
														{/if}
													</div>
												</li>
											{/each}
										</ul>
									</details>
								{/each}
							</article>
						{/each}
					</div>
				{/if}
			{/if}
		</section>
	</section>
</main>

<style>
	:global(body) {
		margin: 0;
		font-family: 'Space Grotesk', 'Segoe UI', sans-serif;
		background:
			radial-gradient(circle at 10% 0%, rgb(255 177 122 / 22%), transparent 35%),
			radial-gradient(circle at 90% 20%, rgb(98 196 255 / 18%), transparent 40%), #0f1722;
		color: #e9eef5;
	}

	.page {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem 1rem 3rem;
	}

	.hero {
		background: linear-gradient(135deg, rgb(18 31 53 / 95%), rgb(24 54 69 / 92%));
		border: 1px solid rgb(255 255 255 / 12%);
		border-radius: 1rem;
		padding: 1.4rem;
		box-shadow: 0 18px 40px rgb(2 8 20 / 35%);
	}

	h1 {
		margin: 0;
		font-size: clamp(1.6rem, 3vw, 2.4rem);
		letter-spacing: 0.02em;
	}

	.hero p {
		margin: 0.8rem 0 0;
		color: #bfd2e6;
	}

	.import-form {
		display: grid;
		gap: 0.8rem;
		grid-template-columns: 1fr auto;
		margin-top: 1.2rem;
	}

	.import-form input,
	.filters input,
	.filters select {
		background: rgb(11 20 35 / 78%);
		border: 1px solid rgb(255 255 255 / 16%);
		border-radius: 0.65rem;
		padding: 0.7rem 0.8rem;
		color: #f1f5fb;
	}

	button {
		border: 0;
		border-radius: 0.65rem;
		padding: 0.7rem 1rem;
		font-weight: 700;
		cursor: pointer;
		background: linear-gradient(135deg, #ffd66b, #ff926b);
		color: #1f2129;
	}

	button:disabled {
		opacity: 0.7;
		cursor: wait;
	}

	.error {
		margin-top: 0.8rem;
		color: #ffad9e;
	}

	.content {
		display: grid;
		grid-template-columns: minmax(260px, 320px) 1fr;
		gap: 1rem;
		margin-top: 1rem;
	}

	.sources,
	.catalog {
		background: rgb(7 14 26 / 82%);
		border: 1px solid rgb(255 255 255 / 10%);
		border-radius: 1rem;
		padding: 1rem;
	}

	.aside-header,
	.catalog-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.8rem;
	}

	.aside-header h2,
	.catalog-header h2 {
		margin: 0;
		font-size: 1.1rem;
	}

	.clear-btn,
	.remove-btn {
		padding: 0.4rem 0.6rem;
		font-size: 0.8rem;
	}

	.source-list {
		list-style: none;
		padding: 0;
		margin: 0.8rem 0 0;
		display: grid;
		gap: 0.7rem;
	}

	.source-list li {
		border: 1px solid rgb(255 255 255 / 10%);
		border-radius: 0.8rem;
		padding: 0.55rem;
		display: grid;
		gap: 0.4rem;
	}

	.source-list li.active {
		border-color: rgb(255 206 127 / 85%);
		box-shadow: 0 0 0 1px rgb(255 206 127 / 50%);
	}

	.source-item {
		text-align: left;
		padding: 0;
		background: transparent;
		color: inherit;
	}

	.source-item span,
	.source-item small {
		display: block;
		color: #b8c9dd;
	}

	.source-item small {
		margin-top: 0.25rem;
		font-size: 0.72rem;
		word-break: break-word;
	}

	.empty-catalog {
		padding: 2rem 1rem;
		text-align: center;
		border: 1px dashed rgb(255 255 255 / 18%);
		border-radius: 0.8rem;
	}

	.filters {
		display: grid;
		gap: 0.6rem;
		grid-template-columns: 1fr auto;
	}

	.result-count,
	.empty {
		margin-top: 0.7rem;
		color: #c7d7ea;
	}

	.groups {
		display: grid;
		gap: 0.8rem;
		margin-top: 0.8rem;
	}

	.api-group {
		border: 1px solid rgb(255 255 255 / 10%);
		border-radius: 0.8rem;
		padding: 0.75rem;
	}

	.api-group h3 {
		margin: 0 0 0.5rem;
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}

	.api-group h3 span {
		font-size: 0.9rem;
		color: #c5d6ea;
	}

	details {
		border-top: 1px solid rgb(255 255 255 / 10%);
		padding-top: 0.5rem;
		margin-top: 0.5rem;
	}

	summary {
		display: flex;
		justify-content: space-between;
		align-items: center;
		cursor: pointer;
		list-style: none;
	}

	ul {
		list-style: none;
		padding: 0;
		margin: 0.5rem 0 0;
		display: grid;
		gap: 0.4rem;
	}

	li {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.65rem;
		align-items: start;
		padding: 0.45rem 0.5rem;
		border-radius: 0.6rem;
		background: rgb(255 255 255 / 4%);
	}

	.path {
		margin: 0;
		font-weight: 700;
	}

	li p,
	li small {
		margin: 0;
		color: #bed0e2;
	}

	.method {
		padding: 0.18rem 0.4rem;
		border-radius: 0.35rem;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.05em;
	}

	.method.get {
		background: rgb(41 193 148 / 25%);
		color: #5ef3b8;
	}

	.method.post {
		background: rgb(255 183 64 / 20%);
		color: #ffd58f;
	}

	.method.put {
		background: rgb(103 167 255 / 22%);
		color: #b6d6ff;
	}

	.method.patch {
		background: rgb(132 114 255 / 20%);
		color: #cdc4ff;
	}

	.method.delete {
		background: rgb(255 120 120 / 20%);
		color: #ffb7b7;
	}

	.method.default {
		background: rgb(190 200 215 / 20%);
		color: #d9e2f0;
	}

	@media (max-width: 920px) {
		.content {
			grid-template-columns: 1fr;
		}

		.import-form,
		.filters {
			grid-template-columns: 1fr;
		}

		li {
			grid-template-columns: 1fr;
		}
	}
</style>
