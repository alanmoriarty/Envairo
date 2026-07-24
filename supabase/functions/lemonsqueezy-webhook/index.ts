import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

// Obtener las claves de entorno de Supabase
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// Secreto para verificar la firma de Lemon Squeezy (lo configuras en LS y en Supabase Secrets)
const webhookSecret = Deno.env.get('LEMON_SQUEEZY_WEBHOOK_SECRET')!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const signature = req.headers.get('X-Signature')
    const rawBody = await req.text()

    if (!signature) {
      return new Response('Missing signature', { status: 401 })
    }

    // Opcional pero altamente recomendado: Verificar la firma (Signature) aquí
    // usando HMAC-SHA256 con webhookSecret.
    
    // Parsear el cuerpo de la petición
    const body = JSON.parse(rawBody)

    const eventName = body.meta.event_name
    const customData = body.meta.custom_data
    const userId = customData?.user_id

    console.log(`Recibido evento ${eventName} para usuario: ${userId}`)

    if (!userId) {
      return new Response('Sin user_id en los datos personalizados', { status: 400 })
    }

    if (eventName === 'subscription_created' || eventName === 'subscription_updated') {
      const subscriptionId = body.data.id
      const status = body.data.attributes.status // active, past_due, unpaid, canceled, expired
      
      // Upsert a la tabla de suscripciones
      const { error } = await supabase
        .from('subscriptions')
        .upsert({
          user_id: userId,
          ls_subscription_id: subscriptionId,
          status: status,
          product_id: body.data.attributes.product_id,
          variant_id: body.data.attributes.variant_id,
          renews_at: body.data.attributes.renews_at,
          updated_at: new Date().toISOString()
        })

      if (error) throw error
    } else if (eventName === 'subscription_cancelled' || eventName === 'subscription_expired') {
      const subscriptionId = body.data.id
      
      const { error } = await supabase
        .from('subscriptions')
        .update({
          status: body.data.attributes.status,
          updated_at: new Date().toISOString()
        })
        .eq('ls_subscription_id', subscriptionId)

      if (error) throw error
    }

    return new Response(JSON.stringify({ message: 'Webhook procesado' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (err) {
    console.error('Error procesando webhook:', err)
    return new Response(String(err?.message ?? err), { status: 500 })
  }
})
