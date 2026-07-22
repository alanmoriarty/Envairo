// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

export default {
  async fetch(req: Request) {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
    }

    try {
      const payload = await req.json();
      
      const userEmail = payload.user?.email;
      const emailActionType = payload.email_data?.email_action_type; 
      const token = payload.email_data?.token; 
      const redirect_to = payload.email_data?.redirect_to;
      const site_url = payload.email_data?.site_url;
      const token_hash = payload.email_data?.token_hash;

      if (!userEmail || !RESEND_API_KEY) {
        throw new Error("Missing user data or RESEND_API_KEY");
      }

      // CAMBIA ESTE CORREO por el que tienes verificado en Resend
      const senderEmail = "envAIro <noreply@envairoqr.com>";

      let subject = "Bienvenido a envAIro";
      let html = "";
      
      const actionLink = `${site_url}/auth/v1/verify?token=${token_hash}&type=${emailActionType}&redirect_to=${encodeURIComponent(redirect_to)}`;

      if (emailActionType === "signup") {
        subject = "¡Bienvenido a la fiesta! Confirma tu cuenta 🎉";
        html = \`<!DOCTYPE html><html><body style="margin: 0; padding: 40px; background-color: #0F0F13; font-family: sans-serif; color: #ffffff; text-align: center;"><img src="https://envairoqr.com/envAIro-logo-horizontal.png" width="180" /><h2 style="margin-top: 20px;">¡Bienvenido a la fiesta! 🎉</h2><p>Confirma tu correo para activar tu cuenta de Anfitrión.</p><a href="\${actionLink}" style="display: inline-block; padding: 16px 32px; background-color: #9D4EDD; color: #ffffff; text-decoration: none; border-radius: 12px; font-weight: bold; margin-top: 20px;">Confirmar mi correo</a><p style="margin-top: 20px; color: #6B687D;">Tu código temporal: \${token}</p></body></html>\`;
      } else if (emailActionType === "recovery") {
        subject = "Recupera tu contraseña en envAIro 🔒";
        html = \`<!DOCTYPE html><html><body style="margin: 0; padding: 40px; background-color: #0F0F13; font-family: sans-serif; color: #ffffff; text-align: center;"><img src="https://envairoqr.com/envAIro-logo-horizontal.png" width="180" /><h2 style="margin-top: 20px;">Restablecer Contraseña</h2><p>Haz clic en el botón de abajo para establecer una nueva contraseña.</p><a href="\${actionLink}" style="display: inline-block; padding: 16px 32px; background-color: #9D4EDD; color: #ffffff; text-decoration: none; border-radius: 12px; font-weight: bold; margin-top: 20px;">Restablecer contraseña</a><p style="margin-top: 20px; color: #6B687D;">Tu código temporal: \${token}</p></body></html>\`;
      } else {
        html = \`<p>Tu código de seguridad para envAIro es: <strong>\${token}</strong></p>\`;
      }

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": \`Bearer \${RESEND_API_KEY}\`,
        },
        body: JSON.stringify({
          from: senderEmail,
          to: userEmail,
          subject: subject,
          html: html,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("Resend Error:", errorText);
        throw new Error("Failed to send email");
      }

      return new Response(JSON.stringify({ message: "Email sent" }), { status: 200 });

    } catch (err: any) {
      console.error("Hook Error:", err.message);
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  },
};
