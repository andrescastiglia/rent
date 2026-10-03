# Asistente de aplicación

`POST /ai/tools/respond` y `POST /ai/respond` reciben `prompt`, `conversationId`
y, opcionalmente, `channel` (`web` o `mobile`) y `currentPath` (ruta con locale).
El backend de WhatsApp establece su canal internamente. El cliente nunca envía
el contenido de formularios ni contraseñas como contexto de pantalla.

El catálogo de navegación se genera desde todas las páginas reales de Next y sus
componentes mediante `node scripts/generate-assistant-pages.cjs`. El comando
`--check` verifica que las copias del backend y frontend estén actualizadas.
Incluye rutas de detalle, edición, creación, portales y configuración, con roles,
permisos y nombres de controles. Excluye autenticación, redirecciones y callbacks OAuth.

En web, el modelo dispone de consultas autorizadas y `show_application_page`.
Esta acción abre la página/formulario y muestra el globo sobre el campo real.
Antes de abrir un registro, sus identificadores deben obtenerse con consultas
permitidas. Rutas desconocidas, controles ajenos y parámetros que puedan iniciar
operaciones son rechazados. Los editores dentro de listas cargan el registro por
su API normal, incluso cuando no aparece en la página actual de resultados.
Únicamente botones registrados para abrir editores pueden activarse automáticamente.
No se completan valores ni se presiona Guardar, Confirmar o Enviar. Las herramientas
mutables están excluidas del chat web y el ejecutor rechaza su ejecución en ese canal.

Las consultas de cualquier recurso habilitado se responden en el mismo chat con
Markdown simple. Web y WhatsApp usan el catálogo completo de herramientas en vivo,
con empresa, roles y permisos originales. Las consultas siguen disponibles cuando
se solicita una modificación para resolver nombres y registros antes de proponerla.
La consulta del contenido de documentos conserva el RAG cuando está habilitado.
WhatsApp nunca recibe acciones de interfaz: sus cambios se guardan como propuestas
pendientes para revisión y confirmación desde el panel web. Una confirmación por
WhatsApp no ejecuta la propuesta.

La ayuda conserva una solicitud durante la navegación y espera a que cargue el
control. También funciona con sugerencias automáticas pausadas. El historial no
repite acciones. La contraseña conserva una guía local especial para evitar enviar
secretos al proveedor; no es el límite del asistente. Los globos de otros formularios
usan sus controles reales y las instrucciones de la acción validada.

«Quiero ver la cobranza del día de hoy» consulta
`get_payments_collection_summary` con la fecha de Buenos Aires. El resumen usa
fecha de pago, estado `completed` e importes netos de devoluciones, separados por
moneda. Una única consulta PostgreSQL calcula los totales de todos los registros
y devuelve hasta 20 detalles; nunca calcula el total sobre una página. La respuesta
se conserva y se muestra en el chat como Markdown simple, sin navegar. La herramienta
respeta el modo de IA, la empresa y el permiso `payments` de administradores/personal.
Consultas de cobranza con nombres u otros filtros usan las herramientas en vivo
para no perder restricciones solicitadas ni tomar evidencia RAG paginada como total.

Las consultas libres continúan usando el proveedor configurado y las herramientas
autorizadas. Las instrucciones de contexto, fecha y canal se reenvían después de
cada llamada a herramientas, porque `previous_response_id` no las conserva:
[documentación oficial de OpenAI](https://developers.openai.com/api/docs/guides/migrate-to-responses).
`reasoning.effort` se omite por defecto: `OPENAI_REASONING_EFFORT` sólo debe
configurarse con un valor compatible con el modelo elegido, conforme a la
[documentación de razonamiento](https://developers.openai.com/api/docs/guides/reasoning).

Para que el asistente web esté visible se requiere `AI_TOOLS_MODE=READONLY` o
`FULL`. Las consultas libres requieren `OPENAI_API_KEY` y `OPENAI_MODEL`; los cambios
web se guardan manualmente; las propuestas de WhatsApp requieren `FULL` y
confirmación web. WhatsApp
requiere además credenciales, consentimiento y los procesadores indicados en
[WhatsApp inbox](whatsapp-inbox.md).
