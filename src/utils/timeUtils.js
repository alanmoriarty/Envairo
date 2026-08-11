/**
 * timeUtils.js
 * Utilería para obtener una hora confiable que no dependa del reloj local del dispositivo,
 * previniendo que los usuarios modifiquen la hora de su sistema para burlar límites y cooldowns.
 */

// Caché de la diferencia de tiempo entre el servidor y el cliente (en ms)
let timeOffset = null;

export async function getSecureServerTime() {
  try {
    // Si ya calculamos el offset, lo usamos para no hacer una petición HTTP cada vez
    if (timeOffset !== null) {
      return Date.now() + timeOffset;
    }

    // Hacemos una petición HEAD a nuestro propio dominio (es rápido y no consume API externa)
    const start = Date.now();
    const response = await fetch(window.location.origin, { method: 'HEAD', cache: 'no-store' });
    const dateHeader = response.headers.get('date');
    
    if (dateHeader) {
      const serverTime = new Date(dateHeader).getTime();
      const end = Date.now();
      
      // La latencia estimada es la mitad del tiempo de la petición
      const latency = (end - start) / 2; 
      const estimatedServerTimeNow = serverTime + latency;
      
      // Guardamos la diferencia entre el servidor y el cliente
      timeOffset = estimatedServerTimeNow - end;
      
      return Date.now() + timeOffset;
    }
    
    return Date.now(); // Fallback si no hay cabecera 'date'
  } catch (error) {
    console.warn("Failed to get secure server time, falling back to local time", error);
    return Date.now();
  }
}

/**
 * Obtiene la fecha actual (formato YYYY-MM-DD) basada en la hora segura del servidor,
 * útil para límites diarios.
 */
export async function getSecureServerDateString() {
  const timestamp = await getSecureServerTime();
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
