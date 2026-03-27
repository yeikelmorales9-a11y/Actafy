// Supabase Edge Function — Wompi Webhook
// Recibe eventos de Wompi, verifica checksum y actualiza plan del usuario

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Verifica el checksum de Wompi
// https://docs.wompi.co/docs/en/widget#checking-transaction-integrity
async function verifyChecksum(
  properties: string[],
  values: Record<string, string>,
  checksum: string,
  integrityKey: string,
): Promise<boolean> {
  try {
    const chain = properties.map((p) => values[p]).join('') + integrityKey
    const encoded = new TextEncoder().encode(chain)
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoded)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const computed = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
    return computed === checksum
  } catch {
    return false
  }
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { event, data, signature } = body

    console.log('Wompi webhook recibido:', event)

    // Solo procesar transacciones aprobadas
    if (event !== 'transaction.updated') {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const tx = data?.transaction
    if (!tx || tx.status !== 'APPROVED') {
      return new Response(JSON.stringify({ ok: true, status: tx?.status }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verificar integridad del webhook
    const integrityKey = Deno.env.get('WOMPI_INTEGRITY_KEY') ?? ''
    if (integrityKey && signature) {
      const values: Record<string, string> = {
        'transaction.id':                    tx.id,
        'transaction.status':                tx.status,
        'transaction.amount_in_cents':       String(tx.amount_in_cents),
        'transaction.currency':              tx.currency,
      }
      const valid = await verifyChecksum(signature.properties, values, signature.checksum, integrityKey)
      if (!valid) {
        console.error('Checksum inválido — posible intento de fraude')
        return new Response(JSON.stringify({ error: 'invalid signature' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Extraer userId desde la referencia: "actafy-pro-{userId}"
    const reference: string = tx.reference ?? ''
    const match = reference.match(/^actafy-pro-(.+)$/)
    if (!match) {
      console.log('Referencia no reconocida:', reference)
      return new Response(JSON.stringify({ ok: true, skipped: 'ref' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const userId = match[1]

    // Actualizar plan en Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { error } = await supabase
      .from('perfiles')
      .upsert({ id: userId, plan: 'pro' }, { onConflict: 'id' })

    if (error) {
      console.error('Error actualizando plan:', error.message)
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`Plan actualizado a PRO para usuario: ${userId}`)
    return new Response(JSON.stringify({ ok: true, userId, plan: 'pro' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Error procesando webhook:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
