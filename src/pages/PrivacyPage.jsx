import React from 'react';
import { Link } from 'react-router-dom';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-bg-base text-text-primary p-8 md:p-12 overflow-y-auto">
      <div className="max-w-3xl mx-auto space-y-8">
        <Link to="/" className="text-primary hover:underline">&larr; Volver al inicio</Link>
        
        <h1 className="text-4xl font-bold">Política de Privacidad</h1>
        <p className="text-text-secondary">Última actualización: {new Date().toLocaleDateString()}</p>
        
        <div className="space-y-6 text-lg leading-relaxed">
          <section>
            <h2 className="text-2xl font-semibold mb-3">1. Información que recopilamos</h2>
            <p>
              EnvAIro recopila información básica de tu perfil público de Spotify o Google (nombre, imagen de perfil y correo electrónico) únicamente para mostrar tu identidad dentro de las sesiones colaborativas y permitirte buscar y agregar canciones.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">2. Uso de la información</h2>
            <p>
              La información obtenida se utiliza de forma exclusiva para:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-text-secondary">
              <li>Permitirte crear y unirte a salas de música colaborativas.</li>
              <li>Gestionar la cola de reproducción en tiempo real.</li>
              <li>Mostrar tu foto de perfil junto a las canciones que sugieres.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">3. Almacenamiento y Protección</h2>
            <p>
              No almacenamos contraseñas de Spotify ni de Google. El inicio de sesión se realiza directamente a través de los proveedores oficiales (OAuth 2.0). Los tokens de acceso se almacenan temporalmente y de forma segura, y nunca son compartidos con terceros.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">4. Derechos del usuario</h2>
            <p>
              Puedes revocar el acceso de EnvAIro a tu cuenta de Spotify o Google en cualquier momento desde el panel de aplicaciones de terceros de tu respectiva cuenta. Al hacerlo, EnvAIro perderá inmediatamente el acceso a tu cuenta.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">5. Uso de YouTube API</h2>
            <p>
              Esta aplicación utiliza servicios de la API de YouTube para la búsqueda y reproducción de contenido. Al utilizar esta aplicación, aceptas estar sujeto a los <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer" className="text-primary hover:underline">Términos de Servicio de YouTube</a> y a la <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer" className="text-primary hover:underline">Política de Privacidad de Google</a>.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">6. Contacto</h2>
            <p>
              Si tienes alguna duda sobre nuestra política de privacidad o sobre el manejo de tus datos, puedes contactar al administrador del sistema.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
