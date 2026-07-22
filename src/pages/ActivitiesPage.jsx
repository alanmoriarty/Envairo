import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Zap, Mic2, X, Trophy, HelpCircle, Users, ChevronDown, ChevronUp,
  Music, Shuffle, RefreshCw, CheckCircle, XCircle, Play, Pause,
  Timer, Star, PartyPopper, Wine, Baby, Crown, Loader2
} from 'lucide-react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { toast } from 'sonner';
import { useTranslation } from '../store/useLanguageStore';
import { TRIVIA_ES } from '../i18n/trivia_es';

// ─── Challenge Lists ──────────────────────────────────────────────────────────
const CHALLENGES_KIDS = [
  'Imita al artista de la canción durante 10 segundos 🎤',
  'Baila sin mover los pies por 15 segundos 🕺',
  'Haz una cara graciosa y mantenla por 5 segundos 😜',
  'Adivina la siguiente palabra de la letra de la canción 🎵',
  'Imita un animal de tu elección durante 10 segundos 🐾',
  'Baila en cámara lenta por 15 segundos 🐌',
  'Di el nombre del artista de la canción al revés 🔄',
  'Haz 5 saltos de tijera bailando al ritmo 🤸',
  'Silba la melodía de la canción por 10 segundos 😙',
  'Cuenta un chiste y que todos lo califiquen del 1 al 5 😄',
  'Imita ser una estatua por 10 segundos 🗿',
  'Haz el baile del robot al ritmo de la canción 🤖',
  'Di el nombre de 3 artistas musicales en 5 segundos ⚡',
  'Baila haciendo que cargas algo muy pesado 🏋️',
  'Describe la canción con solo 3 palabras 🎯',
  'Imita a tu ídolo musical durante 10 segundos 🌟',
  'Haz la coreografía del baile más conocido que sepas 💃',
  'Canta la primera línea de la canción sin equivocarte 🎙️',
  'Baila con los ojos cerrados por 15 segundos 😌',
  'Adivina de qué año es esta canción 📅',
  'Mueve solo los hombros al ritmo por 10 segundos 💪',
  'Menciona 5 canciones del mismo artista en 10 segundos 🎶',
  'Haz que alguien más adivine la canción con mímica 🤫',
  'Inventa un paso de baile nuevo ahora mismo 🆕',
  'Canta la canción con voz de dibujo animado 🎠',
  'Baila de espaldas al público por 10 segundos 🔙',
  'Imita a un presentador de radio anunciando esta canción 📻',
  'Cuenta cuántas veces se dice la palabra principal de la canción 🔢',
  'Elige a alguien del grupo para bailar contigo 🤝',
  'Haz el baile más exagerado que puedas por 15 segundos 🌀',
];

const CHALLENGES_ADULTS = [
  'Sube el volumen y canta a todo pulmón el coro 🎤',
  'Convence a alguien de que esta es la mejor canción del evento 🏆',
  'Imita al artista de la canción de forma exagerada por 20 segundos 🤩',
  'Brinda con la persona de tu derecha y di algo bueno de ella 🥂',
  'Sé el DJ por un momento: describe qué canción pondría después 🎧',
  'Cuenta la historia más vergonzosa que te haya pasado en una fiesta 😳',
  'Baila con la persona más animada del grupo ahora mismo 💃',
  'Elige a alguien y adivina cuántas canciones de este artista conoce 🎵',
  'Describe esta canción como si fuera un perfume de lujo 🌹',
  'Di el nombre de 5 canciones de los 90s en 10 segundos ⚡',
  'Imita ser un crítico musical y dale una reseña a esta canción 🎓',
  'Haz un brindis espontáneo dedicado a quien pidió la canción 🥃',
  'Mueve las caderas al ritmo de la canción por 20 segundos 🌊',
  'Di en qué película o serie escucharías esta canción 🎬',
  'Convence a tu vecino de que esta canción es un himno nacional 🏳️',
  'Inventa una letra alternativa para el coro de la canción ✍️',
  'Haz como si fueras el manager del artista y preséntalo al público 🎙️',
  'Menciona 3 artistas que podrían hacer una colaboración con este 🤝',
  'Bailar en pareja con quien quieras por 30 segundos 💑',
  'Tararear la canción y que alguien del grupo la adivine 🎼',
  'Elige un objeto cercano y úsalo como micrófono 🎤',
  'Imita el estilo de baile de otro década (80s, 90s, 2000s) 💫',
  'Di la letra de la canción como si fuera un poema romántico 💌',
  'Describe a quien pidió la canción con 3 adjetivos musicales 🎶',
  'Pon la cara más seria posible mientras todos bailan a tu alrededor 😐',
  'Dedica esta canción a alguien del grupo públicamente 📣',
  'Imita ser una estrella de rock entrando al escenario ⭐',
  'Di cuándo fue la última vez que bailaste así de bien 😎',
  'Haz la pose de portada de álbum más épica que puedas 📀',
  'Propón el próximo after de la fiesta con total convicción 🌙',
];

