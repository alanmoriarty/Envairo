import React, { useMemo } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { BarChart2, Music2, TrendingUp, Clock } from 'lucide-react';
import { usePlayerStore } from '../store/usePlayerStore';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-bg-card border border-white/10 rounded-xl px-3 py-2 shadow-card">
      <p className="text-text-muted text-xs">{label}</p>
      <p className="text-accent font-bold">{payload[0].value} reproducciones</p>
    </div>
  );
};

export default function MetricsPage() {
  const { playHistory, queue, pendingRequests } = usePlayerStore();

  const metrics = useMemo(() => {
    const totalRequests = playHistory.length + queue.length + pendingRequests.length;
    const totalApproved = playHistory.length + queue.length;
    
    const artistCounts = {};
    const genreCounts = {};
    const hourCounts = {};

    const allTracks = [
      ...playHistory,
      ...queue,
      ...pendingRequests.map(req => req.track)
    ];

    allTracks.forEach(track => {
      const mainArtist = track.artists?.split(',')[0]?.trim() || 'Desconocido';
      if (!artistCounts[mainArtist]) {
        artistCounts[mainArtist] = { name: mainArtist, plays: 0, image: track.image };
      }
      artistCounts[mainArtist].plays++;

      const g = track.genre || 'Otros';
      genreCounts[g] = (genreCounts[g] || 0) + 1;

      // Usar la hora de reproducción o la actual si está en cola
      const dateToUse = track.playedAt ? new Date(track.playedAt) : new Date();
      const h = dateToUse.getHours().toString().padStart(2, '0') + ':00';
      hourCounts[h] = (hourCounts[h] || 0) + 1;
    });

    const topArtists = Object.values(artistCounts)
      .sort((a, b) => b.plays - a.plays)
      .slice(0, 5);

    const totalGenres = Object.values(genreCounts).reduce((a, b) => a + b, 0);
    const colors = ['#9D4EDD', '#B57BEE', '#22D3A5', '#FBBF24', '#F87171'];
    const genreData = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count], i) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value: Math.round((count / (totalGenres || 1)) * 100),
        color: colors[i % colors.length]
      }));

    if (genreData.length === 0) {
       genreData.push({ name: 'Sin datos', value: 100, color: '#333' });
    }

    const hourData = Object.entries(hourCounts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([hour, count]) => ({ hour, reproducciones: count }));
    
    if (hourData.length === 0) {
      hourData.push({ hour: new Date().getHours().toString().padStart(2, '0') + ':00', reproducciones: 0 });
    }

    let peakHour = hourData.length > 0 && playHistory.length > 0
      ? hourData.reduce((max, h) => h.reproducciones > max.reproducciones ? h : max, hourData[0]).hour
      : '--:--';

    return {
      totalRequests,
      totalApproved,
      uniqueArtists: Object.keys(artistCounts).length,
      peakHour,
      topArtists,
      genreData,
      hourData
    };
  }, [playHistory, queue, pendingRequests]);

  const maxPlays = Math.max(...metrics.topArtists.map((a) => a.plays), 1);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <BarChart2 size={22} className="text-accent" /> Métricas
        </h1>
        <p className="text-text-muted text-sm mt-1">Estadísticas reales de la sesión actual</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total peticiones', value: metrics.totalRequests, icon: Music2, color: 'text-accent' },
          { label: 'Aprobadas', value: metrics.totalApproved, icon: TrendingUp, color: 'text-success' },
          { label: 'Hora pico', value: metrics.peakHour, icon: Clock, color: 'text-warning' },
          { label: 'Artistas únicos', value: metrics.uniqueArtists, icon: BarChart2, color: 'text-accent' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card p-4">
            <Icon size={20} className={`${color} mb-2`} />
            <p className="text-2xl font-bold text-text-primary">{value}</p>
            <p className="text-xs text-text-muted">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Genre Pie */}
        <div className="card p-5">
          <h2 className="font-bold text-text-primary mb-4">Distribución por Género</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={metrics.genreData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={3}
                dataKey="value"
              >
                {metrics.genreData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} stroke="transparent" />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <div className="bg-bg-card border border-white/10 rounded-xl px-3 py-2">
                      <p className="text-text-primary font-semibold">{payload[0].name}</p>
                      <p className="text-accent">{payload[0].value}%</p>
                    </div>
                  ) : null
                }
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3 justify-center mt-2">
            {metrics.genreData.map((g) => (
              <div key={g.name} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: g.color }} />
                <span className="text-xs text-text-muted">{g.name} ({g.value}%)</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Artists */}
        <div className="card p-5">
          <h2 className="font-bold text-text-primary mb-4">Top Artistas Reales</h2>
          <div className="space-y-4">
            {metrics.topArtists.length === 0 ? (
              <p className="text-text-muted text-sm text-center py-8">No hay suficientes datos aún.</p>
            ) : metrics.topArtists.map((artist, i) => (
              <div key={artist.name} className="flex items-center gap-3">
                <span className="text-text-subtle text-sm w-4">{i + 1}</span>
                {artist.image ? (
                   <img
                     src={artist.image}
                     alt={artist.name}
                     className="w-8 h-8 rounded-full object-cover"
                     onError={(e) => { e.target.style.display = 'none'; }}
                   />
                ) : (
                   <div className="w-8 h-8 rounded-full bg-bg-elevated flex items-center justify-center">
                     <Music2 size={12} className="text-text-muted" />
                   </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-primary truncate">{artist.name}</p>
                  <div className="mt-1 h-1.5 rounded-full bg-bg-elevated overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent transition-all duration-700"
                      style={{ width: `${(artist.plays / maxPlays) * 100}%` }}
                    />
                  </div>
                </div>
                <span className="text-xs text-text-muted w-8 text-right">{artist.plays}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Peak hours bar chart */}
      <div className="card p-5">
        <h2 className="font-bold text-text-primary mb-4">Reproducciones por Hora</h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={metrics.hourData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="hour" tick={{ fill: '#9D9AB0', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#9D9AB0', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="reproducciones" fill="#9D4EDD" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
