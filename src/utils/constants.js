/**
 * Lista centralizada de correos con acceso a la Beta y funciones especiales.
 */
export const ALLOWED_EMAILS = [
  'aliriopina04@gmail.com',
  'aliriopina05@gmail.com',
  'javiercardonaaudiovisual@gmail.com',
  'alextascvers@gmail.com',
  'bernabeite@gmail.com',
  'camiloardila.1803@gmail.com',
  'julian.10barrera@gmail.com',
  'verotorrenegra@gmail.com'
];

/**
 * Función auxiliar para verificar si un correo está permitido (case-insensitive)
 */
export function isAllowedEmail(email) {
  if (!email) return false;
  const cleanEmail = email.toLowerCase().trim();
  return ALLOWED_EMAILS.some(allowed => allowed.toLowerCase().trim() === cleanEmail);
}
