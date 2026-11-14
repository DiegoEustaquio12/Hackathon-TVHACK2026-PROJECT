# Módulos de dominio

- `parser.ts`: clasificación determinista y extracción; sin persistencia.
- `accounting.ts`: cálculos de ventas, costos e inventario.
- `sessions.ts`: canje y gestión de sesiones seguras.
- `whatsapp.ts` / `bedrock.ts`: adaptadores externos del lado servidor.
- `supabase/`: clientes separados para navegador y servidor.

Mantener reglas de negocio independientes de rutas y proveedores externos.
