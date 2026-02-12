# Historias de Usuario - CRM Integrado (Interesados)

## Análisis

### Estado actual observado
- Existe un módulo de "Interesados" orientado al registro básico y al matching con propiedades.
- La información de interesados aparece en la capa funcional pero sin un flujo comercial completo (pipeline, actividades, comunicaciones, conversiones y métricas).
- Las visitas se registran en propiedades, pero no se gestionan como actividades del contacto.

### Objetivo
Convertir "Interesados" en un CRM integrado a la aplicación, con:
- Gestión completa del ciclo de vida del lead (captación, calificación, seguimiento, negociación y cierre).
- Relación explícita con propiedades, visitas, ofertas, contratos y rentas.
- Comunicaciones y tareas con trazabilidad.
- Automatizaciones mínimas (recordatorios, estados y alertas).

### Alcance funcional propuesto
- Contactos y cuentas (interesados individuales y grupos familiares/empresas).
- Embudo comercial configurable con estados y probabilidades.
- Actividades (llamadas, visitas, tareas, notas, WhatsApp).
- Matching y recomendaciones con trazabilidad de qué propiedad se sugirió y cuándo.
- Conversión de interesado a inquilino o comprador.
- Métricas básicas y tableros.
- Permisos y auditoría.

## Historias de Usuario

### 1. Modelo de Datos y Perfil 360

**ID: US-CRM-01 - Ficha Unificada del Interesado**
*Como* agente comercial,
*quiero* ver en una sola ficha los datos del interesado, sus requerimientos, actividades, propiedades sugeridas, visitas y ofertas,
*para* tomar decisiones rápidas sin navegar entre módulos.

**ID: US-CRM-02 - Entidades Relacionadas**
*Como* administrador,
*quiero* que cada interesado pueda vincularse a un grupo familiar/empresa y a un responsable comercial,
*para* gestionar relaciones complejas y la propiedad de los leads.

**ID: US-CRM-03 - Campos Dinámicos de Perfil**
*Como* administrador,
*quiero* definir campos adicionales (texto, lista, booleano) en la ficha del interesado,
*para* adaptar el CRM a criterios locales sin desarrollos.

### 2. Captación y Calificación

**ID: US-CRM-04 - Captura Multicanal**
*Como* agente,
*quiero* registrar interesados desde formularios web, carga manual o importación,
*para* centralizar todos los leads en el CRM.

**ID: US-CRM-05 - Detección de Duplicados**
*Como* sistema,
*quiero* detectar interesados duplicados por email/teléfono y sugerir unificación,
*para* evitar información inconsistente.

**ID: US-CRM-06 - Calificación Inicial (MQL/SQL)**
*Como* agente,
*quiero* marcar el nivel de calificación del interesado y el motivo,
*para* priorizar el esfuerzo comercial.

### 3. Pipeline Comercial

**ID: US-CRM-07 - Embudo Configurable**
*Como* administrador,
*quiero* definir etapas del embudo (Nuevo, Contactado, Visita, Oferta, Negociación, Ganado, Perdido),
*para* reflejar el proceso real de la inmobiliaria.

**ID: US-CRM-08 - Movimiento de Etapas con Historial**
*Como* agente,
*quiero* mover un interesado entre etapas registrando fecha, motivo y usuario,
*para* auditar el avance comercial.

**ID: US-CRM-09 - Motivos de Pérdida**
*Como* agente,
*quiero* registrar el motivo cuando un lead se pierde (precio, ubicación, desistimiento),
*para* analizar oportunidades de mejora.

### 4. Actividades y Seguimiento

**ID: US-CRM-10 - Registro de Actividades**
*Como* agente,
*quiero* registrar llamadas, mensajes de WhatsApp, visitas y tareas asociadas al interesado,
*para* llevar trazabilidad completa del seguimiento.

**ID: US-CRM-11 - Recordatorios y Vencimientos**
*Como* agente,
*quiero* recibir recordatorios de actividades pendientes o vencidas,
*para* no perder oportunidades.

**ID: US-CRM-12 - Bitácora Cronológica**
*Como* agente,
*quiero* ver una línea de tiempo con todas las actividades y cambios del interesado,
*para* comprender el contexto antes de contactarlo.

### 5. Matching y Recomendaciones

**ID: US-CRM-13 - Matching con Trazabilidad**
*Como* agente,
*quiero* registrar qué propiedades se sugirieron al interesado y su respuesta,
*para* medir efectividad del matching.

**ID: US-CRM-14 - Alertas de Coincidencias**
*Como* sistema,
*quiero* alertar cuando una nueva propiedad cumpla el perfil del interesado,
*para* acelerar el contacto comercial.

### 6. Conversión y Cierre

**ID: US-CRM-15 - Conversión a Inquilino**
*Como* agente,
*quiero* convertir un interesado en inquilino y crear el contrato desde su ficha,
*para* evitar duplicar datos.

**ID: US-CRM-16 - Conversión a Comprador**
*Como* agente,
*quiero* convertir un interesado en comprador y vincular la venta/carpeta,
*para* registrar el cierre en el CRM.

**ID: US-CRM-17 - Cierre Automático por Contrato/Firma**
*Como* sistema,
*quiero* marcar el lead como ganado cuando se firme un contrato o se emita la primera cuota,
*para* mantener el embudo actualizado.

### 7. Comunicación Integrada

**ID: US-CRM-18 - Plantillas de Mensajes**
*Como* agente,
*quiero* usar plantillas de email/WhatsApp con variables (nombre, propiedad, precio),
*para* comunicarme más rápido y consistente.

**ID: US-CRM-19 - Registro de Envíos**
*Como* agente,
*quiero* que cada comunicación quede registrada en la ficha del interesado,
*para* tener trazabilidad y contexto.

### 8. Reportes y Métricas

**ID: US-CRM-20 - Dashboard Comercial**
*Como* administrador,
*quiero* ver métricas de leads por etapa, tasa de conversión y tiempo promedio en cada etapa,
*para* medir desempeño comercial.

**ID: US-CRM-21 - Actividad por Agente**
*Como* administrador,
*quiero* ver la cantidad de actividades y cierres por agente,
*para* gestionar productividad del equipo.

### 9. Permisos, Auditoría y Cumplimiento

**ID: US-CRM-22 - Permisos por Rol**
*Como* administrador,
*quiero* controlar qué usuarios pueden ver o editar leads y actividades,
*para* proteger la información sensible.

**ID: US-CRM-23 - Auditoría de Cambios**
*Como* administrador,
*quiero* un historial de cambios en datos críticos (estado, responsable, teléfono, email),
*para* resolver conflictos y asegurar trazabilidad.

**ID: US-CRM-24 - Consentimiento de Contacto**
*Como* sistema,
*quiero* registrar el consentimiento del interesado para comunicaciones,
*para* cumplir con buenas prácticas y normativa aplicable.
