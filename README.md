# Onda IPTV

Reproductor web instalable en español para listas M3U propias. Incluye televisión en directo, favoritos reordenables, último canal, ranking de los últimos 30 días, guía XMLTV, catálogo de películas y series, reanudación y envío a Google Cast.

## Publicar en GitHub Pages

1. Descomprime el ZIP y crea un repositorio en GitHub, por ejemplo `onda-iptv`.
2. Sube **el contenido** de la carpeta `Onda-IPTV` a la rama `main`. Deja `index.html`, `sw.js` y `manifest.webmanifest` en la raíz del repositorio, junto con sus carpetas `assets` y `vendor`. Incluye el archivo vacío `.nojekyll`.
3. En **Settings → Pages**, selecciona **Deploy from a branch → main → / (root)** y pulsa **Save**.
4. Cuando termine el despliegue, usa **Visit site**. El enlace habitual es `https://TU-USUARIO.github.io/onda-iptv/`.

[Documentación de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

La app es estática y sus rutas son relativas. Puedes publicar directamente los archivos, sin configurar Node, claves ni un servidor.

## Probar e instalar

Desde la carpeta del proyecto, ejecuta `python3 -m http.server 8000` y abre `http://localhost:8000/`. Utiliza **Probar demostración** para explorar la guía y el catálogo. Todas las entradas de demostración reproducen el mismo vídeo de prueba. La programación es ilustrativa.

En la web publicada, selecciona **Instalar** si el navegador muestra esa opción. En Safari para iPhone o iPad puedes usar **Compartir → Añadir a pantalla de inicio**. Tras la primera carga, la interfaz y los datos ya guardados se pueden consultar sin conexión. Las emisiones de tu proveedor requieren acceso a su servidor.

## Listas y guía

- Puedes importar un enlace HTTPS o un archivo local M3U con direcciones absolutas. Las listas importadas por URL también admiten rutas relativas a su ubicación.
- Para actualizar una lista de archivo, utiliza **Ajustes → Actualizar lista** y selecciona su nueva versión. Si una actualización falla, se conserva la última lista válida.
- La guía se obtiene de la cabecera M3U (`x-tvg-url` o `url-tvg`) o de la URL XMLTV que guardes en Ajustes. Se admite XMLTV comprimido en gzip en navegadores con `DecompressionStream`.
- Las listas, credenciales, favoritos, historial y posiciones se guardan en IndexedDB del navegador. Los enlaces pueden contener datos privados. Introdúcelos en la app después de publicarla y guarda el repositorio sin tus listas personales.

## Compatibilidad de reproducción

GitHub Pages sirve la app por HTTPS. Utiliza fuentes HTTPS para evitar el bloqueo por contenido mixto. El servidor debe permitir CORS en las peticiones de listas, guías y emisiones HLS reproducidas mediante hls.js. Si solo falla la importación de una lista por URL, puedes descargar su archivo e importarlo desde el dispositivo.

Se admite HLS (`.m3u8` o MIME indicado en la lista) y los formatos que el navegador pueda reproducir directamente, como MP4 con H.264/AAC. El contenedor y los códecs disponibles dependen del navegador. Los controles nativos ofrecen audio o subtítulos cuando el navegador y el formato los admiten.

Para Google Cast, usa un navegador compatible y un receptor de la misma red. La TV abre la emisión directamente desde su URL. La compatibilidad depende del formato y el acceso del receptor al servidor. En caso de fallo, la app permite seguir en el dispositivo. Pruébalo con un directo y con una película o episodio antes de usarlo con tu lista habitual.

[Compatibilidad multimedia de Google Cast](https://developers.google.com/cast/docs/media)

## Archivos del proyecto

| Archivo | Función |
| --- | --- |
| `index.html`, `style.css`, `app.js` | Interfaz y flujo de reproducción |
| `data.js` | Listas M3U, guía XMLTV, búsqueda y almacenamiento |
| `cast.js` | Conexión y controles Google Cast |
| `manifest.webmanifest`, `sw.js` | Instalación y caché de la interfaz |
| `vendor/hls.min.js` | hls.js 1.6.15, con su licencia Apache 2.0 incluida |
