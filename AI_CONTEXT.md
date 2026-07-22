# envAIro - Contexto del Proyecto para Asistentes de IA

Este documento sirve como la fuente principal de la verdad (Single Source of Truth) para cualquier IA o desarrollador que se integre al proyecto envAIro. Contiene la arquitectura, el stack tecnológico, las reglas de negocio y las decisiones técnicas fundamentales.

## 1. Descripción General del Proyecto
**envAIro** es una aplicación web (PWA) de música colaborativa tipo "Jukebox". Permite a un "Anfitrión" crear una sesión musical en su dispositivo (computadora o tablet) y proyectar un código QR. Los "Invitados" escanean el QR para unirse a la sesión desde sus teléfonos y solicitar canciones. La aplicación cuenta con un DJ de Inteligencia Artificial (Auto DJ / envAIro) que evalúa las peticiones de los usuarios en tiempo real.

## 2. Stack Tecnológico
- **Frontend:** React + Vite
- **Navegación:** React Router DOM
- **Estilos:** Tailwind CSS (con variables CSS personalizadas para temas y modo cristal/glassmorphism)
- **Gestión del Estado Global:** Zustand (Persistido en localStorage para configuraciones locales)
- **Backend & Base de Datos:** Supabase (PostgreSQL, Auth, Edge Functions, Realtime)
- **Motor de Reproducción:** YouTube Iframe API (Exclusivo)
- **PWA:** `vite-plugin-pwa` para instalación y offline support

## 3. Decisiones Técnicas Críticas y Restricciones (CRITICAL RULES)

### A. Exclusividad de YouTube (Adiós Spotify)
- **Contexto Histórico:** Inicialmente la app soportaba Spotify, pero debido a restricciones de la API pública y el Web Playback SDK (necesidad de Spotify Premium y problemas de tokens), **Spotify fue eliminado por completo de la base de código**.
- **Regla:** **NUNCA** sugieras, implementes o restaures importaciones de `spotifyApi`, `useSpotifySDK` o `spotifyAuth`. Todo el audio proviene de YouTube. Las búsquedas de canciones devuelven resultados mapeados para reproducirse como videos ocultos o minimizados de YouTube.

### B. Autenticación Estricta
- **Regla:** El acceso para Anfitriones se realiza **únicamente mediante Correo y Contraseña** gestionado por Supabase Auth.
- No se utilizan proveedores OAuth (ni Google, ni Spotify) para el inicio de sesión.

### C. Arquitectura de Sincronización (Host vs. Guest vs. Remote)
El estado de la reproducción de la música no es peer-to-peer, sino que se sincroniza a través de **Supabase Realtime**.
1. **Host Principal (Reproductor):** El dispositivo donde se inicia la sesión (usualmente una PC conectada a altavoces). Ejecuta el `PersistentPlayer` (YouTube SDK), maneja la cola (`queue`) real y avanza las canciones. Envía actualizaciones constantes a la tabla `sessions` en Supabase.
2. **Control Remoto:** Si un Anfitrión inicia sesión en su teléfono escaneando su propio QR, entra en `isAdminMode`. Funciona como un "Guest con superpoderes", pudiendo enviar comandos (Play, Pause, Skip) a través de canales de `broadcast` en Supabase Realtime, los cuales el Host Principal intercepta y ejecuta.
3. **Guest (Invitado):** Interfaz limitada. Solo ven la canción actual, la cola y pueden buscar/pedir canciones. Las peticiones se guardan en la tabla `requests`.

### D. Métricas
- Las métricas de la pestaña "Métricas" (Dashboard) se basan estrictamente en la tabla de peticiones (`requests`) filtrando eventos del sistema. **Solo se cuentan las canciones solicitadas por usuarios reales**, ignorando las añadidas por el "Auto DJ" o el sistema por defecto.

## 4. Estructura de Stores (Zustand)
La lógica de negocio reside casi enteramente en hooks de Zustand:
- `usePlayerStore.js`: Maneja el núcleo de la reproducción. Controla la `queue` (cola), el `currentTrack` (canción actual), el `progress` (progreso en ms) y los comandos de reproducción hacia YouTube.
- `useSettingsStore.js`: Maneja el estado de la sesión, configuración del Host, `sessionId`, secret keys, lista negra/blanca de géneros y configuraciones del Auto DJ (envAIro).
- `useAuthStore.js`: Controla el estado del usuario (`session` de Supabase).
- `useLanguageStore.js`: Maneja las traducciones y cadenas de texto (i18n de forma manual y simplificada).

## 5. Auto DJ vs envAIro Selector
Aunque trabajan en conjunto para automatizar la música, son dos funcionalidades completamente distintas:
- **Auto DJ (Filtro automatizado):** Se encarga de evaluar las peticiones de los invitados que entran a la tabla `requests` con estado `pending`. El Host ejecuta localmente el hook correspondiente (`useAutoQueue.js`) que invoca una Edge Function en Supabase (`evaluate-request`) para revisar si la canción cumple con las reglas (Whitelist, Blacklist) y la aprueba o rechaza automáticamente.
- **envAIro Selector (IA proactiva):** Es la funcionalidad encargada de inyectar y sugerir nuevas canciones. Se ejecuta mediante el hook `useEnairoSelector.js` para añadir pistas a la cola automáticamente basándose en el contexto cuando el ambiente lo requiere (por ejemplo, cuando la cola se vacía).

## 6. Flujo de Archivos Clave
- `src/hooks/useQueueSync.js`: **EL ARCHIVO MÁS IMPORTANTE PARA EL MULTIJUGADOR**. Escucha los cambios de Supabase Realtime (tabla `sessions`, `requests` y eventos `broadcast`) y sincroniza el estado de Zustand entre los diferentes dispositivos.
- `src/components/layout/PersistentPlayer.jsx`: Interfaz visual del reproductor inferior y puente entre los controles de la UI y el `usePlayerStore`.
- `src/hooks/useYouTubeSDK.js`: Inicializa e interactúa directamente con la Iframe API de YouTube. Convierte las búsquedas o IDs a reproducción de video.

## 7. Instrucciones para la IA (Tú)
1. Antes de modificar lógica de estado cruzado, revisa `useQueueSync.js` y `usePlayerStore.js`.
2. Mantén los estilos consistentes usando las clases de Tailwind predefinidas y el modo "Glassmorphism" (`glass`, `card`, `btn-primary`, etc.).
3. Si ocurre un error de compilación o ejecución, asume que puede ser un remanente de código antiguo (ej. librerías eliminadas) y usa `grep_search` para buscar referencias rotas antes de reescribir funciones completas.
4. Todo texto nuevo visible para el usuario debe registrarse en `useLanguageStore.js` para mantener el soporte multilingüe.
