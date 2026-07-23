/**
 * Sanitiza y valida prompts de envAIro (Selector y Filter) y URLs para prevenir:
 * 1. Inyección SQL (bloqueo de palabras clave peligrosas y comentarios SQL).
 * 2. Inyección de Script / XSS (<script>, tags HTML, esquemas javascript:).
 * 3. Inyección de Instrucciones de IA (Intentos de override como "Ignore previous instructions", "System:").
 * 4. Límite de longitud (máximo 300 caracteres).
 */

export const MAX_PROMPT_LENGTH = 300;
export const MAX_URL_LENGTH = 300;

export function sanitizePrompt(text) {
  if (!text || typeof text !== 'string') return '';

  let cleaned = text;

  // 1. Truncar a la longitud máxima de 300 caracteres
  if (cleaned.length > MAX_PROMPT_LENGTH) {
    cleaned = cleaned.slice(0, MAX_PROMPT_LENGTH);
  }

  // 2. Eliminar etiquetas HTML/XML (evita XSS)
  cleaned = cleaned.replace(/<[^>]*>?/gm, '');

  // 3. Eliminar secuencias y palabras clave peligrosas de Inyección SQL
  const sqlPatterns = [
    /--/g,
    /\/\*[\s\S]*?\*\//g,
    /\b(UNION\s+ALL\s+SELECT|UNION\s+SELECT|SELECT\s+[\s\S]*?\s+FROM|INSERT\s+INTO|DELETE\s+FROM|DROP\s+TABLE|DROP\s+DATABASE|ALTER\s+TABLE|TRUNCATE\s+TABLE|EXEC\s*\(|EXECUTE\b|xp_\w+)/gi,
    /\bOR\s+['"]?1['"]?\s*=\s*['"]?1/gi,
    /\bAND\s+['"]?1['"]?\s*=\s*['"]?1/gi
  ];

  sqlPatterns.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });

  // 4. Prevenir desbordamiento y caracteres de inyección de comandos/prompts de IA
  const promptInjectionPatterns = [
    /\b(ignore\s+all\s+previous\s+instructions|ignore\s+previous\s+instructions|system\s*:|\[system\]|you\s+are\s+now\s+a)\b/gi
  ];

  promptInjectionPatterns.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });

  // 5. Eliminar comillas simples y barra invertida que puedan alterar sintaxis SQL de Supabase
  cleaned = cleaned.replace(/['\\]/g, '');

  return cleaned;
}

export function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return '';

  let cleaned = url.trim();

  // 1. Truncar a 300 caracteres
  if (cleaned.length > MAX_URL_LENGTH) {
    cleaned = cleaned.slice(0, MAX_URL_LENGTH);
  }

  // 2. Prevenir esquemas de protocolo peligrosos (javascript:, data:, vbscript:, file:)
  if (/^(javascript|data|vbscript|file):/i.test(cleaned)) {
    return '';
  }

  // 3. Eliminar etiquetas HTML/XML
  cleaned = cleaned.replace(/<[^>]*>?/gm, '');

  // 4. Eliminar secuencias de inyección SQL en la URL
  const sqlPatterns = [
    /--/g,
    /\/\*[\s\S]*?\*\//g,
    /\b(UNION\s+ALL\s+SELECT|UNION\s+SELECT|SELECT\s+[\s\S]*?\s+FROM|INSERT\s+INTO|DELETE\s+FROM|DROP\s+TABLE|DROP\s+DATABASE|ALTER\s+TABLE|TRUNCATE\s+TABLE|EXEC\s*\(|EXECUTE\b)/gi,
    /\bOR\s+['"]?1['"]?\s*=\s*['"]?1/gi
  ];

  sqlPatterns.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });

  // 5. Eliminar comillas y caracteres de escape peligrosos
  cleaned = cleaned.replace(/['"\\]/g, '');

  return cleaned.trim();
}
