import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useLanguageStore = create(
  persist(
    (set) => ({
      lang: 'es',
      setLang: (lang) => set({ lang }),
    }),
    { name: 'envairo-lang' }
  )
);

/**
 * Hook to get the translation function `t` and language controls.
 * Usage:
 *   const { t, lang, setLang } = useTranslation();
 *   t('guest.title') => "Pide tu canción" | "Request a Song"
 */
export function useTranslation() {
  const lang = useLanguageStore((s) => s.lang);
  const setLang = useLanguageStore((s) => s.setLang);

  const t = (path, vars = {}) => {
    const dict = lang === 'en' ? EN : ES;
    const keys = path.split('.');
    let value = dict;
    for (const key of keys) {
      value = value?.[key];
      if (value === undefined) break;
    }
    // Fallback to ES if key missing in EN
    if (value === undefined && lang !== 'es') {
      let fallback = ES;
      for (const key of keys) {
        fallback = fallback?.[key];
        if (fallback === undefined) break;
      }
      value = fallback;
    }
    if (typeof value !== 'string') return path;
    // Replace {{var}} placeholders
    return value.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
  };

  return { t, lang, setLang };
}

// ─── Spanish ─────────────────────────────────────────────────────────────────
const ES = {
  lang: {
    es: 'Español',
    en: 'English',
  },
  nav: {
    dashboard: 'Dashboard',
    metrics: 'Métricas',
    activities: 'Actividades',
    settings: 'Configuración',
    support: 'Soporte',
    logout: 'Cerrar sesión',
    remote: 'Control Remoto',
    remoteMode: 'Modo Admin',
  },
  guest: {
    title: 'Pide tu canción',
    subtitle_party: 'Modo Fiesta 🎉',
    subtitle_commercial: 'Bar / Restaurante',
    label_table: 'Mesa (obligatorio)',
    label_nickname: 'Tu apodo (opcional)',
    placeholder_table: 'Ej: Mesa 7',
    placeholder_nickname: 'Ej: DJ Carlos 🎧',
    select_table: '-- Seleccionar mesa --',
    no_table: 'No especificar mesa',
    search_label: 'Buscar canción en Spotify',
    search_placeholder: 'Busca por título, artista o álbum...',
    submit: 'Enviar petición',
    submit_cooldown: 'Espera {{time}}',
    sent_success: '¡"{{name}}" enviada al anfitrión!',
    cooldown_label: 'Puedes pedir de nuevo en',
    queue_title: 'Próximas canciones',
    queue_empty: 'La cola está vacía',
    queue_empty_sub: 'Todavía no hay canciones en la cola',
    closed_title: 'Fuera de horario',
    closed_sub: 'El anfitrión ha cerrado las peticiones por ahora. ¡Vuelve pronto!',
    error_repeated: 'Esta canción ya fue reproducida en esta sesión',
    error_cooldown: 'Esta canción sonó hace poco. Disponible en {{min}} min.',
    error_genre: 'Esta canción pertenece a un género bloqueado por el anfitrión',
    error_song: 'Esta canción no está permitida en esta sesión',
    error_artist: 'Este artista está bloqueado por el anfitrión',
    error_limit: 'El evento ha alcanzado su límite de {{limit}} peticiones por hora. Intenta más tarde.',
    error_queue: 'Esta canción ya está en la cola o en espera',
    error_max: 'Esta canción ya fue pedida {{max}} veces en esta sesión',
    error_send: 'Error al enviar la petición. Intenta nuevamente.',
    approved_toast: '¡Tu petición "{{name}}" fue aprobada y añadida a la cola!',
    requested_by: 'Pedida por',
    playing_now: 'Reproduciendo ahora',
  },
  dashboard: {
    title: 'Panel de Control',
    mode_party: 'Modo Fiesta',
    mode_commercial: 'Modo Comercial',
    auto_dj: 'Auto DJ',
    queue_title: 'Cola de Reproducción',
    queue_empty: 'La cola está vacía',
    queue_empty_sub: 'Aprueba peticiones o carga una playlist para comenzar',
    requests_title: 'Peticiones Pendientes',
    requests_empty: 'No hay peticiones pendientes',
    requests_empty_sub: 'Cuando los invitados envíen canciones aparecerán aquí',
    approve: 'Aprobar',
    reject: 'Rechazar',
    playlists_title: 'Tus Playlists',
    add_song: 'Añadir canción',
    requested_by: 'por',
    now_playing: 'Reproduciendo',
  },
  settings: {
    title: 'Configuración',
    availability_title: 'Horario de Disponibilidad',
    always_available: 'Siempre disponible',
    always_available_desc: 'Los invitados pueden pedir canciones en cualquier momento',
    start_time: 'Hora de inicio',
    end_time: 'Hora de cierre',
    filters_title: 'Filtros Generales',
    repeat_filter: 'Filtro de Repeticiones',
    repeat_filter_desc: 'Tiempo antes de poder pedir una canción ya sonada',
    repeat_always: 'Permitir siempre',
    repeat_30: 'Bloquear 30 min',
    repeat_60: 'Bloquear 1 hora',
    repeat_120: 'Bloquear 2 horas',
    repeat_session: 'Bloquear toda la sesión',
    cooldown_title: 'Tiempo de espera',
    cooldown_desc: 'Requerir que los invitados esperen antes de poder pedir otra canción',
    cooldown_minutes: 'Minutos de espera',
  },
  activities: {
    title: 'Actividades',
    subtitle: 'Anima tu evento con juegos interactivos',
    challenge_title: '🎯 Retos',
    challenge_for_all: 'Para todos',
    challenge_adults: 'Adultos',
    challenge_btn: 'Generar reto',
    challenge_new: 'Nuevo reto',
    challenge_for: 'El reto va para',
    guesswho_title: '🕵️ ¿Quién la pidió?',
    guesswho_question: '¿Quién pidió esta canción?',
    guesswho_anon: 'Este invitado prefirió el anonimato',
    guesswho_anon_sub: 'Solo funciona cuando los invitados dejan su nombre o mesa',
    guesswho_no_track: 'Reproduce una canción para activar este juego',
    guesswho_correct: '🎉 ¡Correcto!',
    guesswho_wrong: '❌ Era {{answer}}',
    guesswho_next: 'Jugar con la próxima canción',
    trivia_title: '🎵 Trivia Musical',
    trivia_load: 'Cargando pregunta...',
    trivia_next: 'Siguiente pregunta',
    trivia_reload: 'Recargar pregunta',
    trivia_error: 'No se pudo cargar una pregunta. ¿Tienes conexión a internet?',
    trivia_correct: '🎉 ¡Correcto!',
    trivia_wrong: '❌ Era: {{answer}}',
    chair_title: '🪑 Juego de la Silla',
    chair_desc: 'La música se detendrá en momentos aleatorios (entre 20 y 60 segundos). ¡El último que se siente pierde!',
    chair_start: 'Iniciar Juego de la Silla',
    chair_stop: 'Detener Juego',
    chair_round: 'Ronda {{n}} en curso',
    chair_hint: 'La música parará en cualquier momento...',
    chair_paused: '¡PARA!',
    chair_next_round: '🎵 ¡Siguiente Ronda!',
    chair_end: 'Terminar juego',
    karaoke_title: '🎤 Modo Karaoke',
    karaoke_desc: 'Las letras de la canción en pantalla completa para que todos canten',
    karaoke_btn: 'Activar Modo Karaoke',
    karaoke_loading: 'Buscando letras...',
    karaoke_no_track: 'Reproduce una canción para buscar letras',
    karaoke_preparing: 'Preparando pista...',
    karaoke_by: 'Pedida por',
    karaoke_playing: 'Reproduciendo',
  },
  player: {
    now_playing: 'Reproduciendo',
    requested_by: 'Pedida por',
  },
  common: {
    loading: 'Cargando...',
    error: 'Error',
    retry: 'Reintentar',
    cancel: 'Cancelar',
    save: 'Guardar',
    close: 'Cerrar',
    yes: 'Sí',
    no: 'No',
    search_placeholder: 'Buscar...',
    no_results: 'Sin resultados',
    play_again: 'Jugar de nuevo',
  },
};

