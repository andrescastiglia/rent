# Guía técnica para la versión v22.0 de la WhatsApp Cloud API.

## Implementación en este proyecto (backend)

Endpoints expuestos:

| Endpoint | Método | Auth | Uso |
| :--- | :--- | :--- | :--- |
| `/whatsapp/messages` | `POST` | JWT | Envío de WhatsApp desde frontend/backend autenticado |
| `/whatsapp/messages/internal` | `POST` | `x-batch-whatsapp-token` | Envío interno desde batch |
| `/whatsapp/documents/:documentId?token=...` | `GET` | Público (token firmado) | Descarga pública temporal para PDFs guardados en DB (`db://document/...`) |
| `/whatsapp/webhook` | `GET` | Público | Verificación de webhook de Meta |
| `/whatsapp/webhook` | `POST` | Público | Recepción de eventos de webhook |

Variables de entorno requeridas:

- `WHATSAPP_ENABLED=true`
- `WHATSAPP_API_BASE_URL=https://graph.facebook.com/v22.0`
- `WHATSAPP_PHONE_NUMBER_ID=...`
- `WHATSAPP_ACCESS_TOKEN=...`
- `WHATSAPP_VERIFY_TOKEN=...`
- `BATCH_WHATSAPP_INTERNAL_TOKEN=...`
- `WHATSAPP_DOCUMENT_LINK_SECRET=...`

Variables recomendadas para links de documentos:

- `FRONTEND_URL=http://localhost:3000` (URL pública del frontend)
- `WHATSAPP_DOCUMENTS_BASE_URL=$FRONTEND_URL` (URL base publicada en el link de WhatsApp; opcional)
- `PORT=3001` (fallback local del backend si no se define `WHATSAPP_DOCUMENTS_BASE_URL` ni `FRONTEND_URL`)
- `WHATSAPP_DOCUMENT_LINK_TTL_SECONDS=604800` (TTL en segundos para links firmados)

### Configuración de Endpoint

| Componente | Valor |
| :--- | :--- |
| URL Base | `https://graph.facebook.com/v22.0/` |
| Versión API | v22.0 |

### Envío de Mensajes (API Call)

| Acción | Método | Endpoint |
| :--- | :--- | :--- |
| Enviar Mensaje | `POST` | `/{phone-id}/messages` |

Uso de fetch para enviar un mensaje de texto.

```JavaScript
const enviarMensaje = async (phoneId, token, to, text) => {
  const url = `https://graph.facebook.com/v22.0/${phoneId}/messages`;
  
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to,
      type: "text",
      text: { body: text }
    })
  });

  return res.json();
};
```

#### Envio mensaje con documento mediante URL

```javascript
const enviarPDF = async (phoneId, token, to, pdfUrl, filename) => {
  const url = `https://graph.facebook.com/v22.0/${phoneId}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: to,
    type: "document",
    document: {
      link: pdfUrl,
      filename: filename // Opcional: Nombre que verá el usuario
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  return res.json();
};
```

En esta implementación, cuando se envía `pdfUrl` con formato `db://document/{id}` al backend, se transforma automáticamente en una URL pública temporal firmada (`/whatsapp/documents/:id?token=...`) y se envía como mensaje `document`.

### Webhooks (Callbacks)

Para recibir mensajes, debes configurar un servidor que escuche peticiones de Meta.

| Evento | Método | Path | Descripción |
| :--- | :--- | :--- | :--- |
| Verificación | `GET` | `/webhook` | Confirmación del Verify Token |
| Recepción | `POST` | `/webhook` | Notificaciones de mensajes |

#### Verificación (GET)

```JavaScript
app.get('/webhook', (req, res) => {
  const verifyToken = "TU_TOKEN_PERSONALIZADO";
  
  if (req.query['hub.verify_token'] === verifyToken) {
    return res.status(200).send(req.query['hub.challenge']);
  }
  res.sendStatus(403);
});
```

#### Recepción de Mensajes (POST)

```JavaScript
app.post('/webhook', (req, res) => {
  const change = req.body.entry?.[0]?.changes?.[0]?.value;
  
  if (change?.messages?.[0]) {
    const from = change.messages[0].from;
    const body = change.messages[0].text.body;
    console.log(`Mensaje de ${from}: ${body}`);
  }
  
  res.sendStatus(200); // Obligatorio responder 200 OK
});
```

### Para obtener estas credenciales, debes acceder al panel de Meta for Developers

#### Phone Number ID

Es el identificador único de tu número de remitente.

- Entra a tu App en el Dashboard de Meta.
- En el menú lateral, ve a **WhatsApp > Configuración de la API** (API Setup).
- En la sección *Paso 1: Seleccionar números de teléfono*, verás el **Identificador de número de teléfono**.

#### Token de Acceso

Existen dos tipos, pero para producción necesitas el Permanente:

- Temporal (24h):
  1. Se encuentra en la misma pantalla de Configuración de la API. Útil solo para pruebas rápidas.

- Permanente:
  1. Ve a Configuración del negocio (Business Settings) en el Business Manager.
  2. En Usuarios > Usuarios del sistema, crea uno (o selecciona uno existente) con rol de Administrador.
  3. Haz clic en Generar nuevo token, selecciona tu App de WhatsApp y marca los permisos `whatsapp_business_messaging` y `whatsapp_business_management`.

### Token Personalizado (Verify Token)

Este no te lo da Meta, lo inventas tú para asegurar tu Webhook.

- En tu código Node.js, elige una cadena de texto secreta (ej: `mi_token_secreto_123`).
- En el Dashboard de Meta, ve a **WhatsApp > Configuración** (Configuration).
- En la sección Webhook, haz clic en Editar.
- Pega tu cadena de texto en el campo Token de verificación.
- Meta enviará ese token a tu servidor para confirmar que tú eres el dueño del endpoint.

### Resumen

| Credencial | Dónde se obtiene | Notas |
| :--- | :--- | :--- |
| Phone ID | Dashboard Meta > API Setup | Identifica quién envía. |
| Token | Business Settings > System Users | Usa siempre el Permanente. |
| Verify Token | Tú lo creas | Debe coincidir en tu código y en Meta. |
