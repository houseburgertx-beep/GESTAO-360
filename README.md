# BrassaOps — Sistema de Gestão de Hamburgueria (Mobile-First PWA + Takeat + Supabase)

Aplicativo Web Mobile-First (**PWA instalável no iPhone e Android**) desenvolvido para o gerente de hamburgueria controlar **toda a operação sem esquecer absolutamente nada**, conectado diretamente à **API Pública Oficial da Takeat** (`https://public-api.takeat.app`) e preparado para banco em nuvem no **Supabase**.

## Módulos Incluídos

1. **Central "Hoje / Meu Turno" (Anti-Esquecimento):** linha do tempo de abertura → operação → fechamento, semáforo de atrasos, radar de ruptura/manutenção e passagem de turno com confirmação de leitura.
2. **Rotinas, Checklists, Temperaturas (PVPS) & Organização 5S:** recorrência diária/semanal/mensal, validação automática de faixas de temperatura (°C), captura de foto da câmera do celular, nota 5S e geração automática de Plano de Ação em itens não conformes.
3. **Estoque, Desperdício & Contagens (Takeat):** insumos e intermediários (com receitas), registro de desperdício em 3 toques com custo em R\$, contagem física guiada ou cega com envio oficial via `POST /v1/inventory/*/counts/bulk` (`stock_version`, `Idempotency-Key` e proteção HTTP `409`), radar de **Divergência Invisível** e pausa rápida de cardápio (`PATCH /v1/products/{id}/availability`).
4. **Compras Inteligentes & NF-e Recebidas:** lista automática baseada em `ideal_stock − quantidade` (com multiplicador de fim de semana), disparo de pedido no **WhatsApp** por fornecedor e conferência de NF-e Takeat com **Radar de Inflação de Preços**.
5. **CMV Real × Teórico, Faturamento, KDS & Financeiro:** faturamento em tempo real, canais e pagamentos, decomposição do Gap de CMV, curva ABC com margem por ficha técnica, tempos de preparo KDS, avaliações e contas a pagar.
6. **Manutenção Preventiva & Corretiva:** inventário de equipamentos (chapa, fritadeira, coifa, câmara fria, caixa de gordura), agenda preventiva automática, chamados com foto e WhatsApp do técnico.
7. **Ocorrências (Diário de Bordo) & Planos de Ação (5W2H):** registro estruturado por categoria/gravidade que se converte em planos 5W2H com dono, prazo e evidência.
8. **Perfis & Permissões:** Dono / Admin, Gerente e Líder / Equipe (com troca rápida nas Configurações para testar permissões).

## Como Rodar Localmente

```bash
npm install
npm run dev
```

Acesse `http://localhost:3000` (ou pelo IP da sua rede local no celular e toque em **"Adicionar à Tela de Início"** para instalar como app PWA).

> Sem configurar variáveis de ambiente, o sistema inicia automaticamente em **Modo Demonstração Realista** (dados salvos no navegador para testar tudo imediatamente).

## Como Conectar ao Supabase e à API Oficial Takeat

1. Copie `.env.example` para `.env.local`.
2. **Supabase:** crie um projeto no Supabase, execute os arquivos em `supabase/migrations/0001_initial_schema.sql` e `0002_seed_templates.sql` no SQL Editor e preencha `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`.
3. **Takeat:** preencha `TAKEAT_MODE=live`, `TAKEAT_API_KEY` e `TAKEAT_RESTAURANT_ID` no `.env.local` (variáveis estritamente server-side; nunca expostas ao celular).

## Testes e Verificação

```bash
npm test        # Testes unitários (CMV, Divergência, Compras, Rotinas e Cliente Takeat)
npm run typecheck
npm run build
```
