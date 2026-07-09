import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// 🛡️ Global CORS Headers allowed by browsers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 1. Handle browser preflight checks
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json() 
    console.log("📥 Raw Incoming Payload:", JSON.stringify(body))
    
    // Unify extraction whether it comes from a webhook or direct fetch
    const data = body.record ? body.record : body;

    // 🔄 FIXED: Mapping to your actual frontend property keys!
    const verifierId = data.target_user_id || data.verifier_id 
    const workflowTitle = data.heading || data.title || "New Task"
    const customMessage = data.message || `You have been assigned a new verification task.`

    // Robust validation
    if (!verifierId) {
      throw new Error("Validation Error: Neither 'target_user_id' nor 'verifier_id' was found in the payload.")
    }

    const restApiKey = Deno.env.get("ONESIGNAL_REST_API_KEY")
    if (!restApiKey) {
      throw new Error("Environment Error: 'ONESIGNAL_REST_API_KEY' is missing in secrets.")
    }

    // Send request to OneSignal
    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": `Basic ${restApiKey}` 
      },
      body: JSON.stringify({
        app_id: "b572881a-d9f6-4c75-a6c1-84a815108921",
        headings: { "en": workflowTitle }, // 📋 Displays: "New Workflow Assigned 📋"
        contents: { "en": customMessage },  // 💬 Displays the custom message with request details
        filters: [
          { "field": "tag", "key": "user_id", "relation": "=", "value": verifierId }
        ]
      }),
    })

    const result = await response.json()
    console.log("🚀 OneSignal API Response:", JSON.stringify(result))
    
    return new Response(JSON.stringify({ success: true, onesignal: result }), { 
      status: 200, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    })

  } catch (error) {
    // ... keep your existing catch block headers identical
    console.error("❌ Function Error Log:", error.message)
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 400, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    })
  }
})