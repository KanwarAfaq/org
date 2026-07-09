import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight checks instantly
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // 1. Grab the target user and message from React
    const { target_user_id, heading, message } = await req.json()

    // 2. Grab your secret OneSignal keys securely from Supabase
    const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID')
    const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY')

    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
       throw new Error("Missing OneSignal environment variables in Supabase!")
    }

    // 3. Fire the push notification using OneSignal's API
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        include_aliases: {
          external_id: [target_user_id] // This perfectly matches the OneSignal.login() in your App.jsx!
        },
        target_channel: "push",
        headings: { en: heading },
        contents: { en: message },
      }),
    })

    const data = await response.json()

    // 4. Tell React it was successful
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
    
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})