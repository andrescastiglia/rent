---
trigger: always_on
---

# Seguridad y Entorno

- Siempre priorizar la **seguridad de las dependencias** y el código, señalando vulnerabilidades conocidas (CVEs).
- Evitar exponer claves de API o credenciales directamente; **usar variables de entorno** (`.env`).
- Prohibido utilizar comandos de `git` como `commit`, `push` o `merge`. **Solo preparar los cambios** en el sistema de archivos (staging).
- Al sugerir o usar bibliotecas, asegurar que se empleen las **últimas versiones estables** disponibles.