// ─── English ──────────────────────────────────────────────────────────────────
const EN = {
  lang: {
    es: 'Español',
    en: 'English',
  },
  nav: {
    dashboard: 'Dashboard',
    metrics: 'Metrics',
    activities: 'Activities',
    settings: 'Settings',
    support: 'Support',
    logout: 'Log out',
    remote: 'Remote Control',
    remoteMode: 'Admin Mode',
  },
  guest: {
    title: 'Request a Song',
    subtitle_party: 'Party Mode 🎉',
    subtitle_commercial: 'Bar / Restaurant',
    label_table: 'Table (required)',
    label_nickname: 'Your nickname (optional)',
    placeholder_table: 'e.g. Table 7',
    placeholder_nickname: 'e.g. DJ Carlos 🎧',
    select_table: '-- Select table --',
    no_table: 'No table',
    search_label: 'Search a song on Spotify',
    search_placeholder: 'Search by title, artist or album...',
    submit: 'Send request',
    submit_cooldown: 'Wait {{time}}',
    sent_success: '"{{name}}" sent to the host!',
    cooldown_label: 'You can request again in',
    queue_title: 'Upcoming Songs',
    queue_empty: 'Queue is empty',
    queue_empty_sub: 'No songs in the queue yet',
    closed_title: 'Closed',
    closed_sub: 'The host has closed requests for now. Come back soon!',
    error_repeated: 'This song has already been played this session',
    error_cooldown: 'This song played recently. Available in {{min}} min.',
    error_genre: 'This song belongs to a genre blocked by the host',
    error_song: 'This song is not allowed in this session',
    error_artist: 'This artist is blocked by the host',
    error_limit: 'The event has reached its limit of {{limit}} requests per hour. Try later.',
    error_queue: 'This song is already in the queue or pending',
    error_max: 'This song has been requested {{max}} times this session',
    error_send: 'Error sending request. Please try again.',
    approved_toast: 'Your request "{{name}}" was approved and added to the queue!',
    requested_by: 'Requested by',
    playing_now: 'Now Playing',
  },
  dashboard: {
    title: 'Control Panel',
    mode_party: 'Party Mode',
    mode_commercial: 'Commercial Mode',
    auto_dj: 'Auto DJ',
    queue_title: 'Playback Queue',
    queue_empty: 'Queue is empty',
    queue_empty_sub: 'Approve requests or load a playlist to get started',
    requests_title: 'Pending Requests',
    requests_empty: 'No pending requests',
    requests_empty_sub: 'When guests send songs they will appear here',
    approve: 'Approve',
    reject: 'Reject',
    playlists_title: 'Your Playlists',
    add_song: 'Add song',
    requested_by: 'by',
    now_playing: 'Playing',
  },
  settings: {
    title: 'Settings',
    availability_title: 'Availability Schedule',
    always_available: 'Always available',
    always_available_desc: 'Guests can request songs at any time',
    start_time: 'Start time',
    end_time: 'End time',
    filters_title: 'General Filters',
    repeat_filter: 'Repeat Filter',
    repeat_filter_desc: 'Time before a played song can be requested again',
    repeat_always: 'Always allow',
    repeat_30: 'Block for 30 min',
    repeat_60: 'Block for 1 hour',
    repeat_120: 'Block for 2 hours',
    repeat_session: 'Block for entire session',
    cooldown_title: 'Request cooldown',
    cooldown_desc: 'Require guests to wait before requesting another song',
    cooldown_minutes: 'Wait time (minutes)',
  },
  activities: {
    title: 'Activities',
    subtitle: 'Keep your event alive with interactive games',
    challenge_title: '🎯 Challenges',
    challenge_for_all: 'For everyone',
    challenge_adults: 'Adults',
    challenge_btn: 'Generate challenge',
    challenge_new: 'New challenge',
    challenge_for: 'Challenge goes to',
    guesswho_title: '🕵️ Guess Who?',
    guesswho_question: 'Who requested this song?',
    guesswho_anon: 'This guest preferred to stay anonymous',
    guesswho_anon_sub: 'Only works when guests leave their name or table number',
    guesswho_no_track: 'Play a song to activate this game',
    guesswho_correct: '🎉 Correct!',
    guesswho_wrong: '❌ It was {{answer}}',
    guesswho_next: 'Play with the next song',
    trivia_title: '🎵 Music Trivia',
    trivia_load: 'Loading question...',
    trivia_next: 'Next question',
    trivia_reload: 'Reload question',
    trivia_error: "Couldn't load a question. Do you have an internet connection?",
    trivia_correct: '🎉 Correct!',
    trivia_wrong: '❌ It was: {{answer}}',
    chair_title: '🪑 Musical Chairs',
    chair_desc: 'The music will stop at random moments (between 20–60 seconds). Last one to sit loses!',
    chair_start: 'Start Musical Chairs',
    chair_stop: 'Stop Game',
    chair_round: 'Round {{n}} in progress',
    chair_hint: 'Music will stop at any moment...',
    chair_paused: 'STOP!',
    chair_next_round: '🎵 Next Round!',
    chair_end: 'End game',
    karaoke_title: '🎤 Karaoke Mode',
    karaoke_desc: 'Song lyrics in fullscreen so everyone can sing along',
    karaoke_btn: 'Activate Karaoke Mode',
    karaoke_loading: 'Looking for lyrics...',
    karaoke_no_track: 'Play a song to search for lyrics',
    karaoke_preparing: 'Preparing track...',
    karaoke_by: 'Requested by',
    karaoke_playing: 'Now playing',
  },
  player: {
    now_playing: 'Now Playing',
    requested_by: 'Requested by',
  },
  common: {
    loading: 'Loading...',
    error: 'Error',
    retry: 'Retry',
    cancel: 'Cancel',
    save: 'Save',
    close: 'Close',
    yes: 'Yes',
    no: 'No',
    search_placeholder: 'Search...',
    no_results: 'No results',
    play_again: 'Play again',
  },
};