const CHALLENGES_KIDS_EN = [
  'Imitate the artist of the song for 10 seconds 🎤',
  'Dance without moving your feet for 15 seconds 🕺',
  'Make a funny face and hold it for 5 seconds 😜',
  'Guess the next word of the song lyrics 🎵',
  'Imitate an animal of your choice for 10 seconds 🐾',
  'Dance in slow motion for 15 seconds 🐌',
  'Say the name of the song artist backwards 🔄',
  'Do 5 jumping jacks dancing to the beat 🤸',
  'Whistle the melody of the song for 10 seconds 😙',
  'Tell a joke and have everyone rate it from 1 to 5 😄',
  'Pretend to be a statue for 10 seconds 🗿',
  'Do the robot dance to the rhythm of the song 🤖',
  'Name 3 musical artists in 5 seconds ⚡',
  'Dance acting like you are carrying something very heavy 🏋️',
  'Describe the song using only 3 words 🎯',
  'Imitate your musical idol for 10 seconds 🌟',
  'Do the choreography of the most famous dance you know 💃',
  'Sing the first line of the song without making a mistake 🎙️',
  'Dance with your eyes closed for 15 seconds 😌',
  'Guess what year this song is from 📅',
  'Move only your shoulders to the beat for 10 seconds 💪',
  'Name 5 songs by the same artist in 10 seconds 🎶',
  'Have someone else guess the song with mime 🤫',
  'Invent a new dance move right now 🆕',
  'Sing the song with a cartoon voice 🎠',
  'Dance with your back to the audience for 10 seconds 🔙',
  'Imitate a radio host announcing this song 📻',
  'Count how many times the main word of the song is said 🔢',
  'Choose someone from the group to dance with you 🤝',
  'Do the most exaggerated dance you can for 15 seconds 🌀',
];

const CHALLENGES_ADULTS_EN = [
  'Turn up the volume and sing the chorus at the top of your lungs 🎤',
  'Convince someone that this is the best song of the event 🏆',
  'Imitate the song artist in an exaggerated way for 20 seconds 🤩',
  'Toast with the person on your right and say something nice about them 🥂',
  'Be the DJ for a moment: describe what song you would play next 🎧',
  'Tell the most embarrassing story that has happened to you at a party 😳',
  'Dance with the most energetic person in the group right now 💃',
  'Choose someone and guess how many songs by this artist they know 🎵',
  'Describe this song as if it were a luxury perfume 🌹',
  'Name 5 songs from the 90s in 10 seconds ⚡',
  'Pretend to be a music critic and review this song 🎓',
  'Make a spontaneous toast dedicated to whoever requested the song 🥃',
  'Move your hips to the rhythm of the song for 20 seconds 🌊',
  'Say in which movie or series you would hear this song 🎬',
  'Convince your neighbor that this song is a national anthem 🏳️',
  'Invent an alternative lyric for the song chorus ✍️',
  'Pretend to be the artist\'s manager and introduce them to the audience 🎙️',
  'Name 3 artists who could collaborate with this one 🤝',
  'Dance in pairs with whoever you want for 30 seconds 💑',
  'Hum the song and have someone in the group guess it 🎼',
  'Pick a nearby object and use it as a microphone 🎤',
  'Imitate the dance style of another decade (80s, 90s, 2000s) 💫',
  'Say the lyrics of the song as if it were a romantic poem 💌',
  'Describe whoever requested the song with 3 musical adjectives 🎶',
  'Put on the most serious face possible while everyone dances around you 😐',
  'Dedicate this song to someone in the group publicly 📣',
  'Pretend to be a rock star entering the stage ⭐',
  'Say when was the last time you danced this well 😎',
  'Do the most epic album cover pose you can 📀',
  'Propose the next after-party with total conviction 🌙',
];

