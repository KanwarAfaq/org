import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

// 🛡️ Pure, Native Signature Generator
async function generateSignature(path: string, apiSecret: string) {
  const toSign = `${path}${apiSecret}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(toSign);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const base64String = btoa(String.fromCharCode.apply(null, hashArray));
  return base64String.replace(/\+/g, '-').replace(/\//g, '_').substring(0, 8);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders, status: 200 });

  try {
    const { paths_to_sign } = await req.json();
    const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET');

    if (!apiSecret) throw new Error("Missing Cloudinary API Secret in Supabase!");

    // Generate signatures for all requested images
    const signatures = await Promise.all(
      paths_to_sign.map((path: string) => { 
        console.log("Signing path:", path);
        return generateSignature(path, apiSecret); })
    );

    return new Response(JSON.stringify({ signatures }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: corsHeaders });
  }
})