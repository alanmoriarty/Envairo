import React, { useMemo, useState } from 'react';
import {
  Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { BarChart2, Music2, TrendingUp, Clock } from 'lucide-react';
import { usePlayerStore } from '../store/usePlayerStore';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-bg-card border border-white/10 rounded-xl px-3 py-2 shadow-card">
      <p className="text-text-muted text-xs">{label || payload[0].name}</p>
      <p className="text-accent font-bold">{payload[0].value} reproducciones</p>
    </div>
  );
};

function getLocalDateString(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function MetricsPage() {
  const { playHistory, queue, pendingRequests, requestHistory = [] } = usePlayerStore();

  const last7Days = useMemo(() => {
    const days = [];
    for (let i = 0; i <= 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(getLocalDateString(d));
    }
    return days;
  }, []);

  const [selectedDate, setSelectedDate] = useState(last7Days[0]);

  const metrics = useMemo(() => {
    const allRequests = requestHistory.filter(req => {
      if (selectedDate === 'all') return true;
      const dateToUse = new Date(req.timestamp);
      return getLocalDateString(dateToUse) === selectedDate;
    });

    const totalRequests = allRequests.length;
    const totalApproved = allRequests.filter(req => req.status === 'approved').length;

    const artistCounts = {};
    const hourCounts = {};

    allRequests.forEach(req => {
      // Excluir canciones rechazadas de las estadísticas visuales
      if (req.status === 'rejected') return;

      const track = req.track;
      const mainArtistName = track.artists?.split(',')[0]?.trim() || 'Desconocido';
      const mainArtistId = track.artistIds?.[0];

      const key = mainArtistId || mainArtistName;

      if (!artistCounts[key]) {
        artistCounts[key] = {
          id: mainArtistId,
          name: mainArtistName,
          plays: 0,
          image: track.image
        };
      }
      artistCounts[key].plays++;

      const dateToUse = new Date(req.timestamp);
      const h = dateToUse.getHours().toString().padStart(2, '0') + ':00';
      hourCounts[h] = (hourCounts[h] || 0) + 1;
    });

    const topArtists = Object.values(artistCounts)
      .sort((a, b) => b.plays - a.plays)
      .slice(0, 50);

    const hourData = Object.entries(hourCounts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([hour, count]) => ({ hour, reproducciones: count }));

    if (hourData.length === 0) {
      hourData.push({ hour: new Date().getHours().toString().padStart(2, '0') + ':00', reproducciones: 0 });
    }

    let peakHour = hourData.length > 0 && allRequests.length > 0
      ? hourData.reduce((max, h) => h.reproducciones > max.reproducciones ? h : max, hourData[0]).hour
      : '--:--';

    return {
      totalRequests,
      totalApproved,
      uniqueArtists: Object.keys(artistCounts).length,
      peakHour,
      topArtists,
      displayTopArtists: topArtists.slice(0, 5),
      hourData
    };
  }, [requestHistory, selectedDate]);

  const maxPlays = Math.max(...metrics.displayTopArtists.map((a) => a.plays), 1);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <BarChart2 size={22} className="text-accent" /> Métricas
          </h1>
          <p className="text-text-muted text-sm mt-1">Estadísticas de reproducciones por fecha</p>
        </div>

        <select
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="input-field max-w-[200px]"
        >
          <option value="all">Todo el historial</option>
          {last7Days.map((date, index) => (
            <option key={date} value={date}>
              {index === 0 ? 'Hoy' : index === 1 ? 'Ayer' : date}
            </option>
          ))}
        </select>
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

        {/* Top Artists */}
        <div className="card p-5">
          <h2 className="font-bold text-text-primary mb-4">Top Artistas</h2>
          <div className="space-y-4">
            {metrics.displayTopArtists.length === 0 ? (
              <p className="text-text-muted text-sm text-center py-8">No hay suficientes datos aún.</p>
            ) : metrics.displayTopArtists.map((artist, i) => (
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

        {/* Peak hours bar chart */}
        <div className="card p-5">
          <h2 className="font-bold text-text-primary mb-4">Peticiones por Hora</h2>
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
    </div>
  );
}
