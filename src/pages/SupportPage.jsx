import React from 'react';
import { HelpCircle, MessageCircle, ExternalLink } from 'lucide-react';
import { Accordion } from '../components/ui/Accordion';

const FAQS = [
  {
    question: '¿Qué hago si el reproductor no se conecta?',
    answer:
      'Asegúrate de tener Spotify Premium activo y de haber iniciado sesión correctamente. El SDK de Spotify Web Playback requiere Premium para funcionar. Si el problema persiste, cierra sesión y vuelve a iniciarla. Verifica también que el Redirect URI en tu app de Spotify Developer sea exactamente "http://localhost:5173/callback".',
  },
  {
    question: '¿Cómo funciona el Auto-DJ?',
    answer:
      'Cuando activas el Auto-DJ desde el toggle del Dashboard, el sistema monitorea la cola de reproducción. Si la cola se vacía, Envairo añade automáticamente una canción compatible con tu Lista Blanca de géneros configurada en Ajustes. Puedes desactivarlo en cualquier momento.',
  },
  {
    question: '¿Cuántas canciones puede pedir un invitado?',
    answer:
      'Cada invitado puede pedir hasta 3 veces la misma canción por sesión. Tras enviar una petición, hay un período de espera de 5 minutos antes de poder enviar otra. Esto evita la saturación de la cola.',
  },
  {
    question: '¿Cómo proyecto el código QR en una pantalla grande?',
    answer:
      'En el Dashboard verás la tarjeta del Código QR. Haz clic en el botón "Proyectar en pantalla completa" o haz doble clic en el QR para activar el modo pantalla completa. Perfecto para TVs o proyectores en tu local.',
  },
  {
    question: '¿Puedo bloquear géneros o contenido explícito?',
    answer:
      'Sí. En la sección de Configuración puedes agregar géneros a la Lista Negra para bloquearlos automáticamente. También hay un toggle para filtrar contenido explícito de Spotify. Los invitados recibirán un mensaje de error si intentan pedir canciones bloqueadas.',
  },
  {
    question: '¿Qué diferencia hay entre Modo Fiesta y Modo Comercial?',
    answer:
      'En Modo Fiesta los invitados pueden poner un apodo opcional. En Modo Comercial el número de mesa es obligatorio para identificar de dónde vienen las peticiones. Útil para bares y restaurantes donde el DJ necesita saber la ubicación del cliente.',
  },
];

export default function SupportPage() {
  const whatsappUrl = 'https://wa.me/1234567890?text=Hola,%20necesito%20ayuda%20con%20Envairo';

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <HelpCircle size={22} className="text-accent" /> Soporte y Ayuda
        </h1>
        <p className="text-text-muted text-sm mt-1">Resolvemos todas tus dudas sobre Envairo</p>
      </div>

      {/* FAQ Accordion */}
      <section>
        <h2 className="font-bold text-text-primary mb-4">Preguntas Frecuentes</h2>
        <Accordion items={FAQS} />
      </section>

      {/* WhatsApp Contact */}
      <section className="card p-6 border border-green-500/20 bg-green-500/5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)' }}>
            {/* WhatsApp SVG */}
            <svg viewBox="0 0 24 24" width="24" height="24" fill="white">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-text-primary mb-1">¿Necesitas ayuda directa?</h3>
            <p className="text-text-muted text-sm mb-4">
              Nuestro equipo de soporte está disponible en WhatsApp para resolver cualquier problema en tiempo real.
            </p>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-white transition-all duration-200 active:scale-95"
              style={{
                background: 'linear-gradient(135deg, #25D366, #128C7E)',
                boxShadow: '0 4px 16px rgba(37,211,102,0.3)',
              }}
            >
              <MessageCircle size={18} />
              Contactar por WhatsApp
              <ExternalLink size={14} className="opacity-70" />
            </a>
          </div>
        </div>
      </section>

      {/* Version info */}
      <div className="text-center text-xs text-text-subtle pt-2">
        Envairo v1.0.0 · Construido con ❤️ y Spotify Premium
      </div>
    </div>
  );
}
