# envAIro 🎵
### El jukebox colaborativo con DJ de Inteligencia Artificial

envAIro convierte cualquier dispositivo con parlantes en una rockola inteligente para fiestas, bares o eventos. El anfitrión controla la música desde su computadora o tablet mientras sus invitados piden canciones desde sus teléfonos, simplemente escaneando un código QR.

---

## ¿Cómo funciona en 30 segundos?

```
1. El Anfitrión abre envAIro en su PC → la música empieza a sonar.
2. Muestra el código QR en pantalla (o lo proyecta en una TV).
3. Los Invitados escanean el QR con su teléfono → buscan y piden canciones.
4. El Anfitrión aprueba o rechaza peticiones desde su dashboard.
5. La IA DJ puede hacer todo eso automáticamente si el Anfitrión quiere.
```

---

## ✨ Funcionalidades principales

### Para el Anfitrión
| Función | Descripción |
|---|---|
| 🎬 **Reproductor YouTube** | Reproduce videos de YouTube como audio de fondo, en pantalla completa o en modo karaoke. |
| 📋 **Cola arrastrable** | Reordena las canciones arrastrándolas. Elimina cualquiera de la lista. |
| ⏭️ **Control total** | Play, pausa, siguiente, anterior, volumen y barra de progreso. |
| 🤖 **Auto DJ (envAIro Filter)** | Aprueba o rechaza peticiones automáticamente según tus reglas (géneros, artistas, letras explícitas). |
| 🎵 **envAIro Selector (IA proactiva)** | Añade canciones por sí sola cuando la cola se vacía, basándose en el historial y el ambiente. |
| 📊 **Métricas** | Estadísticas de uso: canciones más pedidas, peticiones por hora, artistas populares. |
| 📺 **Pantallas TV** | Conecta TVs externas al reproductor. Se sincronizan automáticamente por internet. |
| 🎤 **Modo Karaoke / Letras** | Busca automáticamente la versión karaoke o con letras de cada canción. |
| 📱 **Control Remoto** | Controla la sesión desde tu teléfono escaneando tu propio QR (con acceso de administrador). |

### Para los Invitados
| Función | Descripción |
|---|---|
| 🔍 **Buscar canciones** | Busca por nombre, artista o álbum. Resultados instantáneos. |
| 🎵 **Pedir canciones** | Un toque para enviar tu petición al anfitrión. |
| 📺 **Ver la cola** | Los invitados pueden ver qué canciones vienen a continuación. |
| ⏳ **Cooldown** | Límite configurable de peticiones por invitado y por hora para evitar spam. |

---

## 🧑‍💻 Roles de usuario

### Anfitrión (Host)
El anfitrión crea una cuenta de correo en envAIro. Desde su panel (dashboard) puede:
- Ver y gestionar todas las peticiones entrantes.
- Configurar listas negras de géneros, artistas o canciones específicas.
- Activar el Auto DJ para dejar que la IA maneje todo.
- Conectar pantallas TV externas para mostrar los videos.
- Regenerar el código QR en cualquier momento para resetear el acceso.

> **La sesión persiste en la nube.** Si recargas la página o cambias de dispositivo, la música continúa desde donde estaba.

### Invitado (Guest)
Los invitados no necesitan crear una cuenta. Simplemente escanean el código QR con la cámara de su teléfono.

**Sistema de acceso por token (6 horas):**
1. Al escanear el QR, el invitado recibe automáticamente un pase personal válido por **6 horas**.
2. Durante esas 6 horas puede pedir canciones libremente (sujeto a los límites del anfitrión).
3. Pasadas las 6 horas, necesita volver a escanear el QR para renovar su acceso.
4. Si el anfitrión regenera el QR, los pases anteriores dejan de poder renovarse.

### Control Remoto (Host desde el teléfono)
Si el anfitrión escanea su **propio QR de administrador** (diferente al QR de invitados, está en el dashboard), entra en modo de control remoto:
- Puede pausar, reproducir, saltar canciones y ajustar el volumen desde su teléfono.
- **No reproduce audio** — eso lo sigue haciendo la computadora principal.
- Solo puede haber un control remoto activo a la vez. Conectar uno nuevo desconecta el anterior.

### Pantalla TV (TV Display)
Abre `/tv` en el navegador de cualquier Smart TV o computadora adicional. La TV:
- Muestra el video de YouTube sincronizado en tiempo real con el reproductor principal.
- Se vincula al anfitrión mediante un PIN de 6 dígitos o escaneando el QR de la TV desde el dashboard.
- Funciona por internet (no necesita estar en la misma red que el anfitrión).
- Recuerda la sesión aunque se recargue la página.

---

## 🎚️ Modos de reproducción

| Modo | Comportamiento |
|---|---|
| **Normal** | Reproduce la versión oficial del video en YouTube. |
| **Letras** | Busca automáticamente la versión con letras de cada canción. |
| **Karaoke** | Busca la versión instrumental/karaoke con letra de cada canción. |

Los modos Letras y Karaoke son mutuamente excluyentes. Activar uno desactiva el otro automáticamente.