// ─── Trivia helpers ───────────────────────────────────────────────────────────
function decodeHTML(html) {
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  return txt.value;
}

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ActivityCard({ icon, title, color, children }) {
  return (
    <div className="card overflow-hidden">
      <div className="w-full flex items-center justify-between p-5 text-left shrink-0">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
            {icon}
          </div>
          <h2 className="font-bold text-text-primary">{title}</h2>
        </div>
      </div>
      <div className="px-5 pb-5 border-t border-white/5 pt-4">
        {children}
      </div>
    </div>
  );
}

// ─── 1. Retos ────────────────────────────────────────────────────────────────
function ChallengeCard({ currentTrack }) {
  const [mode, setMode] = useState('adults'); // 'kids' | 'adults'
  const [challenge, setChallenge] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const { t, lang } = useTranslation();

  const generate = () => {
    const list = mode === 'kids' 
      ? (lang === 'en' ? CHALLENGES_KIDS_EN : CHALLENGES_KIDS)
      : (lang === 'en' ? CHALLENGES_ADULTS_EN : CHALLENGES_ADULTS);
    setChallenge(list[Math.floor(Math.random() * list.length)]);
    setRevealed(true);
  };

  const requester = currentTrack?.requestedBy && currentTrack.requestedBy !== 'Host'
    ? currentTrack.requestedBy
    : null;

  return (
    <div className="space-y-4">
      {currentTrack && (
        <div className="flex items-center gap-3 p-3 bg-accent/10 border border-accent/20 rounded-xl">
          {currentTrack.image && <img src={currentTrack.image} alt="" className="w-10 h-10 rounded-lg object-cover" />}
          <div className="min-w-0">
            <p className="text-sm font-bold text-text-primary truncate">{currentTrack.name}</p>
            <p className="text-xs text-text-muted truncate">{currentTrack.artists}</p>
          </div>
        </div>
      )}

      {requester && (
        <div className="flex items-center gap-2 p-2.5 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
          <Crown size={14} className="text-yellow-400 flex-shrink-0" />
          <p className="text-sm text-yellow-300">
            {t('activities.challenge_for')}: <strong>{requester}</strong>
          </p>
        </div>
      )}

      {/* Mode toggle */}
      <div className="flex rounded-xl overflow-hidden border border-white/10">
        <button
          onClick={() => { setMode('kids'); setRevealed(false); setChallenge(null); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-all ${
            mode === 'kids' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'
          }`}
        >
          <Baby size={14} /> {t('activities.challenge_for_all')}
        </button>
        <button
          onClick={() => { setMode('adults'); setRevealed(false); setChallenge(null); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-all ${
            mode === 'adults' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'
          }`}
        >
          <Wine size={14} /> {t('activities.challenge_adults')}
        </button>
      </div>

      {/* Challenge display */}
      {revealed && challenge && (
        <div className="p-4 bg-bg-elevated border border-accent/20 rounded-xl text-center animate-slide-up">
          <p className="text-lg font-bold text-text-primary leading-relaxed">{challenge}</p>
        </div>
      )}

      <button
        onClick={generate}
        className="btn-primary w-full flex items-center justify-center gap-2"
      >
        <Shuffle size={16} />
        {revealed ? t('activities.challenge_new') : t('activities.challenge_btn')}
      </button>
    </div>
  );
}

// ─── 2. ¿Quién la pidió? ─────────────────────────────────────────────────────
function GuessWhoCard({ currentTrack, requestHistory }) {
  const { t } = useTranslation();
  const [options, setOptions] = useState([]);
  const [answer, setAnswer] = useState(-1);
  const [selected, setSelected] = useState(null);
  const [ready, setReady] = useState(false);

  const setup = useCallback(() => {
    if (!currentTrack?.requestedBy || currentTrack.requestedBy === 'Anónimo' || currentTrack.requestedBy === 'Host') {
      setReady(false);
      return;
    }

    const correct = currentTrack.requestedBy;

    // Build pool of other requesters from history (excluding correct)
    const pool = [...new Set(
      requestHistory
        .map(r => r.requester || r.requestedBy || r.track?.requestedBy)
        .filter(r => r && r !== correct && r !== 'Anónimo' && r !== 'Host')
    )];

    // Pad with invented options if pool is small
    const invented = ['El misterioso 🕵️', 'La incógnita 🎭', 'Alguien del fondo 🌚', 'El silencioso 🤫', 'La sorpresa 🎁'];
    while (pool.length < 3) pool.push(invented[pool.length % invented.length]);

    const decoys = shuffle(pool).slice(0, 3);
    const allOptions = shuffle([correct, ...decoys]);
    setOptions(allOptions);
    setAnswer(allOptions.indexOf(correct));
    setSelected(null);
    setReady(true);
  }, [currentTrack, requestHistory]);

  useEffect(() => { setup(); }, [setup]);

  const isAnon = !currentTrack?.requestedBy
    || currentTrack.requestedBy === 'Anónimo'
    || currentTrack.requestedBy === 'Host';

  if (!currentTrack) {
    return <p className="text-text-muted text-sm text-center py-4">{t('activities.guesswho_no_track')}</p>;
  }

  if (isAnon) {
    return (
      <div className="text-center py-6 space-y-2">
        <p className="text-4xl">🕵️</p>
        <p className="font-semibold text-text-primary">{t('activities.guesswho_anon')}</p>
        <p className="text-sm text-text-muted">{t('activities.guesswho_anon_sub')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-3 bg-accent/10 border border-accent/20 rounded-xl">
        {currentTrack.image && <img src={currentTrack.image} alt="" className="w-10 h-10 rounded-lg object-cover" />}
        <div className="min-w-0">
          <p className="text-xs text-text-muted mb-0.5">{t('activities.guesswho_question')}</p>
          <p className="text-sm font-bold text-text-primary truncate">{currentTrack.name}</p>
          <p className="text-xs text-text-muted truncate">{currentTrack.artists}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {options.map((opt, i) => (
          <button
            key={i}
            onClick={() => selected === null && setSelected(i)}
            disabled={selected !== null}
            className={`p-3 rounded-xl text-sm font-semibold transition-all border text-left ${
              selected === null
                ? 'bg-bg-elevated border-white/5 hover:border-accent/40 hover:bg-accent/10 text-text-primary'
                : i === answer
                ? 'bg-success/20 border-success/50 text-success'
                : i === selected
                ? 'bg-danger/20 border-danger/50 text-danger'
                : 'bg-bg-elevated border-white/5 text-text-subtle'
            }`}
          >
            {i === answer && selected !== null && <CheckCircle size={12} className="inline mr-1.5" />}
            {i === selected && selected !== answer && <XCircle size={12} className="inline mr-1.5" />}
            {opt}
          </button>
        ))}
      </div>

      {selected !== null && (
        <div className="text-center space-y-2 animate-slide-up">
          <p className={`font-bold text-lg ${selected === answer ? 'text-success' : 'text-danger'}`}>
            {selected === answer ? t('activities.guesswho_correct') : t('activities.guesswho_wrong', { answer: options[answer] })}
          </p>
          <button onClick={setup} className="btn-secondary text-sm py-2 px-4 flex items-center gap-2 mx-auto">
            <RefreshCw size={14} /> {t('activities.guesswho_next')}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── 3. Trivia Musical ───────────────────────────────────────────────────────
function TriviaCard() {
  const { t, lang } = useTranslation();
  const [question, setQuestion] = useState(null);
  const [options, setOptions] = useState([]);
  const [answer, setAnswer] = useState('');
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const usedIndexes = useRef([]);

  const fetchQuestion = async () => {
    setLoading(true);
    setError('');
    setSelected(null);
    setQuestion(null);
    try {
      if (lang === 'es') {
        // Use local Spanish trivia bank
        let idx;
        if (usedIndexes.current.length >= TRIVIA_ES.length) usedIndexes.current = [];
        do { idx = Math.floor(Math.random() * TRIVIA_ES.length); }
        while (usedIndexes.current.includes(idx));
        usedIndexes.current.push(idx);
        const q = TRIVIA_ES[idx];
        const allOpts = shuffle([q.correctAnswer, ...q.incorrectAnswers]);
        setQuestion(q.question);
        setOptions(allOpts);
        setAnswer(q.correctAnswer);
      } else {
        // Use OpenTDB for English
        const res = await fetch('https://opentdb.com/api.php?amount=1&category=12&type=multiple&encode=url3986');
        const data = await res.json();
        if (!data.results?.length) throw new Error('No results');
        const q = data.results[0];
        const correct = decodeURIComponent(q.correct_answer);
        const allOpts = shuffle([correct, ...q.incorrect_answers.map(decodeURIComponent)]);
        setQuestion(decodeURIComponent(q.question));
        setOptions(allOpts);
        setAnswer(correct);
      }
    } catch {
      setError(t('activities.trivia_error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchQuestion(); }, [lang]);

  return (
    <div className="space-y-4">
      <div className="min-h-[80px] flex items-center justify-center">
        {loading ? (
          <div className="flex items-center gap-2 text-text-muted animate-pulse">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">{t('activities.trivia_load')}</span>
          </div>
        ) : error ? (
          <p className="text-sm text-danger text-center">{error}</p>
        ) : question ? (
          <p className="text-base font-bold text-text-primary text-center leading-relaxed">{question}</p>
        ) : null}
      </div>

      {!loading && !error && options.length > 0 && (
        <div className="grid grid-cols-1 gap-2">
          {options.map((opt, i) => (
            <button
              key={i}
              onClick={() => selected === null && setSelected(opt)}
              disabled={selected !== null}
              className={`p-3 rounded-xl text-sm font-semibold transition-all border text-left ${
                selected === null
                  ? 'bg-bg-elevated border-white/5 hover:border-accent/40 hover:bg-accent/10 text-text-primary'
                  : opt === answer
                  ? 'bg-success/20 border-success/50 text-success'
                  : opt === selected
                  ? 'bg-danger/20 border-danger/50 text-danger'
                  : 'bg-bg-elevated border-white/5 text-text-subtle'
              }`}
            >
              {opt === answer && selected !== null && <CheckCircle size={12} className="inline mr-1.5" />}
              {opt === selected && selected !== answer && <XCircle size={12} className="inline mr-1.5" />}
              {opt}
            </button>
          ))}
        </div>
      )}

      {selected !== null && (
        <div className="text-center animate-slide-up">
          <p className={`font-bold text-lg mb-3 ${selected === answer ? 'text-success' : 'text-danger'}`}>
            {selected === answer ? t('activities.trivia_correct') : t('activities.trivia_wrong', { answer })}
          </p>
        </div>
      )}

      <button
        onClick={fetchQuestion}
        disabled={loading}
        className="btn-primary w-full flex items-center justify-center gap-2"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
        {selected !== null ? t('activities.trivia_next') : t('activities.trivia_reload')}
      </button>
    </div>
  );
}

// ─── 4. Juego de la Silla ────────────────────────────────────────────────────
function ChairGameCard() {
  const { t } = useTranslation();
  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [round, setRound] = useState(0);
  const timerRef = useRef(null);
  const shiftQueue = usePlayerStore(s => s.shiftQueue);
  const isPlaying = usePlayerStore(s => s.isPlaying);

  const getRandomInterval = () => Math.floor(Math.random() * 40000) + 20000; // 20–60s

  const scheduleNext = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const state = usePlayerStore.getState();
      if (state.youtubePlayer && typeof state.youtubePlayer.pauseVideo === 'function') {
        state.youtubePlayer.pauseVideo();
        usePlayerStore.setState({ isPlaying: false });
      }
      setPaused(true);
      setCountdown(null);
    }, getRandomInterval());
  }, []);

  const startGame = () => {
    setActive(true);
    setPaused(false);
    setRound(1);
    scheduleNext();
    toast.success('🪑 ' + t('activities.chair_start') + '!');
  };

  const stopGame = () => {
    clearTimeout(timerRef.current);
    clearInterval(countdownRef.current);
    setActive(false);
    setPaused(false);
    setCountdown(null);
    const state = usePlayerStore.getState();
    if (!state.isPlaying && state.youtubePlayer && typeof state.youtubePlayer.playVideo === 'function') {
      state.youtubePlayer.playVideo();
      usePlayerStore.setState({ isPlaying: true });
    }
  };

  const nextRound = () => {
    setPaused(false);
    setRound(r => r + 1);
    const state = usePlayerStore.getState();
    if (state.youtubePlayer && typeof state.youtubePlayer.playVideo === 'function') {
      state.youtubePlayer.playVideo();
      usePlayerStore.setState({ isPlaying: true });
    }
    scheduleNext();
  };

  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current);
      clearInterval(countdownRef.current);
    };
  }, []);

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">
        {t('activities.chair_desc')}
      </p>

      {active && (
        <div className="p-4 bg-accent/10 border border-accent/20 rounded-xl text-center">
          <p className="text-2xl mb-1">🪑</p>
          <p className="font-bold text-text-primary">{t('activities.chair_round', { n: round })}</p>
          <p className="text-xs text-text-muted mt-1">{t('activities.chair_hint')}</p>
        </div>
      )}

      {!active ? (
        <button onClick={startGame} className="btn-primary w-full flex items-center justify-center gap-2">
          <Play size={16} /> {t('activities.chair_start')}
        </button>
      ) : (
        <button onClick={stopGame} className="btn-secondary w-full flex items-center justify-center gap-2">
          <Pause size={16} /> {t('activities.chair_stop')}
        </button>
      )}

      {/* Fullscreen paused overlay */}
      {paused && createPortal(
        <div className="fixed inset-0 z-[9998] bg-black/90 backdrop-blur-lg flex flex-col items-center justify-center text-center p-8 animate-fade-in">
          {/* Animated pulse ring */}
          <div className="relative mb-8">
            <div className="w-32 h-32 rounded-full bg-danger/20 flex items-center justify-center animate-ping absolute inset-0" />
            <div className="w-32 h-32 rounded-full bg-danger/10 border-2 border-danger/50 flex items-center justify-center relative">
              <span className="text-6xl">🪑</span>
            </div>
          </div>
          <h1 className="text-5xl md:text-7xl font-black text-white mb-4 animate-bounce">
            {t('activities.chair_paused')}
          </h1>
          <p className="text-2xl text-white/80 mb-2">{t('activities.chair_round', { n: round })}</p>
          <p className="text-lg text-white/60 mb-10">¿Quién se quedó sin silla?</p>
          <button
            onClick={nextRound}
            className="px-10 py-4 rounded-2xl bg-accent font-bold text-white text-xl shadow-glow hover:bg-accent-light transition-all hover:scale-105 active:scale-95"
          >
            {t('activities.chair_next_round')}
          </button>
          <button
            onClick={stopGame}
            className="mt-4 text-white/40 hover:text-white/70 text-sm transition-colors"
          >
            {t('activities.chair_end')}
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}



// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ActivitiesPage() {
  const { currentTrack, progress, duration } = usePlayerStore();
  const requestHistory = usePlayerStore(s => s.requestHistory || []);
  const { t } = useTranslation();

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto lg:max-w-none">
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <Zap size={22} className="text-accent" /> {t('activities.title')}
        </h1>
        <p className="text-text-muted text-sm mt-1">{t('activities.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
        {/* Retos */}
        <div className="w-full">
          <ActivityCard
            icon={<PartyPopper size={18} className="text-yellow-300" />}
            title={t('activities.challenge_title')}
            color="bg-yellow-500/15"
          >
            <ChallengeCard currentTrack={currentTrack} />
          </ActivityCard>
        </div>

        {/* ¿Quién la pidió? */}
        <div className="w-full">
          <ActivityCard
            icon={<Users size={18} className="text-blue-300" />}
            title={t('activities.guesswho_title')}
            color="bg-blue-500/15"
          >
            <GuessWhoCard currentTrack={currentTrack} requestHistory={requestHistory} />
          </ActivityCard>
        </div>

        {/* Trivia Musical */}
        <div className="w-full">
          <ActivityCard
            icon={<HelpCircle size={18} className="text-green-300" />}
            title={t('activities.trivia_title')}
            color="bg-green-500/15"
          >
            <TriviaCard />
          </ActivityCard>
        </div>

        {/* Juego de la Silla */}
        <div className="w-full">
          <ActivityCard
            icon={<Timer size={18} className="text-red-300" />}
            title={t('activities.chair_title')}
            color="bg-red-500/15"
          >
            <ChairGameCard />
          </ActivityCard>
        </div>

      </div>
    </div>
  );
}
