import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { App as NativeApp } from '@capacitor/app'
import { supabase } from './supabaseClient'

CapacitorUpdater.notifyAppReady({ channel: "production" });

// 🚀 Intercept custom deep links coming back from mobile Google Browser login
NativeApp.addListener('appUrlOpen', async (event) => {
  if (event.url.includes('orgapp://')) {
    // Convert deep link hash syntax into readable URL parameters
    const cleanUrl = event.url.replace('orgapp://', 'https://');
    const urlObj = new URL(cleanUrl);
    
    // Parse out OAuth tokens sent by Supabase
    const hashParams = new URLSearchParams(urlObj.hash.substring(1));
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');

    if (accessToken && refreshToken) {
      // Force session directly into local Supabase instance state memory
      await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });
      
      // Redirect to app home screen path inside routing matrix
      window.location.hash = '#/';
    }
  }
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)