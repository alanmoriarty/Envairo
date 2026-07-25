import React from 'react';
import { Link } from 'react-router-dom';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-bg-base text-text-primary p-8 md:p-12 overflow-y-auto">
      <div className="max-w-3xl mx-auto space-y-8">
        <Link to="/" className="text-primary hover:underline">&larr; Volver al inicio</Link>

        <h1 className="text-4xl font-bold">Términos y Condiciones</h1>
        <p className="text-text-secondary">Última actualización: {new Date().toLocaleDateString()}</p>

        <div className="space-y-6 text-lg leading-relaxed">
          <section>
            <h2 className="text-2xl font-semibold mb-3">1. Aceptación de los Términos</h2>
            <p>
              Al acceder y utilizar envAIro, aceptas estar sujeto a estos Términos y Condiciones. Si no estás de acuerdo con alguna parte de estos términos, no podrás acceder al servicio.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">2. Descripción del Servicio</h2>
            <p>
              envAIro es una rockola social impulsada por IA, que permite a los usuarios realizar peticiones de música en tiempo real.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">3. Uso Aceptable</h2>
            <p>
              Como usuario de envAIro, te comprometes a:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-text-secondary">
              <li>No utilizar la plataforma para ningún propósito ilegal o no autorizado.</li>
              <li>No intentar vulnerar, hackear o interrumpir el funcionamiento del servicio.</li>
              <li>Respetar los derechos de autor de las obras musicales reproducidas a través de la plataforma.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">4. Integraciones de Terceros</h2>
            <p>
              Nuestra plataforma interactúa con servicios de terceros. Al usar envAIro, también aceptas los Términos de Servicio de:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-text-secondary">
              <li><a href="https://www.apple.com/legal/internet-services/itunes/es/terms.html" target="_blank" rel="noreferrer" className="text-primary hover:underline">iTunes</a></li>
              <li><a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer" className="text-primary hover:underline">YouTube</a></li>
              <li><a href="https://www.deezer.com/legal/terms-and-conditions" target="_blank" rel="noreferrer" className="text-primary hover:underline">Deezer</a></li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">5. Modificaciones del Servicio</h2>
            <p>
              Nos reservamos el derecho de modificar, suspender o discontinuar el servicio (o cualquier parte de él) en cualquier momento, con o sin previo aviso.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">6. Limitación de Responsabilidad</h2>
            <p>
              envAIro se proporciona "tal cual" sin garantías de ningún tipo. No somos responsables de interrupciones del servicio, pérdida de datos o problemas derivados de las plataformas de terceros utilizadas.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
