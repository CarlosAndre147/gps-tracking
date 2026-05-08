# Organização da `src/lib`

Esta pasta está organizada por domínio para reduzir acoplamento e facilitar descoberta:

- `core`: infraestrutura e contratos base (db, redis, logger, errors, response)
- `auth`: utilitários de autenticação e sessão
- `tracking`: ingestão, cache e bridge realtime de localização
- `domain`: helpers reutilizáveis de regras de negócio (audit, company scope, paginação)
- `utils`: funções puras utilitárias

## Convenção prática

- Se a lógica for específica de um módulo (ex.: users, companies), prefira `src/modules/<modulo>`.
- Use `src/lib` apenas para código reutilizável entre módulos.
- Para novos imports agrupados, prefira `@/lib/<grupo>`.
