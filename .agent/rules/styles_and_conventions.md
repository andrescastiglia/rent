---
trigger: always_on
---

# Estilo, Nomenclatura y Documentación

- Para cualquier texto visible al usuario, usar variables de **internacionalización (i18n)** y no cadenas codificadas (hardcoded strings).
- **Nomenclatura (Naming):**
    - Usar **camelCase** para variables y nombres de funciones.
    - Usar **PascalCase** para clases, componentes y Typescript interfaces/types.
    - Los nombres de los *endpoints* de la API deben seguir el formato **snake_case**.
- **Documentación:**
    - Toda función o método público debe incluir documentación de código.
    - Usar los estándares **JSDoc** (para JS/TS) o **Sphinx** (para Python) para generar docstrings/comentarios detallados para cada elemento.

