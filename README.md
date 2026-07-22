# envAIro 🎵

envAIro es un sistema interactivo tipo "Jukebox" (rockola) diseñado para DJs, Bares, y eventos. Permite al anfitrión gestionar la reproducción de música directamente desde Spotify, mientras que los invitados pueden escanear un código QR para buscar y pedir sus canciones favoritas desde sus propios teléfonos móviles.

## ✨ Características Principales

- **Reproductor Integrado (Web Playback SDK):** Control y reproducción de la música de Spotify directamente en el navegador del Host.
- **Gestión de Peticiones en Tiempo Real:** Los invitados escanean un QR y piden canciones que aparecen al instante en el Dashboard del Host gracias a WebSockets.
- **Modos de Operación:**
  - **Modo Fiesta:** Orientado a DJs y eventos sociales (peticiones por apodo).
  - **Modo Comercial:** Orientado a Bares y Restaurantes (peticiones por número de mesa obligatorias).
- **Control Total (Listas Negras/Blancas):** Bloqueo automático por géneros no deseados (ej. Reggaeton, Metal), bloqueo de artistas específicos, o restricción estricta a una lista blanca de artistas permitidos.
- **Auto-DJ:** Un asistente inteligente que añade canciones automáticamente basadas en el historial de reproducción para que la música nunca pare cuando la cola se vacía.
- **Métricas:** Estadísticas visuales del uso de la aplicación, peticiones por hora, etc.

---

## 🏗️ Arquitectura del Proyecto

El proyecto está diseñado de forma moderna, separando el panel de administración (Host) de los clientes (Guests), utilizando una arquitectura en tiempo real.

### Tecnologías Frontend
- **React 19 & Vite:** Renderizado ultrarrápido y entorno de desarrollo veloz.
- **Tailwind CSS:** Para toda la estilización de la interfaz de usuario con un diseño "Glassmorphism" oscuro premium.
- **Zustand:** Manejo del estado global de la aplicación (`usePlayerStore`, `useSettingsStore`) persistido en `localStorage` (para el Host).
- **DnD-Kit:** Implementación fluida de Drag & Drop para reordenar la cola de reproducción en dispositivos móviles y escritorio.
- **Lucide React:** Iconografía.

### Backend y Base de Datos (Supabase)
Para evitar que la app sea exclusivamente local y permitir que cualquier invitado en cualquier lugar del mundo pueda hacer peticiones a una sesión, se utiliza **Supabase** (PostgreSQL + Realtime):
- **Tabla `sessions`**: El Host publica aquí las reglas de su sesión (qué modo está activo, qué géneros están prohibidos, etc.). Los invitados leen estas reglas en tiempo real.
- **Tabla `requests`**: Los invitados envían aquí sus canciones. El Dashboard del Host está suscrito a esta tabla y recibe la notificación instantáneamente.

### Seguridad y Autenticación
- **Host (OAuth 2.0 PKCE):** El anfitrión inicia sesión con su cuenta personal de Spotify (necesita Premium para usar el reproductor). La app guarda de forma segura los Access Tokens y Refresh Tokens en el navegador del Host.
- **Invitados (Edge Functions):** Por motivos de seguridad crítica, **los invitados no reciben el token de Spotify del Host**. En su lugar, cuando un invitado busca una canción en la app, la petición se envía a una **Supabase Edge Function** (`search-spotify`). Esta función utiliza el `Client Secret` en la nube para obtener un token de credenciales anónimas de Spotify y devolver los resultados de búsqueda de forma completamente segura.

---

## 🚀 Instalación y Despliegue

### Requisitos Previos
1. Una aplicación en el [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) (Client ID, Client Secret, y añadir tu URL local a los Redirect URIs).
2. Un proyecto gratuito en [Supabase](https://supabase.com).

### Configuración del Entorno
Crea un archivo `.env.local` en la raíz del proyecto con las claves públicas de tu base de datos:
```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key-publica
```

### Configuración de Supabase
1. **Base de Datos:** Ejecuta el contenido del archivo `supabase_schema.sql` en el SQL Editor de tu proyecto de Supabase para crear las tablas y habilitar los canales en tiempo real.
2. **Edge Function (Proxy de Spotify):**
   ```bash
   # Iniciar sesión y vincular el proyecto
   npx supabase login
   npx supabase link --project-ref tu-project-ref
   
   # Configurar los secretos en la nube (No usar comillas en los secretos)
   npx supabase secrets set SPOTIFY_CLIENT_ID=tu_client_id SPOTIFY_CLIENT_SECRET=tu_client_secret
   
   # Desplegar la función
   npx supabase functions deploy search-spotify --no-verify-jwt
   ```

### Iniciar en Desarrollo
```bash
# Instalar dependencias
npm install

# Iniciar el servidor local
npm run dev
```

La aplicación estará disponible en `http://localhost:5173`. ¡Disfruta la música! 🎧