> **Pre-carga inteligente:** Mientras suena la canción actual, envAIro ya está buscando en segundo plano el video karaoke/letras de las próximas 5 canciones, para que el cambio sea instantáneo.

---

## 🤖 Auto DJ — envAIro Filter

Cuando el Auto DJ está activado, cada petición nueva pasa por un evaluador de IA antes de llegar al anfitrión.

**Reglas que el anfitrión puede configurar:**
- **Lista negra de géneros** — ej. bloquear reggaetón, metal, etc.
- **Lista negra de artistas** — bloquear artistas específicos.
- **Lista negra de canciones** — bloquear canciones puntuales.
- **Filtro de contenido explícito** — rechaza canciones con lenguaje adulto.
- **Cooldown entre repeticiones** — evita que la misma canción suene dos veces en X minutos.
- **Límite de peticiones** — máximo de peticiones por invitado y por hora.

Las peticiones que pasen el filtro se aprueban y se añaden a la cola automáticamente. Las que fallen se rechazan con una razón específica.

---

## 🛠️ Instalación (Para desarrolladores)

### Requisitos
- **Node.js 18+**
- **Una cuenta gratuita en [Supabase](https://supabase.com)**
- **Una API Key de YouTube Data API v3** (gratis en [Google Cloud Console](https://console.cloud.google.com))

### 1. Clona el repositorio e instala dependencias
```bash
git clone <url-del-repo>
cd envairo
npm install
```

### 2. Configura las variables de entorno
Crea un archivo `.env.local` en la raíz del proyecto:
```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key-publica
VITE_YOUTUBE_API_KEY=tu-api-key-de-youtube
```

### 3. Configura la base de datos en Supabase
1. Ve a tu proyecto en [supabase.com](https://supabase.com).
2. Abre el **SQL Editor**.
3. Copia y pega el contenido del archivo `supabase_schema.sql` y ejecútalo.

Esto crea las tablas `sessions`, `requests`, `playlists` y `youtube_blocked_videos`, habilita Realtime y define todas las funciones de seguridad (RPCs).

> Adicionalmente, deberás ejecutar la migración `supabase/migrations/20260804_qr_token_expiry.sql` para el sistema de tokens de invitados.

### 4. Inicia el servidor de desarrollo
```bash
npm run dev
```

La app estará disponible en `http://localhost:5173`.

### 5. Despliegue en producción
El proyecto está configurado para desplegarse en **Vercel**. Solo conecta tu repositorio en [vercel.com](https://vercel.com) y agrega las mismas variables de entorno del paso 2.

---

## 🔒 Seguridad

- Los invitados **no tienen acceso directo a la base de datos**. Todas sus acciones van a través de funciones RPC validadas en el servidor.
- El `host_secret` (clave maestra del anfitrión) **nunca se almacena en el navegador** de forma persistente ni se transmite por canales públicos. Solo viaja en llamadas cifradas directas a la base de datos.
- El QR de administrador (control remoto) es diferente al QR de invitados. El anfitrión debe mantenerlo privado.
- El código QR de invitados es seguro de mostrar públicamente — solo permite pedir canciones, nada más.

---

## 📁 Estructura del proyecto

```
src/
├── pages/           # Vistas principales (Dashboard, Guest, TV, Login, Settings)
├── components/      # Componentes reutilizables (Player, QR, TV, Sidebar)
├── hooks/           # Lógica de negocio (sincronización, reproductor YouTube, IA DJ)
├── store/           # Estado global con Zustand (reproductor, configuración, auth)
└── lib/             # Clientes de Supabase y YouTube API

supabase_schema.sql  # Esquema completo de la base de datos
AI_CONTEXT.md        # Documentación técnica detallada para IAs y desarrolladores
```

---

## 🙋 Preguntas frecuentes

**¿Necesito Spotify Premium?**
No. envAIro usa YouTube para reproducir música. No requiere ninguna cuenta de Spotify.

**¿Pueden los invitados ver el historial completo de canciones?**
Los invitados ven la canción actual y la cola de próximas canciones. El historial completo solo lo ve el anfitrión.

**¿Qué pasa si la canción pedida no tiene versión karaoke?**
envAIro tiene un sistema de fallback automático: si no encuentra karaoke, intenta con la versión de letras. Si tampoco hay, reproduce la versión normal. Solo salta a la siguiente canción si no encuentra ninguna versión disponible.

**¿La sesión se pierde si recargo la página?**
No. La sesión, la cola y la canción actual se guardan en la nube (Supabase) en tiempo real. Al recargar, envAIro retoma exactamente desde donde estaba, incluyendo la posición en la canción actual.

**¿Puedo controlar la sesión desde mi teléfono mientras la PC reproduce?**
Sí. Escanea el QR de administrador desde tu teléfono para acceder al modo de control remoto.

**¿Las pantallas TV necesitan estar en la misma red Wi-Fi?**
No. La sincronización de TV funciona por internet (Supabase Realtime). La TV puede estar en cualquier lugar con conexión a internet.

---

> Para documentación técnica detallada sobre la arquitectura interna, revisa [`AI_CONTEXT.md`](./AI_CONTEXT.md).
