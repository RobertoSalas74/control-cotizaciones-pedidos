// leer-documento-cp v1.0
// Recibe un PDF o foto (base64) de cotización, OC, guía o factura y devuelve JSON.
// La clave de Anthropic se lee de la tabla config_secreta (misma que usa leer-documento).

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const BASE = 'Documento comercial peruano. REGLA ABSOLUTA: NUNCA inventes datos. Si un campo no se lee con claridad o no aparece, pon null. Responde UNICAMENTE con un JSON valido, sin texto adicional y sin markdown. Fechas en formato YYYY-MM-DD. Montos como numero sin simbolos ni comas. moneda: "PEN" para soles, "USD" para dolares.';

const PROMPTS: Record<string, string> = {
  cotizacion: 'Es una COTIZACION de un proveedor. ' + BASE +
    '\n{"proveedor": "razon social del proveedor que cotiza (NO el cliente Sodexo/Kimberly-Clark)", "ruc": "RUC de 11 digitos del proveedor", "numero": "numero de cotizacion", "fecha": "fecha de emision", "validez_dias": numero de dias de validez de la oferta o null, "validez_hasta": "fecha limite de validez si figura explicita, o null", "moneda": "PEN o USD", "total": monto TOTAL final (con IGV si lo incluye), "items": [{"codigo": "codigo del item o null", "descripcion": "descripcion completa", "cantidad": numero, "unidad": "unidad o null", "precio_unitario": numero, "total": numero}]}\nIncluye TODOS los items del documento.',
  oc: 'Es una ORDEN DE COMPRA. ' + BASE +
    '\n{"numero": "numero de la orden de compra", "proveedor": "razon social del proveedor", "fecha": "fecha de emision", "fecha_entrega": "fecha de entrega pactada o null", "moneda": "PEN o USD", "total": monto total}',
  guia: 'Es una GUIA DE REMISION. ' + BASE +
    '\n{"numero": "serie-numero exacto de la guia", "proveedor": "razon social del remitente", "fecha": "fecha de emision o traslado", "moneda": null, "total": null}',
  factura: 'Es una FACTURA. ' + BASE +
    '\n{"numero": "serie-numero EXACTO, sin omitir letras (ej. F001-00045)", "proveedor": "razon social del emisor", "fecha": "fecha de emision", "moneda": "PEN o USD", "total": importe total final}',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { fileBase64, mimeType, tipoDoc } = await req.json();
    if (!fileBase64) return json({ error: 'Falta el archivo' }, 400);
    const prompt = PROMPTS[tipoDoc];
    if (!prompt) return json({ error: 'Tipo de documento no válido: ' + tipoDoc }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: secreto, error: errSecreto } = await admin
      .from('config_secreta').select('valor').eq('nombre', 'anthropic_api_key').single();
    if (errSecreto || !secreto) return json({ error: 'No se pudo obtener la clave de IA' }, 500);

    const esPdf = (mimeType || '').includes('pdf');
    const bloque = esPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } }
      : { type: 'image', source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: fileBase64 } };

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': secreto.valor,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        messages: [{ role: 'user', content: [bloque, { type: 'text', text: prompt }] }],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('Error IA:', JSON.stringify(data));
      return json({ error: 'Error de la IA: ' + (data?.error?.message || res.status) }, 500);
    }

    const texto = data.content?.map((c: { text?: string }) => c.text || '').join('') || '{}';
    try {
      const m = texto.match(/\{[\s\S]*\}/);
      return json(JSON.parse(m ? m[0] : texto));
    } catch {
      return json({ error: 'No se pudo interpretar la respuesta', raw: texto }, 500);
    }
  } catch (err) {
    console.error('Error general:', (err as Error).message);
    return json({ error: (err as Error).message }, 500);
  }
});
