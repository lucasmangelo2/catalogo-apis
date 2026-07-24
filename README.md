# Catalogo de APIs (SvelteKit)

Aplicacao frontend em SvelteKit para:

- Capturar URLs de documentos Swagger/OpenAPI
- Capturar tambem URLs de Swagger UI (index.html)
- Interpretar automaticamente Swagger 2.0 e OpenAPI 3.x (JSON ou YAML)
- Descobrir automaticamente multiplas definicoes/versionamentos expostos pelo Swagger UI
- Listar e agrupar endpoints por API principal, controller e endpoint
- Manter URLs e resultados em memoria de sessao do navegador para navegacao rapida

## Pre-requisitos

- Node.js 20+
- npm 10+

Nao e necessario instalar SvelteKit globalmente.

## Rodando localmente

```sh
npm install
npm run dev
```

Abra a URL exibida no terminal (normalmente http://localhost:5173).

## Como usar

1. Cole uma URL no campo principal. Exemplos validos:
   - URL direta da especificacao (swagger.json, openapi.json, openapi.yaml)
   - URL do Swagger UI (index.html ou rota equivalente)
2. Clique em Adicionar URL.
3. Se a URL for de Swagger UI, o sistema tenta descobrir e importar todas as definicoes/versionamentos expostos no initializer.
4. Navegue pelos grupos:
   - API principal (primeiro segmento da rota)
   - Controller (tag do endpoint ou segmento de rota)
   - Endpoint (metodo + path)
5. Use busca textual e filtro por metodo para localizar endpoints rapidamente.

## Comportamento de sessao

- URLs importadas e resultados parseados sao salvos em sessionStorage.
- Os dados permanecem durante a sessao da aba/janela.
- O botao Limpar remove todo o cache da sessao.

## Scripts

```sh
npm run dev      # ambiente de desenvolvimento
npm run check    # validacao Svelte/TypeScript
npm run build    # build de producao
npm run preview  # preview do build
npm run test     # testes (vitest)
```

## Observacoes tecnicas

- O parsing ocorre no endpoint interno /api/swagger para evitar problemas de CORS no browser.
- A API tenta parsear como JSON e, em caso de falha, faz fallback para YAML.
- Se o conteudo for HTML de Swagger UI, a API extrai as URLs de definicao e consulta cada uma automaticamente.
- Caso o documento remoto nao tenha paths, a API retorna erro orientando ajuste da URL.
